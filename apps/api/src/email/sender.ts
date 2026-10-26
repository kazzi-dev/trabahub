import type { Config } from "../config.js";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  send(email: Email): Promise<void>;
}

/** Sends through Resend's REST API (free tier, no card needed). */
export class ResendSender implements EmailSender {
  constructor(
    private apiKey: string,
    private from: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(email: Email): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) {
      throw new Error(`Resend rejected the email (${res.status}): ${await res.text().catch(() => "")}`);
    }
  }
}

/** Development and tests: keeps emails in memory and logs a line instead of sending. */
export class MemorySender implements EmailSender {
  sent: Email[] = [];

  async send(email: Email): Promise<void> {
    this.sent.push(email);
    if (process.env.NODE_ENV !== "test") console.log(`[email] to=${email.to} subject="${email.subject}"`);
  }
}

export function createSender(config: Config): EmailSender {
  return config.RESEND_API_KEY ? new ResendSender(config.RESEND_API_KEY, config.EMAIL_FROM) : new MemorySender();
}
