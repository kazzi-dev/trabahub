import {
  createInviteSchema,
  createOrganizationSchema,
  updateMemberSchema,
  type Invite,
  type InvitePreview,
  type JobList,
  type JobStatus,
  type Member,
  type Organization,
  type Role,
} from "@trabahub/shared";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { randomToken, sha256 } from "../auth/tokens.js";
import type { Db } from "../db/client.js";
import { invites, jobs, memberships, organizations, users } from "../db/schema.js";
import { HttpError, notFound } from "../errors.js";
import { toJob } from "../jobs/routes.js";
import { can, canChangeRole, canRemove, type Action } from "./permissions.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      orgId: string;
      role: Role;
    }
  }
}

const INVITE_TTL_DAYS = 7;
const uuid = z.string().uuid();
const forbidden = (detail: string) => new HttpError(403, "Forbidden", detail);

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export function orgsRouter(db: Db): Router {
  const router = Router();

  /** Loads the caller's membership; non-members get 404 so organizations can't be probed. */
  const member: RequestHandler = async (req, res, next) => {
    const orgId = String(req.params.orgId);
    if (!uuid.safeParse(orgId).success) throw notFound("Organization");
    const [m] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, res.locals.userId)))
      .limit(1);
    if (!m) throw notFound("Organization");
    res.locals.orgId = orgId;
    res.locals.role = m.role;
    next();
  };

  const allow =
    (action: Action): RequestHandler =>
    (_req, res, next) => {
      if (!can(res.locals.role, action)) throw forbidden(`Your role (${res.locals.role}) can't do this`);
      next();
    };

  router.get("/", async (_req, res) => {
    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.userId, res.locals.userId))
      .orderBy(asc(organizations.name));
    const counts = await memberCounts(db, rows.map((r) => r.id));
    const body: Organization[] = rows.map((r) => ({
      ...r,
      memberCount: counts.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
    }));
    res.json(body);
  });

  router.post("/", async (req, res) => {
    const { name } = createOrganizationSchema.parse(req.body);
    const org = await db.transaction(async (tx) => {
      const [created] = await tx.insert(organizations).values({ name, slug: slugify(name) }).returning();
      await tx
        .insert(memberships)
        .values({ organizationId: created!.id, userId: res.locals.userId, role: "owner" });
      return created!;
    });
    const body: Organization = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: "owner",
      memberCount: 1,
      createdAt: org.createdAt.toISOString(),
    };
    res.status(201).location(`/v1/orgs/${org.id}`).json(body);
  });

  router.get("/:orgId", member, allow("org.view"), async (_req, res) => {
    res.json(await loadOrg(db, res.locals.orgId, res.locals.role));
  });

  router.patch("/:orgId", member, allow("org.rename"), async (req, res) => {
    const { name } = createOrganizationSchema.parse(req.body);
    await db.update(organizations).set({ name }).where(eq(organizations.id, res.locals.orgId));
    res.json(await loadOrg(db, res.locals.orgId, res.locals.role));
  });

  router.delete("/:orgId", member, allow("org.delete"), async (_req, res) => {
    await db.delete(organizations).where(eq(organizations.id, res.locals.orgId));
    res.status(204).end();
  });

  router.get("/:orgId/members", member, allow("org.view"), async (_req, res) => {
    const rows = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, res.locals.orgId))
      .orderBy(asc(memberships.createdAt));

    // Coaches, admins and owners also see each person's pipeline at a glance.
    const counts = can(res.locals.role, "pipelines.view")
      ? await statusCounts(db, rows.map((r) => r.userId))
      : null;
    const body: Member[] = rows.map((r) => ({
      ...r,
      // Only people who can manage the org see email addresses.
      email: can(res.locals.role, "members.manage") || r.userId === res.locals.userId ? r.email : null,
      joinedAt: r.joinedAt.toISOString(),
      ...(counts ? { statusCounts: counts.get(r.userId) ?? emptyCounts() } : {}),
    }));
    res.json(body);
  });

  router.patch("/:orgId/members/:userId", member, async (req, res) => {
    const { role: to } = updateMemberSchema.parse(req.body);
    const target = await targetMembership(db, res.locals.orgId, String(req.params.userId));
    if (!canChangeRole(res.locals.role, target.role, to)) {
      throw forbidden(`A ${res.locals.role} can't change a ${target.role} to ${to}`);
    }
    if (target.role === "owner" && to !== "owner") await assertAnotherOwner(db, res.locals.orgId);
    await db
      .update(memberships)
      .set({ role: to })
      .where(and(eq(memberships.organizationId, res.locals.orgId), eq(memberships.userId, target.userId)));
    res.json({ userId: target.userId, role: to });
  });

  router.delete("/:orgId/members/:userId", member, async (req, res) => {
    const target = await targetMembership(db, res.locals.orgId, String(req.params.userId));
    const leaving = target.userId === res.locals.userId;
    if (!leaving && !canRemove(res.locals.role, target.role)) {
      throw forbidden(`A ${res.locals.role} can't remove a ${target.role}`);
    }
    if (target.role === "owner") await assertAnotherOwner(db, res.locals.orgId);
    await db
      .delete(memberships)
      .where(and(eq(memberships.organizationId, res.locals.orgId), eq(memberships.userId, target.userId)));
    res.status(204).end();
  });

  router.post("/:orgId/invites", member, allow("invites.create"), async (req, res) => {
    const { role } = createInviteSchema.parse(req.body);
    if (role === "admin" && res.locals.role !== "owner") throw forbidden("Only owners can invite admins");
    const code = randomToken(18);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
    await db.insert(invites).values({
      codeHash: sha256(code),
      organizationId: res.locals.orgId,
      role,
      createdBy: res.locals.userId,
      expiresAt,
    });
    const body: Invite = { code, role, expiresAt: expiresAt.toISOString() };
    res.status(201).json(body);
  });

  // Read-only view of a member's board, for coaches.
  router.get("/:orgId/members/:userId/jobs", member, allow("pipelines.view"), async (req, res) => {
    const target = await targetMembership(db, res.locals.orgId, String(req.params.userId));
    const rows = await db
      .select()
      .from(jobs)
      .where(eq(jobs.userId, target.userId))
      .orderBy(asc(jobs.position));
    const body: JobList = { items: rows.map(toJob), total: rows.length, limit: rows.length, offset: 0 };
    res.json(body);
  });

  return router;
}

