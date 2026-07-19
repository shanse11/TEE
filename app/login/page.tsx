import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptionalCurrentUser } from "@/lib/auth/current-user";
import { safeInternalPath } from "@/lib/auth/redirect";
import { hasSupabaseAuthConfig } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "登录",
  description: "通过邮箱和密码登录 TodayPaper。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
    password_updated?: string | string[];
  }>;
}) {
  const user = await getOptionalCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = safeInternalPath(nextValue);
  const errorValue = Array.isArray(params.error) ? params.error[0] : params.error;
  const passwordUpdated =
    (Array.isArray(params.password_updated)
      ? params.password_updated[0]
      : params.password_updated) === "1";

  return (
    <PageContainer className="grid min-h-[70vh] place-items-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.22em] text-brand uppercase">
            Reader Sign In
          </p>
          <CardTitle className="font-serif text-3xl">登录今日报纸</CardTitle>
          <p className="text-sm leading-6 text-muted-ink">
            使用邮箱和密码登录，继续查看你的订阅与历史日报。
          </p>
        </CardHeader>
        <CardContent>
          {errorValue ? (
            <p
              className="mb-5 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
              role="alert"
            >
              登录链接无效或已过期，请重新尝试。
            </p>
          ) : null}
          {passwordUpdated ? (
            <p
              className="mb-5 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success"
              role="status"
            >
              密码已更新，请使用新密码登录。
            </p>
          ) : null}
          <LoginForm
            configured={hasSupabaseAuthConfig()}
            nextPath={nextPath}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
