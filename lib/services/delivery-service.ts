import type { DeliveryResult } from "@/types";
import type { RepositoryBundle } from "@/types/backend";
import type { DailyIssueService } from "@/lib/services/daily-issue-service";
import { stableHash } from "@/lib/security/stable-id";
import type { EmailSender } from "@/lib/email/email-sender";
import { MockEmailSender } from "@/lib/email/mock-email-sender";
import { renderDailyIssueEmail } from "@/lib/email/daily-issue-email";
import { shanghaiDate } from "@/lib/time/shanghai";
import { BackendError } from "@/lib/errors";
import { ERROR_CODES } from "@/types/backend";

export class DeliveryService {
  constructor(
    private readonly dailyIssueService: DailyIssueService,
    private readonly repository: RepositoryBundle,
    private readonly emailSender: EmailSender = new MockEmailSender(),
    private readonly appUrl = "http://localhost:3000",
  ) {}

  async simulate(input: {
    userId: string;
    issueDate?: string;
  }): Promise<DeliveryResult> {
    const issueDate =
      input.issueDate ?? shanghaiDate();
    const key = `simulate:${input.userId}:${issueDate}`;
    const existingLog = await this.repository.findDeliveryByKey(key);
    if (existingLog) {
      const record = await this.repository.findDailyIssue(
        input.userId,
        issueDate,
      );
      if (record?.issue) {
        return {
          issue: record.issue,
          emailSent: false,
          status: "partial",
          message: "今日份日报已模拟生成，本次未重复投递。",
        };
      }
    }

    const subscriptions = await this.repository.listSubscriptions(
      input.userId,
    );
    const topics = subscriptions
      .filter((subscription) => subscription.enabled)
      .map((subscription) => subscription.topic);
    const generated = await this.dailyIssueService.generate({
      userId: input.userId,
      issueDate,
      topics: topics.length > 0 ? topics : ["人工智能", "科技数码", "商业财经"],
    });

    await this.repository.saveDeliveryLog({
      id: `delivery-${stableHash(key)}`,
      userId: input.userId,
      issueId: generated.data.id,
      channel: "simulation",
      status: "simulated",
      sentAt: new Date().toISOString(),
      idempotencyKey: key,
    });

    return {
      issue: generated.data,
      emailSent: false,
      status: "partial",
      message: "日报模拟生成完成；演示接口不会发送真实邮件。",
    };
  }

  async deliver(input: {
    userId: string;
    issueDate?: string;
    retryFailed?: boolean;
  }): Promise<DeliveryResult> {
    const issueDate = input.issueDate ?? shanghaiDate();
    const settings = await this.repository.getDeliverySettings(input.userId);
    const subscriptions = (
      await this.repository.listSubscriptions(input.userId)
    ).filter((subscription) => subscription.enabled);
    if (!settings.dailyDelivery || !settings.email || subscriptions.length === 0) {
      throw new BackendError({
        code: ERROR_CODES.INVALID_INPUT,
        message: "请先启用邮件投递并保存至少一个订阅。",
        retryable: false,
      });
    }

    const queries = Array.from(
      new Set(
        subscriptions.flatMap((subscription) => [
          subscription.topic,
          ...subscription.keywords,
        ]),
      ),
    );
    const generated = await this.dailyIssueService.generate({
      userId: input.userId,
      issueDate,
      topics: queries,
    });
    const key = `email:${input.userId}:${issueDate}`;
    const existing = await this.repository.findDeliveryByKey(key);
    if (
      existing?.status === "sent" ||
      existing?.status === "pending" ||
      (existing?.status === "failed" && !input.retryFailed)
    ) {
      return {
        issue: generated.data,
        emailSent: existing.status === "sent",
        status: existing.status === "sent" ? "completed" : "partial",
        message:
          existing.status === "sent"
            ? "今日份日报已经发送，本次未重复投递。"
            : "今日份日报已进入投递流程，本次未重复处理。",
      };
    }

    const logId = `delivery-${stableHash(key)}`;
    if (!existing) {
      const claimed = await this.repository.claimDeliveryJob({
        id: logId,
        userId: input.userId,
        issueId: generated.data.id,
        issueDate,
        channel: "email",
        idempotencyKey: key,
      });
      if (!claimed) {
        return {
          issue: generated.data,
          emailSent: false,
          status: "partial",
          message: "今日份日报已由另一个任务接管投递。",
        };
      }
    } else {
      await this.repository.saveDeliveryLog({
        ...existing,
        status: "pending",
        errorMessage: undefined,
      });
    }

    const email = renderDailyIssueEmail({
      issue: generated.data,
      appUrl: this.appUrl,
    });
    try {
      await this.emailSender.send({
        to: settings.email,
        ...email,
        idempotencyKey: key,
      });
      await this.repository.saveDeliveryLog({
        id: logId,
        userId: input.userId,
        issueId: generated.data.id,
        channel: "email",
        status: "sent",
        sentAt: new Date().toISOString(),
        idempotencyKey: key,
      });
      return {
        issue: generated.data,
        emailSent: this.emailSender.mode === "resend",
        status: "completed",
        message:
          this.emailSender.mode === "resend"
            ? "日报已生成并发送。"
            : "日报已生成；当前环境使用 Mock 邮件发送器。",
      };
    } catch {
      await this.repository.saveDeliveryLog({
        id: logId,
        userId: input.userId,
        issueId: generated.data.id,
        channel: "email",
        status: "failed",
        errorMessage: "EMAIL_SEND_FAILED",
        idempotencyKey: key,
      });
      return {
        issue: generated.data,
        emailSent: false,
        status: "partial",
        message: "日报已生成，但邮件发送失败，可稍后安全重试。",
      };
    }
  }
}
