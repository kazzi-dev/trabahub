import type {
  CreateJobInput,
  Invite,
  InvitePreview,
  Member,
  Organization,
  Role,
  Job,
  JobEvent,
  JobList,
  Problem,
  TokenResponse,
  UpdateJobInput,
  User,
} from "@trabahub/shared";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const TOKEN_KEY = "trabahub.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode or blocked storage: the session just won't survive a reload.
  }
}

/** Error carrying the API's RFC 9457 problem details. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: Partial<Problem>,
  ) {
    super(problem.detail ?? problem.title ?? `Request failed (${status})`);
  }

  /** Field-level validation messages keyed by field name. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem.errors ?? []).map((e) => [e.path, e.message]));
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, {
      title: "Can't reach the server",
      detail: "The API may be waking up (free hosting sleeps when idle). Try again in a few seconds.",
    });
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const api = {
  providers: () => request<{ github: boolean; google: boolean; demo: boolean }>("/v1/auth/providers"),
  startDemo: () => request<TokenResponse>("/v1/auth/demo", { method: "POST" }),
  exchange: (code: string) =>
    request<TokenResponse>("/v1/auth/exchange", { method: "POST", body: JSON.stringify({ code }) }),
  me: () => request<User>("/v1/auth/me"),
  signInUrl: (provider: "github" | "google") =>
    `${API_URL}/v1/auth/${provider}/start?redirect=${encodeURIComponent(window.location.origin)}`,

  listJobs: () => request<JobList>("/v1/jobs?limit=200"),
  createJob: (input: CreateJobInput) =>
    request<Job>("/v1/jobs", { method: "POST", body: JSON.stringify(input) }),
  updateJob: (id: string, input: UpdateJobInput) =>
    request<Job>(`/v1/jobs/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteJob: (id: string) => request<void>(`/v1/jobs/${id}`, { method: "DELETE" }),
  jobEvents: (id: string) => request<JobEvent[]>(`/v1/jobs/${id}/events`),

  listOrgs: () => request<Organization[]>("/v1/orgs"),
  createOrg: (name: string) =>
    request<Organization>("/v1/orgs", { method: "POST", body: JSON.stringify({ name }) }),
  getOrg: (id: string) => request<Organization>(`/v1/orgs/${id}`),
  deleteOrg: (id: string) => request<void>(`/v1/orgs/${id}`, { method: "DELETE" }),
  members: (orgId: string) => request<Member[]>(`/v1/orgs/${orgId}/members`),
  setRole: (orgId: string, userId: string, role: Role) =>
    request<{ userId: string; role: Role }>(`/v1/orgs/${orgId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  removeMember: (orgId: string, userId: string) =>
    request<void>(`/v1/orgs/${orgId}/members/${userId}`, { method: "DELETE" }),
  memberJobs: (orgId: string, userId: string) =>
    request<JobList>(`/v1/orgs/${orgId}/members/${userId}/jobs`),
  createInvite: (orgId: string, role: Exclude<Role, "owner">) =>
    request<Invite>(`/v1/orgs/${orgId}/invites`, { method: "POST", body: JSON.stringify({ role }) }),
  previewInvite: (code: string) => request<InvitePreview>(`/v1/invites/${encodeURIComponent(code)}`),
  acceptInvite: (code: string) =>
    request<Organization>(`/v1/invites/${encodeURIComponent(code)}/accept`, { method: "POST" }),
};
