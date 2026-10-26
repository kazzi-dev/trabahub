import type { User } from "@trabahub/shared";
import { and, eq, lt } from "drizzle-orm";

import type { Db } from "./db/client.js";
import { accounts, jobs, users } from "./db/schema.js";

type UserRow = typeof users.$inferSelect;

export const toUser = (u: UserRow): User => ({
  id: u.id,
  name: u.name,
  email: u.email,
  image: u.image,
  isDemo: u.isDemo,
});

export async function findUser(db: Db, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export interface OAuthProfile {
  provider: "github" | "google";
  providerAccountId: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Finds the user linked to this provider account, or creates one. Keeps the profile fresh. */
export async function upsertOAuthUser(db: Db, profile: OAuthProfile): Promise<UserRow> {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, profile.provider),
          eq(accounts.providerAccountId, profile.providerAccountId),
        ),
      )
      .limit(1);

    if (link) {
      const [updated] = await tx
        .update(users)
        .set({ name: profile.name, email: profile.email, image: profile.image })
        .where(eq(users.id, link.userId))
        .returning();
      return updated!;
    }

    const [created] = await tx
      .insert(users)
      .values({ name: profile.name, email: profile.email, image: profile.image })
      .returning();
    await tx.insert(accounts).values({
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
      userId: created!.id,
    });
    return created!;
  });
}

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);

/**
 * Creates a fresh demo user with sample jobs, so every visitor gets their own sandbox and
 * can't see or break anyone else's. Demo users older than a day are cleaned up.
 */
export async function createDemoUser(db: Db): Promise<UserRow> {
  await db.delete(users).where(and(eq(users.isDemo, true), lt(users.createdAt, daysFromNow(-1))));

  const [user] = await db
    .insert(users)
    .values({ name: "Demo Job Seeker", email: null, isDemo: true })
    .returning();

  const sample = [
    { title: "Full Stack Web Developer", company: "Bayanihan Digital", location: "Hybrid · Quezon City", salaryText: "₱60,000–₱80,000 / month", status: "saved" as const, requirements: ["TypeScript", "React or Next.js", "Node.js/Express", "PostgreSQL", "AWS or GCP", "Docker"] },
    { title: "Frontend Engineer (React)", company: "Northwind Labs", location: "Remote", salaryText: "$2,000–$2,800 / month", status: "saved" as const, requirements: ["React", "TypeScript", "Testing Library", "Accessibility"] },
    { title: "Backend Developer (Node.js)", company: "Kalye Logistics", location: "Makati", salaryText: null, status: "applied" as const, requirements: ["Node.js", "REST APIs", "MySQL", "Redis"], appliedAt: daysFromNow(-5), followUpAt: daysFromNow(2) },
    { title: "Junior Software Engineer", company: "Lighthouse Health", location: "Remote · APAC", salaryText: null, status: "applied" as const, requirements: ["JavaScript", "Git", "SQL"], appliedAt: daysFromNow(-9), followUpAt: daysFromNow(-2) },
    { title: "Web Developer (Laravel + Vue)", company: "Sari-Sari Commerce", location: "Cebu City", salaryText: "₱45,000 / month", status: "interview" as const, requirements: ["PHP", "Laravel", "Vue", "MySQL"], appliedAt: daysFromNow(-14) },
    { title: "WordPress Developer", company: "Agency Uno", location: "Remote", salaryText: null, status: "rejected" as const, requirements: ["WordPress", "PHP", "Custom plugins"], appliedAt: daysFromNow(-30) },
  ];
  const positions: Record<string, number> = {};
  await db.insert(jobs).values(
    sample.map((j) => ({
      ...j,
      userId: user!.id,
      source: "demo",
      position: (positions[j.status] = (positions[j.status] ?? -1) + 1),
    })),
  );
  return user!;
}
