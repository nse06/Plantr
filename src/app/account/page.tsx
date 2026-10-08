import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { AccountSettings } from "@/components/auth/AccountSettings";
import { ProfileForm } from "@/components/social/ProfileForm";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 font-display text-4xl font-semibold">Account</h1>
      <section id="profile" className="mb-8 scroll-mt-24">
        <h2 className="font-display text-2xl font-semibold">Public profile</h2>
        <p className="mt-1 text-sm text-muted">Shown with any garden you choose to share.</p>
        <Card className="mt-3 p-5">
          <ProfileForm handle={user.handle} displayName={user.displayName} bio={user.bio} />
        </Card>
      </section>
      <AccountSettings email={user.email} digest={user.digest} />
    </div>
  );
}
