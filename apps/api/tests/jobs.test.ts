import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setup, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.database.close());

const newJob = { title: "Full Stack Developer", company: "Acme", requirements: ["TypeScript", "PostgreSQL"] };

describe("jobs API", () => {
  it("creates a job at the top of its column and returns it", async () => {
    const { auth } = await t.login();
    const res = await t.api.post("/v1/jobs").set(auth).send(newJob).expect(201);
    expect(res.headers.location).toBe(`/v1/jobs/${res.body.id}`);
    expect(res.body).toMatchObject({ ...newJob, status: "saved", position: 0, appliedAt: null });
  });

  it("validates input with field-level errors", async () => {
    const { auth } = await t.login();
    const res = await t.api.post("/v1/jobs").set(auth).send({ title: "", url: "not a url" }).expect(400);
    const paths = res.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["title", "company", "url"]));
  });

  it("never shows one user's jobs to another", async () => {
    const alice = await t.login();
    const bob = await t.login();
    const job = (await t.api.post("/v1/jobs").set(alice.auth).send(newJob).expect(201)).body;

    await t.api.get(`/v1/jobs/${job.id}`).set(bob.auth).expect(404);
    await t.api.patch(`/v1/jobs/${job.id}`).set(bob.auth).send({ title: "hacked" }).expect(404);
    await t.api.delete(`/v1/jobs/${job.id}`).set(bob.auth).expect(404);
    const bobsList = await t.api.get("/v1/jobs").set(bob.auth).expect(200);
    expect(bobsList.body.items.map((j: { id: string }) => j.id)).not.toContain(job.id);
  });

  it("moving to Applied stamps the date, schedules a follow-up and logs the change", async () => {
    const { auth } = await t.login();
    const job = (await t.api.post("/v1/jobs").set(auth).send(newJob).expect(201)).body;
    const moved = await t.api
      .patch(`/v1/jobs/${job.id}`)
      .set(auth)
      .send({ status: "applied", position: 0 })
      .expect(200);

    expect(moved.body.status).toBe("applied");
    expect(moved.body.appliedAt).not.toBeNull();
    const days = (Date.parse(moved.body.followUpAt) - Date.parse(moved.body.appliedAt)) / 86_400_000;
    expect(Math.round(days)).toBe(7);

    const events = await t.api.get(`/v1/jobs/${job.id}/events`).set(auth).expect(200);
    expect(events.body[0]).toMatchObject({ type: "status_changed", data: { from: "saved", to: "applied" } });
  });

  it("reorders a column when a card is dropped in the middle", async () => {
    const { auth } = await t.login();
    const create = (title: string) =>
      t.api.post("/v1/jobs").set(auth).send({ ...newJob, title, status: "offer" }).expect(201);
    const a = (await create("A")).body; // each new card goes on top, so the order is C, B, A
    await create("B");
    await create("C");
    await t.api.patch(`/v1/jobs/${a.id}`).set(auth).send({ position: 1 }).expect(200);

    const offers = await t.api.get("/v1/jobs").query({ status: "offer" }).set(auth).expect(200);
    expect(offers.body.items.map((j: { title: string }) => j.title)).toEqual(["C", "A", "B"]);
    expect(offers.body.items.map((j: { position: number }) => j.position)).toEqual([0, 1, 2]);
  });

  it("filters by text search and paginates", async () => {
    const { auth } = await t.login();
    await t.api.post("/v1/jobs").set(auth).send({ title: "Rust Engineer", company: "Ferrous" }).expect(201);
    const res = await t.api.get("/v1/jobs").query({ q: "ferr", limit: 1 }).set(auth).expect(200);
    expect(res.body).toMatchObject({ total: 1, limit: 1, offset: 0 });
    expect(res.body.items[0].company).toBe("Ferrous");
  });

  it("deletes a job", async () => {
    const { auth } = await t.login();
    const job = (await t.api.post("/v1/jobs").set(auth).send(newJob).expect(201)).body;
    await t.api.delete(`/v1/jobs/${job.id}`).set(auth).expect(204);
    await t.api.get(`/v1/jobs/${job.id}`).set(auth).expect(404);
  });

  it("returns 404 (not 500) for malformed ids", async () => {
    const { auth } = await t.login();
    await t.api.get("/v1/jobs/not-a-uuid").set(auth).expect(404);
  });
});

describe("API docs", () => {
  it("serves an OpenAPI 3.1 document covering the jobs endpoints", async () => {
    const res = await t.api.get("/openapi.json").expect(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(["/v1/jobs", "/v1/jobs/{id}"]));
  });
});
