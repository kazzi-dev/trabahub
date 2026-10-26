import { createHash, randomBytes } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

export interface AccessClaims {
  sub: string; // user id
}

export class TokenService {
  private key: Uint8Array;

  constructor(
    secret: string,
    private ttlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  get ttl() {
    return this.ttlSeconds;
  }

  sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setIssuer("trabahub")
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: "trabahub" });
      return payload.sub ? { sub: payload.sub } : null;
    } catch {
      return null;
    }
  }
}

/** Random URL-safe secret (auth codes, OAuth state, API tokens). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Secrets are stored hashed, so a database leak doesn't leak usable codes or tokens. */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
