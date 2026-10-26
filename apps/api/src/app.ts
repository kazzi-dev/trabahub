import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

import { requireUser } from "./auth/middleware.js";
import { authRouter } from "./auth/routes.js";
import { TokenService } from "./auth/tokens.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { jobsRouter } from "./jobs/routes.js";
import { buildOpenApi } from "./openapi.js";
import { invitesRouter, orgsRouter } from "./orgs/routes.js";

export function createApp(db: Db, config: Config) {
  const app = express();
  const tokens = new TokenService(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);
  const allowedOrigins = [new URL(config.WEB_URL).origin, ...config.CORS_ORIGINS];

  app.set("trust proxy", 1); // behind Render's proxy: use the real client IP for rate limits
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false })); // CSP off so Swagger UI can load
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  if (config.NODE_ENV !== "test") {
    app.use(
      "/v1",
      rateLimit({ windowMs: 60_000, limit: config.RATE_LIMIT_PER_MINUTE, standardHeaders: "draft-8", legacyHeaders: false }),
    );
  }

  const openapi = buildOpenApi(config.API_URL);
  app.get("/openapi.json", (_req, res) => {
    res.json(openapi);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: "TrabaHub API" }));
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/", (_req, res) => {
    res.json({ name: "TrabaHub API", docs: "/docs", openapi: "/openapi.json" });
  });

  app.use("/v1/auth", authRouter(db, config, tokens));
  app.use("/v1/jobs", requireUser(tokens), jobsRouter(db));
  app.use("/v1/orgs", requireUser(tokens), orgsRouter(db));
  app.use("/v1/invites", requireUser(tokens), invitesRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
