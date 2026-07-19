import type { EmailOtpType } from "@supabase/supabase-js";

const INTERNAL_ORIGIN = "https://todaypaper.invalid";
const UNSAFE_PATH_CHARACTERS = /[\\\u0000-\u001F\u007F]/;

export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    UNSAFE_PATH_CHARACTERS.test(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function authConfirmationDestination(
  type: EmailOtpType | null,
  requestedNext: string | null | undefined,
): string {
  const fallback = type === "recovery" ? "/reset-password" : "/dashboard";
  return safeInternalPath(requestedNext, fallback);
}
