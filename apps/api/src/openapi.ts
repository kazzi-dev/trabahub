import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import {
  createInviteSchema,
  createJobSchema,
  createOrganizationSchema,
  inviteSchema,
  invitePreviewSchema,
  memberSchema,
  organizationSchema,
  updateMemberSchema,
  exchangeCodeSchema,
  jobEventSchema,
  jobListSchema,
  jobSchema,
  listJobsQuerySchema,
  problemSchema,
  tokenResponseSchema,
  updateJobSchema,
  updateMeSchema,
  userSchema,
} from "@trabahub/shared";
import { z } from "zod";

// Adds .openapi() to Zod schemas (the shared package uses the same Zod instance).
extendZodWithOpenApi(z);

/** Builds the OpenAPI 3.1 document from the same Zod schemas the API validates with. */
export function buildOpenApi(serverUrl: string) {
  const r = new OpenAPIRegistry();
  const bearer = r.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  });
  const Job = r.register("Job", jobSchema);
  const Problem = r.register("Problem", problemSchema);
  const User = r.register("User", userSchema);
  const auth = [{ [bearer.name]: [] }];
  const json = (schema: z.ZodTypeAny, description: string) => ({
    description,
    content: { "application/json": { schema } },
  });
  const problem = (description: string) => ({
    description,
    content: { "application/problem+json": { schema: Problem } },
  });
  const idParams = z.object({ id: z.string().uuid() });

  r.registerPath({ method: "get", path: "/health", tags: ["System"], summary: "Health check", responses: { 200: json(z.object({ status: z.literal("ok") }), "OK") } });

  r.registerPath({ method: "get", path: "/v1/auth/providers", tags: ["Auth"], summary: "Which sign-in options are enabled", responses: { 200: json(z.object({ github: z.boolean(), google: z.boolean(), demo: z.boolean() }), "Enabled providers") } });
  r.registerPath({ method: "get", path: "/v1/auth/{provider}/start", tags: ["Auth"], summary: "Start OAuth sign-in (browser redirect)", request: { params: z.object({ provider: z.enum(["github", "google"]) }), query: z.object({ redirect: z.string().url().optional() }) }, responses: { 302: { description: "Redirect to the provider" } } });
  r.registerPath({ method: "post", path: "/v1/auth/exchange", tags: ["Auth"], summary: "Trade a one-time sign-in code for an access token", request: { body: { content: { "application/json": { schema: exchangeCodeSchema } } } }, responses: { 200: json(tokenResponseSchema, "Signed in"), 400: problem("Invalid or expired code") } });
  r.registerPath({ method: "post", path: "/v1/auth/demo", tags: ["Auth"], summary: "Start a sandboxed demo session", responses: { 201: json(tokenResponseSchema, "Demo session") } });
  r.registerPath({ method: "get", path: "/v1/auth/me", tags: ["Auth"], summary: "Current user", security: auth, responses: { 200: json(User, "The signed-in user"), 401: problem("Not signed in") } });

  r.registerPath({ method: "patch", path: "/v1/auth/me", tags: ["Auth"], summary: "Update your preferences (daily follow-up email)", security: auth, request: { body: { content: { "application/json": { schema: updateMeSchema } } } }, responses: { 200: json(User, "Updated user") } });
  r.registerPath({ method: "post", path: "/v1/internal/reminders", tags: ["System"], summary: "Send today's follow-up digests (called by the daily scheduler)", description: "Requires `Authorization: Bearer <CRON_SECRET>`. Safe to retry: nobody gets two digests within 20 hours.", responses: { 200: json(z.object({ sent: z.number().int(), failed: z.number().int() }), "Digests sent"), 401: problem("Bad scheduler secret") } });
  r.registerPath({ method: "get", path: "/v1/jobs", tags: ["Jobs"], summary: "List your jobs", security: auth, request: { query: listJobsQuerySchema }, responses: { 200: json(jobListSchema, "A page of jobs"), 401: problem("Not signed in") } });
  r.registerPath({ method: "post", path: "/v1/jobs", tags: ["Jobs"], summary: "Create a job", security: auth, request: { body: { content: { "application/json": { schema: createJobSchema } } } }, responses: { 201: json(Job, "Created"), 400: problem("Validation failed"), 401: problem("Not signed in") } });
  r.registerPath({ method: "get", path: "/v1/jobs/{id}", tags: ["Jobs"], summary: "Get a job", security: auth, request: { params: idParams }, responses: { 200: json(Job, "The job"), 404: problem("Not found") } });
  r.registerPath({ method: "patch", path: "/v1/jobs/{id}", tags: ["Jobs"], summary: "Update a job or move it on the board", description: "Send `{ status, position }` to move a card; moving to `applied` sets `appliedAt` and a follow-up reminder.", security: auth, request: { params: idParams, body: { content: { "application/json": { schema: updateJobSchema } } } }, responses: { 200: json(Job, "Updated"), 400: problem("Validation failed"), 404: problem("Not found") } });
  r.registerPath({ method: "delete", path: "/v1/jobs/{id}", tags: ["Jobs"], summary: "Delete a job", security: auth, request: { params: idParams }, responses: { 204: { description: "Deleted" }, 404: problem("Not found") } });
  r.registerPath({ method: "get", path: "/v1/jobs/{id}/events", tags: ["Jobs"], summary: "A job's timeline", security: auth, request: { params: idParams }, responses: { 200: json(z.array(jobEventSchema), "Newest first"), 404: problem("Not found") } });

  const Org = r.register("Organization", organizationSchema);
  const orgParams = z.object({ orgId: z.string().uuid() });
  const memberParams = orgParams.extend({ userId: z.string().uuid() });
  const forbidden = problem("Your role doesn't allow this");
  const orgBody = { body: { content: { "application/json": { schema: createOrganizationSchema } } } };

  r.registerPath({ method: "get", path: "/v1/orgs", tags: ["Organizations"], summary: "Organizations you belong to", security: auth, responses: { 200: json(z.array(Org), "With your role in each") } });
  r.registerPath({ method: "post", path: "/v1/orgs", tags: ["Organizations"], summary: "Create an organization (you become owner)", security: auth, request: orgBody, responses: { 201: json(Org, "Created") } });
  r.registerPath({ method: "get", path: "/v1/orgs/{orgId}", tags: ["Organizations"], summary: "Get an organization", security: auth, request: { params: orgParams }, responses: { 200: json(Org, "The organization"), 404: problem("Not found or not a member") } });
  r.registerPath({ method: "patch", path: "/v1/orgs/{orgId}", tags: ["Organizations"], summary: "Rename (owner, admin)", security: auth, request: { params: orgParams, ...orgBody }, responses: { 200: json(Org, "Renamed"), 403: forbidden } });
  r.registerPath({ method: "delete", path: "/v1/orgs/{orgId}", tags: ["Organizations"], summary: "Delete (owner)", security: auth, request: { params: orgParams }, responses: { 204: { description: "Deleted" }, 403: forbidden } });
  r.registerPath({ method: "get", path: "/v1/orgs/{orgId}/members", tags: ["Organizations"], summary: "Members; coaches and above also get each member's status counts", security: auth, request: { params: orgParams }, responses: { 200: json(z.array(memberSchema), "Members") } });
  r.registerPath({ method: "patch", path: "/v1/orgs/{orgId}/members/{userId}", tags: ["Organizations"], summary: "Change a member's role (owner, admin)", security: auth, request: { params: memberParams, body: { content: { "application/json": { schema: updateMemberSchema } } } }, responses: { 200: json(updateMemberSchema.extend({ userId: z.string().uuid() }), "Updated"), 403: forbidden, 409: problem("Would leave the organization without an owner") } });
  r.registerPath({ method: "delete", path: "/v1/orgs/{orgId}/members/{userId}", tags: ["Organizations"], summary: "Remove a member, or leave (your own userId)", security: auth, request: { params: memberParams }, responses: { 204: { description: "Removed" }, 403: forbidden, 409: problem("Would leave the organization without an owner") } });
  r.registerPath({ method: "get", path: "/v1/orgs/{orgId}/members/{userId}/jobs", tags: ["Organizations"], summary: "A member's board, read-only (coach, admin, owner)", security: auth, request: { params: memberParams }, responses: { 200: json(jobListSchema, "Their jobs"), 403: forbidden } });
  r.registerPath({ method: "post", path: "/v1/orgs/{orgId}/invites", tags: ["Organizations"], summary: "Create a 7-day invite link (owner, admin)", security: auth, request: { params: orgParams, body: { content: { "application/json": { schema: createInviteSchema } } } }, responses: { 201: json(inviteSchema, "Invite code"), 403: forbidden } });
  r.registerPath({ method: "get", path: "/v1/invites/{code}", tags: ["Organizations"], summary: "Preview an invite", security: auth, request: { params: z.object({ code: z.string() }) }, responses: { 200: json(invitePreviewSchema, "Invite"), 404: problem("Invalid or expired") } });
  r.registerPath({ method: "post", path: "/v1/invites/{code}/accept", tags: ["Organizations"], summary: "Join with an invite", security: auth, request: { params: z.object({ code: z.string() }) }, responses: { 201: json(Org, "Joined"), 200: json(Org, "Already a member"), 404: problem("Invalid or expired") } });

  return new OpenApiGeneratorV31(r.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "TrabaHub API",
      version: "1.0.0",
      description: "REST API for TrabaHub, a job application tracker. Errors use RFC 9457 problem details.",
    },
    servers: [{ url: serverUrl }],
  });
}