/** Invite links: preview who invited you, then accept. Links work for many people until they expire. */
export function invitesRouter(db: Db): Router {
  const router = Router();

  async function findInvite(code: string) {
    const [row] = await db
      .select({ invite: invites, orgName: organizations.name })
      .from(invites)
      .innerJoin(organizations, eq(organizations.id, invites.organizationId))
      .where(eq(invites.codeHash, sha256(code)))
      .limit(1);
    if (!row || row.invite.expiresAt < new Date()) throw notFound("Invite");
    return row;
  }

  router.get("/:code", async (req, res) => {
    const { invite, orgName } = await findInvite(req.params.code);
    const body: InvitePreview = { organizationName: orgName, role: invite.role, expiresAt: invite.expiresAt.toISOString() };
    res.json(body);
  });

  router.post("/:code/accept", async (req, res) => {
    const { invite } = await findInvite(req.params.code);
    const [existing] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.organizationId, invite.organizationId), eq(memberships.userId, res.locals.userId)))
      .limit(1);
    if (!existing) {
      await db
        .insert(memberships)
        .values({ organizationId: invite.organizationId, userId: res.locals.userId, role: invite.role });
    }
    res.status(existing ? 200 : 201).json(await loadOrg(db, invite.organizationId, existing?.role ?? invite.role));
  });

  return router;
}

async function loadOrg(db: Db, orgId: string, role: Role): Promise<Organization> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw notFound("Organization");
  const counts = await memberCounts(db, [orgId]);
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    role,
    memberCount: counts.get(orgId) ?? 0,
    createdAt: org.createdAt.toISOString(),
  };
}

async function memberCounts(db: Db, orgIds: string[]): Promise<Map<string, number>> {
  if (orgIds.length === 0) return new Map();
  const rows = await db
    .select({ orgId: memberships.organizationId, n: count() })
    .from(memberships)
    .where(inArray(memberships.organizationId, orgIds))
    .groupBy(memberships.organizationId);
  return new Map(rows.map((r) => [r.orgId, Number(r.n)]));
}

const emptyCounts = (): Record<JobStatus, number> => ({ saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 });

async function statusCounts(db: Db, userIds: string[]): Promise<Map<string, Record<JobStatus, number>>> {
  const result = new Map<string, Record<JobStatus, number>>();
  if (userIds.length === 0) return result;
  const rows = await db
    .select({ userId: jobs.userId, status: jobs.status, n: sql<number>`count(*)` })
    .from(jobs)
    .where(inArray(jobs.userId, userIds))
    .groupBy(jobs.userId, jobs.status);
  for (const r of rows) {
    const counts = result.get(r.userId) ?? emptyCounts();
    counts[r.status] = Number(r.n);
    result.set(r.userId, counts);
  }
  return result;
}

async function targetMembership(db: Db, orgId: string, userId: string) {
  if (!uuid.safeParse(userId).success) throw notFound("Member");
  const [m] = await db
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (!m) throw notFound("Member");
  return m;
}

/** An organization must always keep at least one owner. */
async function assertAnotherOwner(db: Db, orgId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.organizationId, orgId), eq(memberships.role, "owner")));
  if (Number(row?.n ?? 0) <= 1) {
    throw new HttpError(409, "Conflict", "An organization needs at least one owner; make someone else owner first");
  }
}
