import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { can, canChangeRole, canRemove } from "../src/orgs/permissions.js";
import { setup, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.database.close());

type Auth = { Authorization: string };

/** An organization with an owner, and helpers to add people by role through invite links. */
async function orgWithOwner() {
  const owner = await t.login();
  const org = (await t.api.post("/v1/orgs").set(owner.auth).send({ name: "Bootcamp Batch 7" }).expect(201)).body;
  async function join(role: "admin" | "coach" | "member") {
    const person = await t.login();
    const invite = (await t.api.post(`/v1/orgs/${org.id}/invites`).set(owner.auth).send({ role }).expect(201)).body;
    await t.api.post(`/v1/invites/${invite.code}/accept`).set(person.auth).expect(201);
    return person;
  }
  return { owner, org, join };
}

describe("permission rules", () => {
  it("grants each role only what it needs", () => {
    expect(can("member", "org.view")).toBe(true);
    expect(can("member", "pipelines.view")).toBe(false);
    expect(can("coach", "pipelines.view")).toBe(true);
    expect(can("coach", "members.manage")).toBe(false);
    expect(can("admin", "members.manage")).toBe(true);
    expect(can("admin", "org.delete")).toBe(false);
    expect(can("owner", "org.delete")).toBe(true);
  });

  it("keeps owners in charge of owners", () => {
    expect(canChangeRole("admin", "member", "coach")).toBe(true);
    expect(canChangeRole("admin", "member", "owner")).toBe(false);
    expect(canChangeRole("admin", "owner", "member")).toBe(false);
    expect(canChangeRole("owner", "admin", "owner")).toBe(true);
    expect(canChangeRole("coach", "member", "coach")).toBe(false);
    expect(canRemove("admin", "owner")).toBe(false);
    expect(canRemove("admin", "coach")).toBe(true);
  });
});

describe("organizations API", () => {
  it("makes the creator the owner and lists the organization", async () => {
    const { owner, org } = await orgWithOwner();
    expect(org).toMatchObject({ name: "Bootcamp Batch 7", role: "owner", memberCount: 1 });
    const list = await t.api.get("/v1/orgs").set(owner.auth).expect(200);
    expect(list.body.map((o: { id: string }) => o.id)).toContain(org.id);
  });

  it("hides organizations from non-members (404, not 403)", async () => {
    const { org } = await orgWithOwner();
    const stranger = await t.login();
    await t.api.get(`/v1/orgs/${org.id}`).set(stranger.auth).expect(404);
    await t.api.get(`/v1/orgs/${org.id}/members`).set(stranger.auth).expect(404);
  });

  it("joins people through invite links with the invited role", async () => {
    const { owner, org, join } = await orgWithOwner();
    await join("coach");
    await join("member");
    const members = (await t.api.get(`/v1/orgs/${org.id}/members`).set(owner.auth).expect(200)).body;
    expect(members.map((m: { role: string }) => m.role)).toEqual(["owner", "coach", "member"]);
  });

  it("lets coaches see members' pipelines, and members can't", async () => {
    const { org, join } = await orgWithOwner();
    const coach = await join("coach");
    const student = await join("member");
    const other = await join("member");

    const asCoach = (await t.api.get(`/v1/orgs/${org.id}/members`).set(coach.auth).expect(200)).body;
    const studentRow = asCoach.find((m: { userId: string }) => m.userId === student.userId);
    expect(studentRow.statusCounts.saved).toBeGreaterThan(0); // demo users start with sample jobs
    expect(studentRow.email).toBeNull(); // coaches don't see contact details

    const board = await t.api.get(`/v1/orgs/${org.id}/members/${student.userId}/jobs`).set(coach.auth).expect(200);
    expect(board.body.total).toBeGreaterThan(0);

    const asMember = (await t.api.get(`/v1/orgs/${org.id}/members`).set(other.auth).expect(200)).body;
    expect(asMember[0].statusCounts).toBeUndefined();
    await t.api.get(`/v1/orgs/${org.id}/members/${student.userId}/jobs`).set(other.auth).expect(403);
  });

  it("only owners and admins create invites; only owners invite admins", async () => {
    const { org, join } = await orgWithOwner();
    const coach = await join("coach");
    const admin = await join("admin");
    await t.api.post(`/v1/orgs/${org.id}/invites`).set(coach.auth).send({ role: "member" }).expect(403);
    await t.api.post(`/v1/orgs/${org.id}/invites`).set(admin.auth).send({ role: "coach" }).expect(201);
    await t.api.post(`/v1/orgs/${org.id}/invites`).set(admin.auth).send({ role: "admin" }).expect(403);
    await t.api.post(`/v1/orgs/${org.id}/invites`).set(admin.auth).send({ role: "owner" }).expect(400);
  });

  it("lets admins manage members but not owners", async () => {
    const { owner, org, join } = await orgWithOwner();
    const admin = await join("admin");
    const student = await join("member");
    const promote = (who: Auth, userId: string, role: string) =>
      t.api.patch(`/v1/orgs/${org.id}/members/${userId}`).set(who).send({ role });

    await promote(admin.auth, student.userId, "coach").expect(200);
    await promote(admin.auth, student.userId, "owner").expect(403);
    await promote(admin.auth, owner.userId, "member").expect(403);
    await t.api.delete(`/v1/orgs/${org.id}/members/${owner.userId}`).set(admin.auth).expect(403);
    await t.api.delete(`/v1/orgs/${org.id}/members/${student.userId}`).set(admin.auth).expect(204);
  });

  it("always keeps at least one owner", async () => {
    const { owner, org, join } = await orgWithOwner();
    const member = await join("member");
    await t.api.delete(`/v1/orgs/${org.id}/members/${owner.userId}`).set(owner.auth).expect(409);
    await t.api.patch(`/v1/orgs/${org.id}/members/${owner.userId}`).set(owner.auth).send({ role: "admin" }).expect(409);

    await t.api.patch(`/v1/orgs/${org.id}/members/${member.userId}`).set(owner.auth).send({ role: "owner" }).expect(200);
    await t.api.delete(`/v1/orgs/${org.id}/members/${owner.userId}`).set(owner.auth).expect(204); // now they can leave
  });

  it("lets members leave on their own", async () => {
    const { org, join } = await orgWithOwner();
    const member = await join("member");
    await t.api.delete(`/v1/orgs/${org.id}/members/${member.userId}`).set(member.auth).expect(204);
    await t.api.get(`/v1/orgs/${org.id}`).set(member.auth).expect(404);
  });

  it("only owners delete an organization", async () => {
    const { owner, org, join } = await orgWithOwner();
    const admin = await join("admin");
    await t.api.delete(`/v1/orgs/${org.id}`).set(admin.auth).expect(403);
    await t.api.delete(`/v1/orgs/${org.id}`).set(owner.auth).expect(204);
  });

  it("previews an invite and rejects unknown codes", async () => {
    const { owner, org } = await orgWithOwner();
    const invite = (await t.api.post(`/v1/orgs/${org.id}/invites`).set(owner.auth).send({}).expect(201)).body;
    const guest = await t.login();
    const preview = await t.api.get(`/v1/invites/${invite.code}`).set(guest.auth).expect(200);
    expect(preview.body).toMatchObject({ organizationName: "Bootcamp Batch 7", role: "member" });
    await t.api.get("/v1/invites/not-a-real-code").set(guest.auth).expect(404);
  });
});
