import path from "node:path";
import type { RepositoryBundle } from "@/types/backend";
import {
  hasSupabaseServerConfig,
  serverEnv,
} from "@/lib/config/env";
import { MemoryRepository } from "@/lib/repositories/memory-repository";
import { SupabaseRepository } from "@/lib/repositories/supabase-repository";

export function createRepositoryBundle(): RepositoryBundle {
  if (hasSupabaseServerConfig()) {
    return new SupabaseRepository({
      baseUrl: serverEnv.NEXT_PUBLIC_SUPABASE_URL ?? "",
      serviceRoleKey: serverEnv.SUPABASE_SERVICE_ROLE_KEY ?? "",
    });
  }
  return new MemoryRepository({
    seedDemo: serverEnv.NODE_ENV === "test",
    persistencePath:
      serverEnv.NODE_ENV === "development"
        ? path.join(process.cwd(), ".todaypaper", "local-state.json")
        : undefined,
  });
}
