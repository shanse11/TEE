export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface SendEmailResult {
  id: string;
}

export interface EmailSender {
  readonly mode: "resend" | "mock" | "unavailable";
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
