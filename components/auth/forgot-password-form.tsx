"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  firstValidationMessage,
  forgotPasswordFormSchema,
} from "@/lib/auth/forms";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const GENERIC_SUCCESS =
  "如果该邮箱已注册，我们会发送密码设置邮件，请检查收件箱。";

export function ForgotPasswordForm({
  configured,
}: {
  configured: boolean;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setMessage("当前环境尚未配置 Supabase Auth。");
      return;
    }
    const parsed = forgotPasswordFormSchema.safeParse({ email });
    if (!parsed.success) {
      setMessage(firstValidationMessage(parsed));
      return;
    }

    setLoading(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setLoading(false);
    setMessage(GENERIC_SUCCESS);
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="forgot-password-email">邮箱</Label>
        <div className="relative mt-2">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-ink"
            aria-hidden="true"
          />
          <Input
            id="forgot-password-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="pl-10"
            placeholder="you@example.com"
          />
        </div>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !email.trim()}
      >
        {loading ? "正在发送…" : "发送密码设置邮件"}
      </Button>
      {message ? (
        <p className="text-sm leading-6 text-muted-ink" role="status">
          {message}
        </p>
      ) : null}
      <p className="text-center text-sm text-muted-ink">
        <Link href="/login" className="font-medium text-brand hover:underline">
          返回登录
        </Link>
      </p>
    </form>
  );
}
