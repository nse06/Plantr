import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { AccountSettings } from "@/components/auth/AccountSettings";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 font-display text-4xl font-semibold">Account</h1>
      <AccountSettings email={user.email} digest={user.digest} />
    </div>
  );
}
