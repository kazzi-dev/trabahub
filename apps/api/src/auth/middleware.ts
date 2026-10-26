import type { RequestHandler } from "express";

import { HttpError } from "../errors.js";
import type { TokenService } from "./tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      userId: string;
    }
  }
}

/** Requires `Authorization: Bearer <access token>` and exposes the user id as res.locals.userId. */
export function requireUser(tokens: TokenService): RequestHandler {
  return async (req, res, next) => {
    const header = req.get("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new HttpError(401, "Unauthorized", "Sign in to continue");
    }
    const claims = await tokens.verify(token);
    if (!claims) throw new HttpError(401, "Unauthorized", "Your session has expired; sign in again");
    res.locals.userId = claims.sub;
    next();
  };
}
