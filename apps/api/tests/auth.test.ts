import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sha256 } from "../src/auth/tokens.js";
import { authCodes } from "../src/db/schema.js";
import { setup, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.database.close());

describe("auth", () => {
  it("rejects requests without a token, with a problem+json body", async () => {
    const res = await t.api.get("/v1/jobs").expect(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({ status: 401, title: "Unauthorized" });
  });

  it("rejects a forged token", async () => {
    await t.api.get("/v1/jobs").set("Authorization", "Bearer not.a.jwt").expect(401);
  });

  it("starts a sandboxed demo session with sample jobs", async () => {
    const { auth } = await t.login();
    const me = await t.api.get("/v1/auth/me").set(auth).expect(200);
    expect(me.body).toMatchObject({ isDemo: true, name: "Demo Job Seeker" });
    const jobs = await t.api.get("/v1/jobs").set(auth).expect(200);
    expect(jobs.body.total).toBeGreaterThan(0);
  });

  it("trades a one-time code for a token exactly once", async () => {
    const { userId } = await t.login();
    await t.database.db.insert(authCodes).values({
      codeHash: sha256("one-time-code-123"),
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await t.api.post("/v1/auth/exchange").send({ code: "one-time-code-123" }).expect(200);
    expect(first.body.user.id).toBe(userId);
    await t.api.post("/v1/auth/exchange").send({ code: "one-time-code-123" }).expect(400);
  });

  it("refuses OAuth redirects to sites that are not allowed", async () => {
    await t.api.get("/v1/auth/github/start").query({ redirect: "https://evil.example" }).expect(400);
  });

  it("reports which providers are configured", async () => {
    const res = await t.api.get("/v1/auth/providers").expect(200);
    expect(res.body).toEqual({ github: false, google: false, demo: true });
  });
});

describe("demo disabled", () => {
  it("returns 404 for the demo endpoint", async () => {
    const off = await setup({ DEMO_ENABLED: "false" });
    await off.api.post("/v1/auth/demo").expect(404);
    await off.database.close();
  });
});
