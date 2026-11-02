import { notFound, redirect } from "next/navigation";

/** Analytics used to be four pages. Old links and bookmarks (/analytics/weekly …) now open the single Analytics page on that tab. */
export default async function OldAnalyticsLink({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params; if (!["daily", "weekly", "monthly", "yearly"].includes(period)) notFound();
  redirect(`/analytics?view=${period}`);
}
