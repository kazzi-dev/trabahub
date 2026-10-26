import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TokenService } from "../src/auth/tokens.js";
import { jobs, users } from "../src/db/schema.js";
import { renderDigest } from "../src/reminders/digest.js";
import { setup, type TestContext } from "./helpers.js";

const SECRET = "cron-secret-for-tests";
const DAY = 86_400_000;
let t: TestContext;

beforeAll(async () => {
  t = await setup({ CRON_SECRET: SECRET, WEB_URL: "https://trabahub.example" });
});
afterAll(() => t.database.close());
beforeEach(() => {
  t.emails.sent = [];
});

/** A real (non-demo) user with an email address and the given jobs. */
async function userWithJobs(email: string, list: { title: string; status: "saved" | "applied"; followUpInDays: number | null }[]) {
  const [user] = await t.database.db.insert(users).values({ name: "Maria Santos", email }).returning();
  if (list.length === 0) return user!;
  await t.database.db.insert(jobs).values(
    list.map((j, i) => ({
      userId: user!.id,
      title: j.title,
      company: "Acme",
      status: j.status,
      position: i,
      followUpAt: j.followUpInDays === null ? null : new Date(Date.now() + j.followUpInDays * DAY),
    })),
  );
  return user!;
}

const runReminders = () => t.api.post("/v1/internal/reminders").set("Authorization", `Bearer ${SECRET}`);

describe("daily follow-up digest", () => {
  it("rejects calls without the scheduler secret", async () => {
    await t.api.post("/v1/internal/reminders").expect(401);
    await t.api.post("/v1/internal/reminders").set("Authorization", "Bearer wrong").expect(401);
  });

  it("emails only applied jobs that are due, once per user, and never twice a day", async () => {
    await userWithJobs("maria@example.com", [
      { title: "Overdue job", status: "applied", followUpInDays: -2 },
      { title: "Due later", status: "applied", followUpInDays: 3 },
      { title: "Only saved", status: "saved", followUpInDays: -5 },
    ]);
    const first = await runReminders().expect(200);
    expect(first.body).toEqual({ sent: 1, failed: 0 });

    const email = t.emails.sent.find((e) => e.to === "maria@example.com")!;
    expect(email.subject).toBe("Time to follow up on 1 application");
    expect(email.text).toContain("Overdue job at Acme (2 days overdue)");
    expect(email.text).not.toContain("Due later");
    expect(email.text).not.toContain("Only saved");

    const again = await runReminders().expect(200);
    expect(again.body.sent).toBe(0);
  });

  it("skips users who turned the digest off, and demo users", async () => {
    const quiet = await userWithJobs("quiet@example.com", [{ title: "Due", status: "applied", followUpInDays: -1 }]);
    await t.database.db.update(users).set({ emailDigest: false }).where(eq(users.id, quiet.id));
    const demo = await t.login(); // demo users have no email address
    await t.api.patch("/v1/auth/me").set(demo.auth).send({ emailDigest: true }).expect(200);

    await runReminders().expect(200);
    expect(t.emails.sent.map((e) => e.to)).not.toContain("quiet@example.com");
  });

  it("lets a signed-in user turn the digest off", async () => {
    const user = await userWithJobs("toggle@example.com", []);
    const token = await new TokenService("dev-only-secret-change-me-dev-only-secret", 3600).sign(user.id);
    const res = await t.api.patch("/v1/auth/me").set("Authorization", `Bearer ${token}`).send({ emailDigest: false }).expect(200);
    expect(res.body.emailDigest).toBe(false);
  });

  it("escapes job titles in the HTML email", () => {
    const now = new Date();
    const html = renderDigest("Ana", [{ title: "<script>x</script>", company: "A&B", followUpAt: now, url: null }], "https://t.example", now).html;
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&amp;B");
    expect(html).not.toContain("<script>");
  });
});

describe("reminders disabled", () => {
  it("returns 404 when no scheduler secret is configured", async () => {
    const off = await setup();
    await off.api.post("/v1/internal/reminders").expect(404);
    await off.database.close();
  });
});
