import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import {
  createJobSchema,
  exchangeCodeSchema,
  jobEventSchema,
  jobListSchema,
  jobSchema,
  listJobsQuerySchema,
  problemSchema,
  tokenResponseSchema,
  updateJobSchema,
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

  r.registerPath({ method: "get", path: "/v1/jobs", tags: ["Jobs"], summary: "List your jobs", security: auth, request: { query: listJobsQuerySchema }, responses: { 200: json(jobListSchema, "A page of jobs"), 401: problem("Not signed in") } });
  r.registerPath({ method: "post", path: "/v1/jobs", tags: ["Jobs"], summary: "Create a job", security: auth, request: { body: { content: { "application/json": { schema: createJobSchema } } } }, responses: { 201: json(Job, "Created"), 400: problem("Validation failed"), 401: problem("Not signed in") } });
  r.registerPath({ method: "get", path: "/v1/jobs/{id}", tags: ["Jobs"], summary: "Get a job", security: auth, request: { params: idParams }, responses: { 200: json(Job, "The job"), 404: problem("Not found") } });
  r.registerPath({ method: "patch", path: "/v1/jobs/{id}", tags: ["Jobs"], summary: "Update a job or move it on the board", description: "Send `{ status, position }` to move a card; moving to `applied` sets `appliedAt` and a follow-up reminder.", security: auth, request: { params: idParams, body: { content: { "application/json": { schema: updateJobSchema } } } }, responses: { 200: json(Job, "Updated"), 400: problem("Validation failed"), 404: problem("Not found") } });
  r.registerPath({ method: "delete", path: "/v1/jobs/{id}", tags: ["Jobs"], summary: "Delete a job", security: auth, request: { params: idParams }, responses: { 204: { description: "Deleted" }, 404: problem("Not found") } });
  r.registerPath({ method: "get", path: "/v1/jobs/{id}/events", tags: ["Jobs"], summary: "A job's timeline", security: auth, request: { params: idParams }, responses: { 200: json(z.array(jobEventSchema), "Newest first"), 404: problem("Not found") } });

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
