import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptionalCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "设置新密码",
  description: "为 TodayPaper 账户设置新密码。",
};

export default async function ResetPasswordPage() {
  const user = await getOptionalCurrentUser();
  if (!user) redirect("/forgot-password?error=invalid_session");

  return (
    <PageContainer className="grid min-h-[70vh] place-items-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.22em] text-brand uppercase">
            New Password
          </p>
          <CardTitle className="font-serif text-3xl">设置新密码</CardTitle>
          <p className="text-sm leading-6 text-muted-ink">
            密码至少 8 位，并包含字母和数字。
          </p>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
