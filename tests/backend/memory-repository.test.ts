import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import dailyIssueJson from "@/data/demo/daily-issue.json";
import {
  creationSchema,
  dailyIssueSchema,
} from "@/lib/api/schemas";
import { MemoryRepository } from "@/lib/repositories/memory-repository";

describe("MemoryRepository", () => {
  it("模拟 userId + issueDate 唯一约束", async () => {
    const repository = new MemoryRepository();
    await repository.startDailyIssue("demo-user", "2026-07-20");
    await expect(
      repository.startDailyIssue("demo-user", "2026-07-20"),
    ).rejects.toMatchObject({ code: "GENERATION_IN_PROGRESS" });
  });

  it("允许失败的日报任务在同一天重新开始", async () => {
    const repository = new MemoryRepository(false);
    await repository.startDailyIssue("demo-user", "2026-07-20");
    await repository.failDailyIssue(
      "demo-user",
      "2026-07-20",
      "INSUFFICIENT_ARTICLES",
    );

    await expect(
      repository.startDailyIssue("demo-user", "2026-07-20"),
    ).resolves.toMatchObject({
      status: "processing",
    });
  });

  it("完成后重复查询返回同一份日报", async () => {
    const repository = new MemoryRepository();
    const existing = await repository.findDailyIssue(
      "demo-user",
      "2026-07-18",
    );
    expect(existing?.status).toBe("completed");
    expect(existing?.issue?.id).toBe("demo-daily");
  });

  it("普通运行模式不预置固定演示日报", async () => {
    const repository = new MemoryRepository(false);
    await expect(
      repository.findDailyIssue("demo-user", "2026-07-18"),
    ).resolves.toBeNull();
    await expect(
      repository.listSubscriptions("demo-user"),
    ).resolves.toEqual([]);
  });

  it("本地持久化模式在新实例中恢复日报与历史作品", async () => {
    const directory = mkdtempSync(join(tmpdir(), "todaypaper-"));
    const persistencePath = join(directory, "local-state.json");
    try {
      const issue = dailyIssueSchema.parse(dailyIssueJson);
      const first = new MemoryRepository({
        seedDemo: false,
        persistencePath,
      });
      await first.startDailyIssue(issue.userId, issue.issueDate);
      await first.completeDailyIssue(issue);
      await first.saveCreation(
        issue.userId,
        creationSchema.parse({
          id: `creation-${issue.id}`,
          type: "daily_issue",
          title: `${issue.issueDate} 个人日报`,
          description: issue.dailyBriefing,
          coverImageUrl: "/images/demo/cover-daily.svg",
          createdAt: issue.createdAt,
          href: `/newspaper/${issue.id}`,
          saved: true,
        }),
      );

      const second = new MemoryRepository({
        seedDemo: false,
        persistencePath,
      });
      const issues = await second.listDailyIssues(issue.userId, 1, 20);
      const creations = await second.listCreations(issue.userId, {
        type: "daily_issue",
        offset: 0,
        limit: 20,
      });

      expect(issues.items[0]?.id).toBe(issue.id);
      expect(creations.items[0]?.href).toBe(`/newspaper/${issue.id}`);
      expect(second.persistent).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
