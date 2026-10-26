import request from "supertest";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase, migrate, type Database } from "../src/db/client.js";

export interface TestContext {
  api: ReturnType<typeof request>;
  database: Database;
  /** Signs up a fresh demo user and returns its bearer token header. */
  login(): Promise<{ auth: { Authorization: string }; userId: string }>;
}

export async function setup(env: Record<string, string> = {}): Promise<TestContext> {
  const database = await createDatabase(""); // fresh in-memory PostgreSQL (PGlite) per test file
  await migrate(database);
  const config = loadConfig({ NODE_ENV: "test", ...env });
  const api = request(createApp(database.db, config));
  return {
    api,
    database,
    async login() {
      const res = await api.post("/v1/auth/demo").expect(201);
      return { auth: { Authorization: `Bearer ${res.body.token}` }, userId: res.body.user.id };
    },
  };
}
