import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/server/cron-auth";

describe("Cron Secret 授权", () => {
  it("只接受 Bearer Secret，缺失配置时一律拒绝", () => {
    const authorized = new Request("https://example.com/api/cron", {
      headers: { Authorization: "Bearer expected-secret" },
    });
    expect(isCronAuthorized(authorized, "expected-secret")).toBe(true);
    expect(isCronAuthorized(authorized, "other-secret")).toBe(false);
    expect(isCronAuthorized(authorized, undefined)).toBe(false);
    expect(
      isCronAuthorized(
        new Request("https://example.com/api/cron"),
        "expected-secret",
      ),
    ).toBe(false);
  });
});
