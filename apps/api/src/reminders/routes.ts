import { timingSafeEqual } from "node:crypto";

import { Router } from "express";

import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import type { EmailSender } from "../email/sender.js";
import { HttpError } from "../errors.js";
import { sendDigests } from "./digest.js";

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Called once a day by the scheduler (GitHub Actions) with `Authorization: Bearer <CRON_SECRET>`. */
export function internalRouter(db: Db, config: Config, sender: EmailSender): Router {
  const router = Router();

  router.post("/reminders", async (req, res) => {
    if (!config.CRON_SECRET) throw new HttpError(404, "Not Found", "Reminders are not configured");
    const token = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!sameSecret(token, config.CRON_SECRET)) throw new HttpError(401, "Unauthorized", "Bad scheduler secret");
    res.json(await sendDigests(db, sender, config.WEB_URL));
  });

  return router;
}
