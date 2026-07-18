import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseAuthConfig } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "登录",
  description: "通过邮箱 Magic Link 登录 TodayPaper。",
};

export default function LoginPage() {
  return (
    <PageContainer className="grid min-h-[70vh] place-items-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.22em] text-brand uppercase">
            Reader Sign In
          </p>
          <CardTitle className="font-serif text-3xl">登录今日报纸</CardTitle>
          <p className="text-sm leading-6 text-muted-ink">
            输入邮箱，我们会发送一次性登录链接，无需设置密码。
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm configured={hasSupabaseAuthConfig()} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
