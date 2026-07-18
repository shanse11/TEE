"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  firstValidationMessage,
  forgotPasswordFormSchema,
  loginFormSchema,
} from "@/lib/auth/forms";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm({
  configured,
  nextPath,
}: {
  configured: boolean;
  nextPath: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicMessage, setMagicMessage] = useState<string | null>(null);
  const [magicLoading, setMagicLoading] = useState(false);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setLoginMessage("当前环境尚未配置 Supabase Auth。");
      return;
    }
    const parsed = loginFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      setLoginMessage(firstValidationMessage(parsed));
      return;
    }

    setLoginLoading(true);
    setLoginMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoginLoading(false);

    if (error) {
      setLoginMessage("邮箱或密码错误，或邮箱尚未完成验证。");
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  async function submitMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setMagicMessage("当前环境尚未配置 Supabase Auth。");
      return;
    }
    const parsed = forgotPasswordFormSchema.safeParse({ email: magicEmail });
    if (!parsed.success) {
      setMagicMessage(firstValidationMessage(parsed));
      return;
    }

    setMagicLoading(true);
    setMagicMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
      },
    });
    setMagicLoading(false);
    setMagicMessage(
      error ? "登录链接发送失败，请稍后重试。" : "登录链接已发送，请检查邮箱。",
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submitPassword} className="space-y-5" noValidate>
        <div>
          <Label htmlFor="login-email">邮箱</Label>
          <div className="relative mt-2">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-ink"
              aria-hidden="true"
            />
            <Input
              id="login-email"
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
          id="login-password"
          label="密码"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand hover:underline"
          >
            忘记密码或首次设置密码
          </Link>
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loginLoading || !email.trim() || !password}
        >
          {loginLoading ? "正在登录…" : "登录"}
        </Button>
        {loginMessage ? (
          <p className="text-sm leading-6 text-muted-ink" role="status">
            {loginMessage}
          </p>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-ink">
        还没有账号？{" "}
        <Link href="/register" className="font-medium text-brand hover:underline">
          注册
        </Link>
      </p>

      <details className="rounded-md border border-line bg-soft/50 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          使用邮箱一次性链接登录
        </summary>
        <form onSubmit={submitMagicLink} className="mt-4 space-y-4" noValidate>
          <div>
            <Label htmlFor="magic-email">邮箱</Label>
            <div className="relative mt-2">
              <Mail
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-ink"
                aria-hidden="true"
              />
              <Input
                id="magic-email"
                type="email"
                required
                autoComplete="email"
                value={magicEmail}
                onChange={(event) => setMagicEmail(event.target.value)}
                className="pl-10"
                placeholder="you@example.com"
              />
            </div>
          </div>
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={magicLoading || !magicEmail.trim()}
          >
            {magicLoading ? "正在发送…" : "发送一次性登录链接"}
          </Button>
          {magicMessage ? (
            <p className="text-sm leading-6 text-muted-ink" role="status">
              {magicMessage}
            </p>
          ) : null}
        </form>
      </details>
    </div>
  );
}
