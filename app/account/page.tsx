import type { Metadata } from "next";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "账户",
  description: "查看 TodayPaper 账户与登录安全设置。",
};

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user) redirect("/login?next=/account");

  return (
    <PageContainer className="py-10 sm:py-14">
      <div className="mb-9">
        <p className="text-xs font-semibold tracking-[0.22em] text-brand uppercase">
          Reader Account
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          我的账户
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-ink">
          管理登录方式和账户安全。账户密码由 Supabase Auth 安全保存。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5 text-brand" aria-hidden="true" />
              登录邮箱
            </CardTitle>
            <CardDescription>用于登录和接收账户验证邮件</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="break-all text-sm font-medium">{user.email}</p>
            <Badge variant={user.email_confirmed_at ? "success" : "neutral"}>
              {user.email_confirmed_at ? (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              ) : null}
              {user.email_confirmed_at ? "邮箱已验证" : "邮箱待验证"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-brand" aria-hidden="true" />
              账户安全
            </CardTitle>
            <CardDescription>
              修改密码时会向登录邮箱发送一次性验证邮件
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/forgot-password">
                <KeyRound />
                设置或修改密码
              </Link>
            </Button>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="secondary" className="w-full">
                退出登录
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
