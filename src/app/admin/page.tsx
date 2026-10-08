import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { isAdmin, openReports } from "@/lib/server/social";
import { ModerationList } from "@/components/social/ModerationList";

export const metadata: Metadata = { title: "Moderation", robots: { index: false } };

/** Admins (ADMIN_EMAILS) review reported gardens and photos. Everyone else gets a 404. */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) notFound();
  const reports = await openReports();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-4xl font-semibold">Reports</h1>
      <p className="mt-2 text-muted">
        Content with 3 or more reports is hidden automatically. Keep restores it and closes the reports; Remove deletes a photo, or takes a garden off
        public pages (the owner keeps it).
      </p>
      <div className="mt-6">
        <ModerationList initial={reports} />
      </div>
    </div>
  );
}
