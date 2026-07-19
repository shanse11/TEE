import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase Auth 未配置");
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component 不能写 Cookie；proxy 会负责刷新会话。
        }
      },
    },
  });
}
