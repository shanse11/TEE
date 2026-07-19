"use client";

import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder = "请输入密码",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-2">
        <LockKeyhole
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-ink"
          aria-hidden="true"
        />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="px-10"
          placeholder={placeholder}
        />
        <button
          type="button"
          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-ink transition-colors hover:text-ink"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "隐藏密码" : "显示密码"}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
