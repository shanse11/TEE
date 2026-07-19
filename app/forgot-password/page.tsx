import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseAuthConfig } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "设置密码",
  description: "找回密码，或为已有的 TodayPaper 账户首次设置密码。",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const errorValue = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <PageContainer className="grid min-h-[70vh] place-items-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.22em] text-brand uppercase">
            Password Access
          </p>
          <CardTitle className="font-serif text-3xl">找回或设置密码</CardTitle>
          <p className="text-sm leading-6 text-muted-ink">
            如果你此前使用一次性链接登录，也可以在这里为原账户设置密码。
          </p>
        </CardHeader>
        <CardContent>
          {errorValue ? (
            <p
              className="mb-5 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
              role="alert"
            >
              密码设置链接无效或已过期，请重新申请。
            </p>
          ) : null}
          <ForgotPasswordForm configured={hasSupabaseAuthConfig()} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
