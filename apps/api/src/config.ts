import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  // postgres://... for Neon in production; empty = in-memory PGlite, "pglite:./data" = on disk.
  DATABASE_URL: z.string().default(""),
  // Public URL of this API (used for OAuth callbacks) and of the web app (allowed redirects).
  API_URL: z.string().url().default("http://localhost:4000"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  // Extra origins allowed to call the API from a browser (e.g. Vercel preview URLs).
  CORS_ORIGINS: csv,
  JWT_SECRET: z.string().min(32).default("dev-only-secret-change-me-dev-only-secret"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(60 * 60 * 24 * 7),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  // A one-click demo account for reviewers; each visitor gets their own sandboxed copy.
  DEMO_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(120),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = configSchema.parse(env);
  if (config.NODE_ENV === "production" && config.JWT_SECRET.startsWith("dev-only")) {
    throw new Error("Set JWT_SECRET to a long random value in production");
  }
  return config;
}
