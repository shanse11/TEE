import { describe, expect, it, vi } from "vitest";
import type { EmailSender } from "@/lib/email/email-sender";
import type { NewsProvider } from "@/types/backend";
import { MockLLMClient } from "@/lib/ai/mock-client";
import { MemoryRepository } from "@/lib/repositories/memory-repository";
import { DailyIssueService } from "@/lib/services/daily-issue-service";
import { DeliveryService } from "@/lib/services/delivery-service";
import { NewsSearchService } from "@/lib/services/news-search-service";

const NOW = Date.parse("2026-07-18T00:00:00.000Z");

async function setup(sender: EmailSender) {
  const repository = new MemoryRepository();
  const now = new Date(NOW).toISOString();
  await repository.replaceSubscriptions(
    "mail-user",
    [
      {
        id: "sub-mail",
        userId: "mail-user",
        topic: "人工智能",
        keywords: ["大模型"],
        enabled: true,
        todayUpdateCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    {
      email: "reader@example.com",
      dailyDelivery: true,
      deliveryTime: "08:00",
    },
  );
  const provider: NewsProvider = {
    name: "live",
    dataMode: "live",
    async search() {
      return Array.from({ length: 6 }, (_, index) => ({
        id: `mail-news-${index}`,
        title: `人工智能新闻 ${index}`,
        description: `人工智能行业新闻摘要 ${index}`,
        source: "Live Source",
        sourceUrl: `https://news.example.com/mail-${index}`,
        publishedAt: new Date(NOW - index * 1000).toISOString(),
        category: "人工智能",
        keywords: ["人工智能"],
      }));
    },
  };
  const daily = new DailyIssueService(
    new NewsSearchService(provider, () => NOW),
    new MockLLMClient(),
    repository,
    () => NOW,
    false,
  );
  return {
    repository,
    delivery: new DeliveryService(
      daily,
      repository,
      sender,
      "https://todaypaper.example.com",
    ),
  };
}

describe("真实投递服务", () => {
  it("邮件失败时保留已生成日报并记录安全失败码", async () => {
    const sender: EmailSender = {
      mode: "resend",
      async send() {
        throw new Error("raw provider response");
      },
    };
    const { delivery, repository } = await setup(sender);
    const result = await delivery.deliver({
      userId: "mail-user",
      issueDate: "2026-07-18",
    });
    expect(result.status).toBe("partial");
    expect(
      await repository.findDailyIssue("mail-user", "2026-07-18"),
    ).toMatchObject({ status: "completed" });
    expect(
      await repository.findDeliveryByKey("email:mail-user:2026-07-18"),
    ).toMatchObject({
      status: "failed",
      errorMessage: "EMAIL_SEND_FAILED",
    });
  });

  it("重复触发不会发送第二封相同日报", async () => {
    const send = vi.fn(async () => ({ id: "email-id" }));
    const sender: EmailSender = { mode: "resend", send };
    const { delivery } = await setup(sender);
    await delivery.deliver({
      userId: "mail-user",
      issueDate: "2026-07-18",
    });
    await delivery.deliver({
      userId: "mail-user",
      issueDate: "2026-07-18",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
