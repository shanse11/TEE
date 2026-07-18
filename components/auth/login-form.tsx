"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setMessage("当前环境尚未配置 Supabase Auth。");
      return;
    }
    setLoading(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    setLoading(false);
    setMessage(
      error ? "登录链接发送失败，请稍后重试。" : "登录链接已发送，请检查邮箱。",
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
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
      <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
        {loading ? "正在发送…" : "发送登录链接"}
      </Button>
      {message ? (
        <p className="text-sm leading-6 text-muted-ink" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
