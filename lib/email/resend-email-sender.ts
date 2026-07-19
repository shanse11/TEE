import { z } from "zod";
import type {
  EmailSender,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/email-sender";

const responseSchema = z.object({ id: z.string().min(1) });
const MAX_RESPONSE_BYTES = 64 * 1024;

export interface ResendEmailSenderOptions {
  apiKey: string;
  from: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class ResendEmailSender implements EmailSender {
  readonly mode = "resend" as const;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: ResendEmailSenderOptions) {
    if (!options.apiKey || !options.from) {
      throw new Error("Resend 邮件配置不完整");
    }
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8000, 1000), 15_000);
    this.fetcher = options.fetcher ?? fetch;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
          "User-Agent": "TodayPaper/1.0",
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`EMAIL_PROVIDER_${response.status}`);
      }
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
        throw new Error("EMAIL_RESPONSE_TOO_LARGE");
      }
      return responseSchema.parse(JSON.parse(body) as unknown);
    } finally {
      clearTimeout(timeout);
    }
  }
}
