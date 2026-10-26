import {
  createJobSchema,
  listJobsQuerySchema,
  updateJobSchema,
  type Job,
  type JobEvent,
  type JobList,
  type JobStatus,
} from "@trabahub/shared";
import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import type { Db } from "../db/client.js";
import { jobEvents, jobs } from "../db/schema.js";
import { notFound } from "../errors.js";

type JobRow = typeof jobs.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const FOLLOW_UP_DAYS = 7;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const toDate = (s: string | null | undefined) => (s ? new Date(s) : s === null ? null : undefined);

export const toJob = (r: JobRow): Job => ({
  id: r.id,
  title: r.title,
  company: r.company,
  location: r.location,
  salaryText: r.salaryText,
  url: r.url,
  source: r.source,
  status: r.status,
  position: r.position,
  notes: r.notes,
  requirements: r.requirements,
  appliedAt: iso(r.appliedAt),
  followUpAt: iso(r.followUpAt),
  deadline: iso(r.deadline),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const idParam = z.string().uuid();

/** Every query is scoped to the signed-in user, so one user can never read another's jobs. */
export function jobsRouter(db: Db): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const q = listJobsQuerySchema.parse(req.query);
    const userId = res.locals.userId;
    const where = and(
      eq(jobs.userId, userId),
      q.status ? eq(jobs.status, q.status) : undefined,
      q.q ? or(ilike(jobs.title, `%${q.q}%`), ilike(jobs.company, `%${q.q}%`)) : undefined,
    );
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(jobs)
        .where(where)
        .orderBy(asc(jobs.position), desc(jobs.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      db.select({ total: count() }).from(jobs).where(where),
    ]);
    const total = Number(totals[0]?.total ?? 0);
    const body: JobList = { items: rows.map(toJob), total, limit: q.limit, offset: q.offset };
    res.json(body);
  });

  router.post("/", async (req, res) => {
    const input = createJobSchema.parse(req.body);
    const userId = res.locals.userId;
    const job = await db.transaction(async (tx) => {
      // New cards go to the top of their column.
      await tx
        .update(jobs)
        .set({ position: sql`${jobs.position} + 1` })
        .where(and(eq(jobs.userId, userId), eq(jobs.status, input.status)));
      const applied = input.status === "applied" ? appliedDates(null, input.followUpAt) : {};
      const [row] = await tx
        .insert(jobs)
        .values({
          userId,
          title: input.title,
          company: input.company,
          location: input.location ?? null,
          salaryText: input.salaryText ?? null,
          url: input.url ?? null,
          source: input.source ?? null,
          status: input.status,
          position: 0,
          notes: input.notes ?? null,
          requirements: input.requirements,
          followUpAt: toDate(input.followUpAt) ?? null,
          deadline: toDate(input.deadline) ?? null,
          ...applied,
        })
        .returning();
      await tx.insert(jobEvents).values({ jobId: row!.id, type: "created", data: { status: input.status } });
      return row!;
    });
    res.status(201).location(`/v1/jobs/${job.id}`).json(toJob(job));
  });

  router.get("/:id", async (req, res) => {
    res.json(toJob(await getOwned(db, res.locals.userId, req.params.id)));
  });

  router.patch("/:id", async (req, res) => {
    const input = updateJobSchema.parse(req.body);
    const userId = res.locals.userId;
    const updated = await db.transaction(async (tx) => {
      const current = await getOwned(tx, userId, req.params.id);
      const { position, status, followUpAt, deadline, ...fields } = input;
      const statusChanged = status !== undefined && status !== current.status;

      const changes: Partial<typeof jobs.$inferInsert> = {
        ...fields,
        ...(followUpAt !== undefined ? { followUpAt: toDate(followUpAt) } : {}),
        ...(deadline !== undefined ? { deadline: toDate(deadline) } : {}),
        ...(statusChanged ? { status } : {}),
        ...(statusChanged && status === "applied"
          ? appliedDates(current.appliedAt, followUpAt ?? current.followUpAt?.toISOString())
          : {}),
        updatedAt: new Date(),
      };
      await tx.update(jobs).set(changes).where(eq(jobs.id, current.id));

      if (statusChanged || position !== undefined) {
        await placeInColumn(tx, userId, current.id, status ?? current.status, position ?? 0);
      }
      if (statusChanged) {
        await tx
          .insert(jobEvents)
          .values({ jobId: current.id, type: "status_changed", data: { from: current.status, to: status } });
      }
      const edited = Object.keys(fields).concat(followUpAt !== undefined ? ["followUpAt"] : [], deadline !== undefined ? ["deadline"] : []);
      if (edited.length) {
        await tx.insert(jobEvents).values({ jobId: current.id, type: "updated", data: { fields: edited } });
      }
      return getOwned(tx, userId, current.id);
    });
    res.json(toJob(updated));
  });

  router.delete("/:id", async (req, res) => {
    const job = await getOwned(db, res.locals.userId, req.params.id);
    await db.delete(jobs).where(eq(jobs.id, job.id));
    res.status(204).end();
  });

  router.get("/:id/events", async (req, res) => {
    const job = await getOwned(db, res.locals.userId, req.params.id);
    const rows = await db
      .select()
      .from(jobEvents)
      .where(eq(jobEvents.jobId, job.id))
      .orderBy(desc(jobEvents.at));
    const events: JobEvent[] = rows.map((e) => ({ id: e.id, type: e.type, data: e.data, at: e.at.toISOString() }));
    res.json(events);
  });

  return router;
}

async function getOwned(db: Db | Tx, userId: string, id: string): Promise<JobRow> {
  if (!idParam.safeParse(id).success) throw notFound("Job");
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Job");
  return row;
}

/** Moving to "applied" stamps the date and schedules a follow-up reminder, unless already set. */
function appliedDates(appliedAt: Date | null, followUpAt: string | null | undefined) {
  const now = new Date();
  return {
    appliedAt: appliedAt ?? now,
    followUpAt: followUpAt ? new Date(followUpAt) : new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000),
  };
}

/** Puts a job at `index` in its column and renumbers that column 0..n-1. */
async function placeInColumn(tx: Tx, userId: string, jobId: string, status: JobStatus, index: number) {
  const others = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.status, status), ne(jobs.id, jobId)))
    .orderBy(asc(jobs.position), desc(jobs.createdAt));
  const ids = others.map((o) => o.id);
  ids.splice(Math.min(Math.max(index, 0), ids.length), 0, jobId);
  await Promise.all(ids.map((id, position) => tx.update(jobs).set({ position }).where(eq(jobs.id, id))));
}
