import { exchangeCodeSchema, updateMeSchema, type TokenResponse } from "@trabahub/shared";
import { decodeIdToken, generateCodeVerifier, generateState, GitHub, Google } from "arctic";
import { eq } from "drizzle-orm";
import { Router, type Response } from "express";

import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { authCodes, users } from "../db/schema.js";
import { HttpError } from "../errors.js";
import { createDemoUser, findUser, toUser, upsertOAuthUser, type OAuthProfile } from "../users.js";
import { requireUser } from "./middleware.js";
import { randomToken, sha256, type TokenService } from "./tokens.js";

const CODE_TTL_MS = 60_000;
const COOKIE_MAX_AGE_MS = 10 * 60_000;

/**
 * Sign-in flow (no third-party cookies needed, so it works with the web app on another domain):
 * 1. Web app sends the browser to GET /v1/auth/:provider/start.
 * 2. The provider redirects back to GET /v1/auth/:provider/callback.
 * 3. The API redirects to the web app with a short-lived, single-use code.
 * 4. The web app trades the code for an access token at POST /v1/auth/exchange.
 */
export function authRouter(db: Db, config: Config, tokens: TokenService): Router {
  const router = Router();
  const callbackUrl = (provider: string) => `${config.API_URL}/v1/auth/${provider}/callback`;
  const github = config.GITHUB_CLIENT_ID
    ? new GitHub(config.GITHUB_CLIENT_ID, config.GITHUB_CLIENT_SECRET, callbackUrl("github"))
    : null;
  const google = config.GOOGLE_CLIENT_ID
    ? new Google(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, callbackUrl("google"))
    : null;

  const allowedOrigins = new Set([new URL(config.WEB_URL).origin, ...config.CORS_ORIGINS]);
  const secureCookies = config.API_URL.startsWith("https://");
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax" as const,
    path: "/v1/auth",
    maxAge: COOKIE_MAX_AGE_MS,
  };

  // Lets the web app show only the sign-in buttons that are configured.
  router.get("/providers", (_req, res) => {
    res.json({ github: Boolean(github), google: Boolean(google), demo: config.DEMO_ENABLED });
  });

  router.get("/:provider/start", (req, res) => {
    const provider = req.params.provider;
    const returnTo = typeof req.query.redirect === "string" ? req.query.redirect : config.WEB_URL;
    if (!allowedOrigins.has(safeOrigin(returnTo))) {
      throw new HttpError(400, "Bad Request", "Redirect URL is not allowed");
    }
    const state = generateState();
    res.cookie("oauth_state", state, cookieOptions);
    res.cookie("oauth_return", returnTo, cookieOptions);

    if (provider === "github" && github) {
      res.redirect(github.createAuthorizationURL(state, ["read:user", "user:email"]).toString());
      return;
    }
    if (provider === "google" && google) {
      const verifier = generateCodeVerifier();
      res.cookie("oauth_verifier", verifier, cookieOptions);
      res.redirect(
        google.createAuthorizationURL(state, verifier, ["openid", "profile", "email"]).toString(),
      );
      return;
    }
    throw new HttpError(404, "Not Found", `Sign-in with "${provider}" is not configured`);
  });

  router.get("/:provider/callback", async (req, res) => {
    const { code, state } = req.query;
    const cookies = req.cookies as Record<string, string | undefined>;
    if (typeof code !== "string" || typeof state !== "string" || state !== cookies.oauth_state) {
      throw new HttpError(400, "Bad Request", "Sign-in expired or was tampered with; try again");
    }

    let profile: OAuthProfile;
    if (req.params.provider === "github" && github) {
      profile = await githubProfile((await github.validateAuthorizationCode(code)).accessToken());
    } else if (req.params.provider === "google" && google && cookies.oauth_verifier) {
      const tokenSet = await google.validateAuthorizationCode(code, cookies.oauth_verifier);
      const claims = decodeIdToken(tokenSet.idToken()) as Record<string, string | undefined>;
      profile = {
        provider: "google",
        providerAccountId: claims.sub!,
        name: claims.name ?? null,
        email: claims.email ?? null,
        image: claims.picture ?? null,
      };
    } else {
      throw new HttpError(400, "Bad Request", "Unknown sign-in provider");
    }

    const user = await upsertOAuthUser(db, profile);
    const returnTo = cookies.oauth_return ?? config.WEB_URL;
    clearOAuthCookies(res, cookieOptions);
    res.redirect(`${new URL("/auth/callback", returnTo)}?code=${await issueCode(db, user.id)}`);
  });

  router.post("/exchange", async (req, res) => {
    const { code } = exchangeCodeSchema.parse(req.body);
    const [row] = await db
      .delete(authCodes) // single use: deleting it is how we "spend" it
      .where(eq(authCodes.codeHash, sha256(code)))
      .returning();
    if (!row || row.expiresAt < new Date()) {
      throw new HttpError(400, "Bad Request", "Sign-in code is invalid or expired");
    }
    res.json(await tokenResponse(row.userId));
  });

  router.post("/demo", async (_req, res) => {
    if (!config.DEMO_ENABLED) throw new HttpError(404, "Not Found", "Demo is disabled");
    const user = await createDemoUser(db);
    res.status(201).json(await tokenResponse(user.id));
  });

  router.get("/me", requireUser(tokens), async (_req, res) => {
    const user = await findUser(db, res.locals.userId);
    if (!user) throw new HttpError(401, "Unauthorized", "Account no longer exists");
    res.json(toUser(user));
  });

  router.patch("/me", requireUser(tokens), async (req, res) => {
    const { emailDigest } = updateMeSchema.parse(req.body);
    const [user] = await db.update(users).set({ emailDigest }).where(eq(users.id, res.locals.userId)).returning();
    if (!user) throw new HttpError(401, "Unauthorized", "Account no longer exists");
    res.json(toUser(user));
  });

  async function tokenResponse(userId: string): Promise<TokenResponse> {
    const user = await findUser(db, userId);
    if (!user) throw new HttpError(401, "Unauthorized", "Account no longer exists");
    return { token: await tokens.sign(userId), expiresIn: tokens.ttl, user: toUser(user) };
  }

  return router;
}

async function issueCode(db: Db, userId: string): Promise<string> {
  const code = randomToken();
  await db.insert(authCodes).values({
    codeHash: sha256(code),
    userId,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

async function githubProfile(accessToken: string): Promise<OAuthProfile> {
  const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": "TrabaHub" };
  const user = (await (await fetch("https://api.github.com/user", { headers })).json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  let email = user.email;
  if (!email) {
    const emails = (await (await fetch("https://api.github.com/user/emails", { headers })).json()) as
      | { email: string; primary: boolean; verified: boolean }[]
      | undefined;
    email = emails?.find?.((e) => e.primary && e.verified)?.email ?? null;
  }
  return {
    provider: "github",
    providerAccountId: String(user.id),
    name: user.name ?? user.login,
    email,
    image: user.avatar_url,
  };
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function clearOAuthCookies(res: Response, options: { path: string }) {
  for (const name of ["oauth_state", "oauth_return", "oauth_verifier"]) {
    res.clearCookie(name, { path: options.path });
  }
}
