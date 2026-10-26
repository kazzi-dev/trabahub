import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

/** An error with an HTTP status, turned into an RFC 9457 problem response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
  ) {
    super(detail ?? title);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, "Not Found", `${what} not found`);

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "Not Found", `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  res.type("application/problem+json");
  if (err instanceof ZodError) {
    res.status(400).json({
      type: "https://trabahub.dev/problems/validation",
      title: "Validation failed",
      status: 400,
      errors: err.issues.map((i) => ({ path: i.path.join(".") || "(body)", message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({
      type: "about:blank",
      title: err.title,
      status: err.status,
      ...(err.detail ? { detail: err.detail } : {}),
    });
    return;
  }
  // Malformed JSON bodies from express.json()
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ type: "about:blank", title: "Bad Request", status: 400, detail: "Invalid JSON" });
    return;
  }
  console.error(err);
  res.status(500).json({ type: "about:blank", title: "Internal Server Error", status: 500 });
};
