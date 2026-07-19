import type { Metadata } from "next";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { PageContainer } from "@/components/layout/page-container";

export const metadata: Metadata = {
  title: "我的日报",
  description: "查看 TodayPaper 个性化日报与每日 08:00 投递状态。",
};

export default function DashboardPage() {
  return (
    <PageContainer className="py-10 sm:py-14">
      <DashboardClient />
    </PageContainer>
  );
}
