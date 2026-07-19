import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      verifyOtp: authMocks.verifyOtp,
    },
  })),
}));

import { GET as confirmAuth } from "@/app/auth/confirm/route";

describe("认证确认回调", () => {
  beforeEach(() => {
    authMocks.verifyOtp.mockResolvedValue({ error: null });
  });

  it("邮箱确认成功后跳转到安全站内路径", async () => {
    const response = await confirmAuth(
      new Request(
        "https://todaypaper.example/auth/confirm?token_hash=test-hash&type=email&next=/creations",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://todaypaper.example/creations",
    );
    expect(authMocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "test-hash",
      type: "email",
    });
  });

  it("密码恢复成功后默认进入设置密码页", async () => {
    const response = await confirmAuth(
      new Request(
        "https://todaypaper.example/auth/confirm?token_hash=test-hash&type=recovery",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://todaypaper.example/reset-password",
    );
  });

  it("拒绝外部 next 并回退到 dashboard", async () => {
    const response = await confirmAuth(
      new Request(
        "https://todaypaper.example/auth/confirm?token_hash=test-hash&type=email&next=//evil.example",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://todaypaper.example/dashboard",
    );
  });

  it("恢复令牌验证失败时返回重新申请页面", async () => {
    authMocks.verifyOtp.mockResolvedValue({
      error: new Error("invalid token"),
    });
    const response = await confirmAuth(
      new Request(
        "https://todaypaper.example/auth/confirm?token_hash=test-hash&type=recovery",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://todaypaper.example/forgot-password?error=auth_confirm",
    );
  });
});
