// Shared request/response schemas for the TrabaHub API, web app and browser extension.
// The API validates every request with these, and the OpenAPI docs are generated from them.
import { z } from "zod";

export const JOB_STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const STATUS_LABELS: Record<JobStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional().nullable();

export const jobSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  salaryText: z.string().nullable(),
  url: z.string().nullable(),
  source: z.string().nullable(),
  status: jobStatusSchema,
  position: z.number().int(),
  notes: z.string().nullable(),
  requirements: z.array(z.string()),
  appliedAt: z.string().datetime().nullable(),
  followUpAt: z.string().datetime().nullable(),
  deadline: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Job = z.infer<typeof jobSchema>;

export const createJobSchema = z.object({
  title: trimmed(200).min(1, "Title is required"),
  company: trimmed(200).min(1, "Company is required"),
  location: optionalText(200),
  salaryText: optionalText(100),
  url: z.string().trim().url().max(2000).optional().nullable(),
  source: optionalText(50),
  status: jobStatusSchema.default("saved"),
  notes: optionalText(10_000),
  requirements: z.array(trimmed(300)).max(50).default([]),
  followUpAt: z.string().datetime().optional().nullable(),
  deadline: z.string().datetime().optional().nullable(),
});
export type CreateJobInput = z.input<typeof createJobSchema>;

// Every field optional; moving a card sends just { status, position }.
export const updateJobSchema = createJobSchema
  .partial()
  .extend({ position: z.number().int().min(0).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Send at least one field to update" });
export type UpdateJobInput = z.input<typeof updateJobSchema>;

export const listJobsQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

export const jobListSchema = z.object({
  items: z.array(jobSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type JobList = z.infer<typeof jobListSchema>;

export const jobEventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["created", "status_changed", "updated"]),
  data: z.record(z.unknown()),
  at: z.string().datetime(),
});
export type JobEvent = z.infer<typeof jobEventSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  image: z.string().nullable(),
  isDemo: z.boolean(),
  emailDigest: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

export const updateMeSchema = z.object({ emailDigest: z.boolean() });

export const tokenResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number().int(),
  user: userSchema,
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const exchangeCodeSchema = z.object({ code: z.string().min(10).max(200) });

// RFC 9457 "problem details" error body, used for every error the API returns.
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof problemSchema>;

// --- Organizations and roles (coach mode) ---

export const ROLES = ["owner", "admin", "coach", "member"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  coach: "Coach",
  member: "Member",
};

export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  role: roleSchema, // the caller's role in this organization
  memberCount: z.number().int(),
  createdAt: z.string().datetime(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
});

export const memberSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  image: z.string().nullable(),
  role: roleSchema,
  joinedAt: z.string().datetime(),
  statusCounts: z.record(jobStatusSchema, z.number().int()).optional(),
});
export type Member = z.infer<typeof memberSchema>;

export const updateMemberSchema = z.object({ role: roleSchema });

export const createInviteSchema = z.object({
  role: roleSchema.exclude(["owner"]).default("member"),
});

export const inviteSchema = z.object({
  code: z.string(),
  role: roleSchema,
  expiresAt: z.string().datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;

export const invitePreviewSchema = z.object({
  organizationName: z.string(),
  role: roleSchema,
  expiresAt: z.string().datetime(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

export * from "./permissions.js";
