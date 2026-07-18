import type {
  EmailSender,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/email-sender";

export class MockEmailSender implements EmailSender {
  readonly mode: "mock" | "unavailable";
  private readonly sent = new Map<string, SendEmailResult>();

  constructor(private readonly unavailable = false) {
    this.mode = unavailable ? "unavailable" : "mock";
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (this.unavailable) {
      throw new Error("EMAIL_NOT_CONFIGURED");
    }
    const existing = this.sent.get(input.idempotencyKey);
    if (existing) return existing;
    const result = { id: `mock-${input.idempotencyKey}` };
    this.sent.set(input.idempotencyKey, result);
    return result;
  }
}
