import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptionalCurrentUser } from "@/lib/auth/current-user";
import { hasSupabaseAuthConfig } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "注册",
  description: "使用邮箱和密码注册 TodayPaper。",
};

export default async function RegisterPage() {
  const user = await getOptionalCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <PageContainer className="grid min-h-[70vh] place-items-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.22em] text-brand uppercase">
            Create Reader Account
          </p>
          <CardTitle className="font-serif text-3xl">注册今日报纸</CardTitle>
          <p className="text-sm leading-6 text-muted-ink">
            注册后请在邮箱中完成验证，之后即可使用密码登录。
          </p>
        </CardHeader>
        <CardContent>
          <RegisterForm configured={hasSupabaseAuthConfig()} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
