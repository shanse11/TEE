"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import {
  firstValidationMessage,
  resetPasswordFormSchema,
} from "@/lib/auth/forms";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = resetPasswordFormSchema.safeParse({
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setMessage(firstValidationMessage(parsed));
      return;
    }

    setLoading(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    setLoading(false);

    if (error) {
      setMessage("密码设置失败，恢复链接可能已失效，请重新申请。");
      return;
    }

    router.replace("/dashboard?password_updated=1");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <PasswordField
        id="reset-password"
        label="新密码"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="至少 8 位，包含字母和数字"
      />
      <PasswordField
        id="reset-confirm-password"
        label="确认新密码"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        placeholder="再次输入新密码"
      />
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !password || !confirmPassword}
      >
        {loading ? "正在保存…" : "保存新密码"}
      </Button>
      {message ? (
        <p className="text-sm leading-6 text-muted-ink" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
