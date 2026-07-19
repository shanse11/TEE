import { describe, expect, it } from "vitest";

import {
  loginFormSchema,
  registerFormSchema,
  resetPasswordFormSchema,
} from "@/lib/auth/forms";
import {
  authConfirmationDestination,
  safeInternalPath,
} from "@/lib/auth/redirect";
import { PROTECTED_PREFIXES } from "@/proxy";

describe("认证表单校验", () => {
  it("接受符合要求的注册信息", () => {
    expect(
      registerFormSchema.safeParse({
        email: "reader@example.test",
        password: "Today123",
        confirmPassword: "Today123",
      }).success,
    ).toBe(true);
  });

  it("拒绝过短、缺少字母或缺少数字的密码", () => {
    for (const password of ["Abc123", "12345678", "abcdefgh"]) {
      expect(
        registerFormSchema.safeParse({
          email: "reader@example.test",
          password,
          confirmPassword: password,
        }).success,
      ).toBe(false);
    }
  });

  it("拒绝两次输入不一致的密码", () => {
    expect(
      resetPasswordFormSchema.safeParse({
        password: "Today123",
        confirmPassword: "Today456",
      }).success,
    ).toBe(false);
  });

  it("校验登录邮箱和密码必填", () => {
    expect(
      loginFormSchema.safeParse({
        email: "not-an-email",
        password: "",
      }).success,
    ).toBe(false);
  });
});

describe("认证跳转安全", () => {
  it("保留安全站内路径及查询参数", () => {
    expect(safeInternalPath("/creations?type=daily_issue")).toBe(
      "/creations?type=daily_issue",
    );
  });

  it("拒绝外部、协议相对、反斜杠和编码后的危险路径", () => {
    for (const path of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "%2F%2Fevil.example",
    ]) {
      expect(safeInternalPath(path)).toBe("/dashboard");
    }
  });

  it("恢复邮件默认进入设置密码页，其他邮件默认进入首页", () => {
    expect(authConfirmationDestination("recovery", null)).toBe(
      "/reset-password",
    );
    expect(authConfirmationDestination("email", null)).toBe("/dashboard");
  });

  it("账户页受登录保护", () => {
    expect(PROTECTED_PREFIXES).toContain("/account");
  });
});
