import { describe, expect, it, vi } from "vitest";
import { ResendEmailSender } from "@/lib/email/resend-email-sender";

const input = {
  to: "reader@example.com",
  subject: "今日报纸",
  html: "<p>摘要</p>",
  text: "摘要",
  idempotencyKey: "email:user:2026-07-18",
};

describe("ResendEmailSender", () => {
  it("发送 HTML/纯文本并设置幂等请求头", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
        input.idempotencyKey,
      );
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({ html: input.html, text: input.text });
      return Response.json({ id: "email-id" });
    });
    const sender = new ResendEmailSender({
      apiKey: "test-key",
      from: "TodayPaper <news@example.com>",
      fetcher,
    });
    await expect(sender.send(input)).resolves.toEqual({ id: "email-id" });
  });

  it("供应商失败时只抛出安全状态错误", async () => {
    const sender = new ResendEmailSender({
      apiKey: "test-key",
      from: "TodayPaper <news@example.com>",
      fetcher: async () => new Response("provider details", { status: 500 }),
    });
    await expect(sender.send(input)).rejects.toThrow("EMAIL_PROVIDER_500");
  });

  it("超时会中止请求", async () => {
    const sender = new ResendEmailSender({
      apiKey: "test-key",
      from: "TodayPaper <news@example.com>",
      timeoutMs: 1000,
      fetcher: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    });
    await expect(sender.send(input)).rejects.toMatchObject({
      name: "AbortError",
    });
  }, 2000);
});
