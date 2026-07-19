import {
  hasSupabaseAuthConfig,
  serverEnv,
} from "@/lib/config/env";
import { BackendError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ERROR_CODES } from "@/types/backend";

export interface CurrentUser {
  id: string;
  email?: string;
  mode: "supabase" | "development";
}

export async function getOptionalCurrentUser(): Promise<CurrentUser | null> {
  if (!hasSupabaseAuthConfig()) {
    if (serverEnv.NODE_ENV === "production") return null;
    return {
      id: serverEnv.DEMO_USER_ID,
      mode: "development",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || typeof subject !== "string" || subject.length === 0) {
    return null;
  }
  const email =
    typeof data?.claims?.email === "string"
      ? data.claims.email
      : undefined;
  return { id: subject, email, mode: "supabase" };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getOptionalCurrentUser();
  if (!user) {
    throw new BackendError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: "请先登录后再继续。",
      retryable: false,
    });
  }
  return user;
}
