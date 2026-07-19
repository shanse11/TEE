import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authConfirmationDestination } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_TYPES = new Set<EmailOtpType>([
  "email",
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
]);

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = authConfirmationDestination(
    type,
    url.searchParams.get("next"),
  );
  if (tokenHash && type && EMAIL_TYPES.has(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  const failurePath =
    type === "recovery"
      ? "/forgot-password?error=auth_confirm"
      : "/login?error=auth_confirm";
  return NextResponse.redirect(new URL(failurePath, url.origin));
}
