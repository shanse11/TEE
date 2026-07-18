import { UserRound } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

import { MobileNav } from "./mobile-nav";
import { DesktopNavigation } from "./navigation";
import { PageContainer } from "./page-container";
import { getOptionalCurrentUser } from "@/lib/auth/current-user";

export async function SiteHeader() {
  const user = await getOptionalCurrentUser();
  return (
    <header
      className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-sm"
      data-print-hidden
    >
      <PageContainer className="relative flex h-16 items-center justify-between gap-6">
        <Logo />
        <DesktopNavigation />
        <div className="ml-auto hidden lg:block">
          {user ? (
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href="/account">
                  <UserRound />
                  {user.email ?? "进入主页"}
                </Link>
              </Button>
              {user.mode === "supabase" ? (
                <form action="/auth/signout" method="post">
                  <Button type="submit" variant="ghost" size="sm">
                    退出
                  </Button>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">
                  <UserRound />
                  登录
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">注册</Link>
              </Button>
            </div>
          )}
        </div>
        <MobileNav authenticated={Boolean(user)} />
      </PageContainer>
    </header>
  );
}
