"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  firstValidationMessage,
  registerFormSchema,
} from "@/lib/auth/forms";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function RegisterForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setMessage("当前环境尚未配置 Supabase Auth。");
      return;
    }
    const parsed = registerFormSchema.safeParse({
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setSuccess(false);
      setMessage(firstValidationMessage(parsed));
      return;
    }

    setLoading(true);
    setSuccess(false);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);

    if (error) {
      setMessage("注册请求暂时失败，请稍后重试。");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
    setMessage("验证邮件已发送，请前往邮箱完成注册。");
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="register-email">邮箱</Label>
        <div className="relative mt-2">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-ink"
            aria-hidden="true"
          />
          <Input
            id="register-email"
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
      <PasswordField
        id="register-password"
        label="密码"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="至少 8 位，包含字母和数字"
      />
      <PasswordField
        id="register-confirm-password"
        label="确认密码"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        placeholder="再次输入密码"
      />
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !email.trim() || !password || !confirmPassword}
      >
        {loading ? "正在注册…" : "注册"}
      </Button>
      {message ? (
        <p
          className={success ? "text-sm text-success" : "text-sm text-muted-ink"}
          role="status"
        >
          {message}
        </p>
      ) : null}
      <p className="text-center text-sm text-muted-ink">
        已有账号？{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          返回登录
        </Link>
      </p>
      <p className="text-center text-xs leading-5 text-muted-ink">
        如果你此前使用一次性链接登录，请不要重复注册，前往{" "}
        <Link href="/forgot-password" className="text-brand hover:underline">
          设置密码
        </Link>
        。
      </p>
    </form>
  );
}
