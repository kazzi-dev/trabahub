import { and, asc, eq, isNotNull, isNull, lte, lt, or } from "drizzle-orm";

import type { Db } from "../db/client.js";
import { jobs, users } from "../db/schema.js";
import type { Email, EmailSender } from "../email/sender.js";

const HOUR = 3_600_000;
// The scheduler runs once a day; this keeps a retried run from emailing anyone twice.
const MIN_HOURS_BETWEEN_DIGESTS = 20;

export interface DueJob {
  title: string;
  company: string;
  followUpAt: Date;
  url: string | null;
}

export interface DigestResult {
  sent: number;
  failed: number;
}

/** Applied jobs whose follow-up date has arrived, grouped by user, for users who want emails. */
export async function findDueDigests(db: Db, now: Date) {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      title: jobs.title,
      company: jobs.company,
      followUpAt: jobs.followUpAt,
      url: jobs.url,
    })
    .from(jobs)
    .innerJoin(users, eq(users.id, jobs.userId))
    .where(
      and(
        eq(jobs.status, "applied"),
        isNotNull(jobs.followUpAt),
        lte(jobs.followUpAt, now),
        eq(users.emailDigest, true),
        eq(users.isDemo, false),
        isNotNull(users.email),
        or(isNull(users.lastDigestAt), lt(users.lastDigestAt, new Date(now.getTime() - MIN_HOURS_BETWEEN_DIGESTS * HOUR))),
      ),
    )
    .orderBy(asc(jobs.followUpAt));

  const byUser = new Map<string, { email: string; name: string | null; jobs: DueJob[] }>();
  for (const r of rows) {
    const entry = byUser.get(r.userId) ?? { email: r.email!, name: r.name, jobs: [] };
    entry.jobs.push({ title: r.title, company: r.company, followUpAt: r.followUpAt!, url: r.url });
    byUser.set(r.userId, entry);
  }
  return byUser;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function overdueText(followUpAt: Date, now: Date): string {
  const days = Math.floor((now.getTime() - followUpAt.getTime()) / (24 * HOUR));
  return days <= 0 ? "due today" : `${days} day${days === 1 ? "" : "s"} overdue`;
}

export function renderDigest(name: string | null, due: DueJob[], webUrl: string, now: Date): Omit<Email, "to"> {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  const count = `${due.length} application${due.length === 1 ? "" : "s"}`;
  const lines = due.map((j) => `- ${j.title} at ${j.company} (${overdueText(j.followUpAt, now)})`);
  const items = due
    .map((j) => {
      const label = `<strong>${escapeHtml(j.title)}</strong> at ${escapeHtml(j.company)}`;
      const linked = j.url ? `<a href="${escapeHtml(j.url)}">${label}</a>` : label;
      return `<li>${linked} <span style="color:#a16207">(${overdueText(j.followUpAt, now)})</span></li>`;
    })
    .join("");
  const board = `${webUrl.replace(/\/$/, "")}/board`;
  return {
    subject: `Time to follow up on ${count}`,
    text: `${greeting}\n\nThese are ready for a follow-up:\n${lines.join("\n")}\n\nOpen your board: ${board}\n\nTurn these emails off anytime in TrabaHub.`,
    html: `<p>${escapeHtml(greeting)}</p><p>These are ready for a follow-up:</p><ul>${items}</ul><p><a href="${board}">Open your board</a></p><p style="color:#71717a;font-size:12px">You can turn these emails off anytime in TrabaHub.</p>`,
  };
}

/** Sends one digest per user. A failure for one user doesn't stop the others. */
export async function sendDigests(db: Db, sender: EmailSender, webUrl: string, now = new Date()): Promise<DigestResult> {
  const result: DigestResult = { sent: 0, failed: 0 };
  for (const [userId, entry] of await findDueDigests(db, now)) {
    try {
      await sender.send({ to: entry.email, ...renderDigest(entry.name, entry.jobs, webUrl, now) });
      await db.update(users).set({ lastDigestAt: now }).where(eq(users.id, userId));
      result.sent++;
    } catch (err) {
      console.error(`digest for ${userId} failed`, err);
      result.failed++;
    }
  }
  return result;
}
