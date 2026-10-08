import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/server/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string; error?: string; reason?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error, reason } = await searchParams;
  const target = safeNext(next);
  if (await getCurrentUser()) redirect(target);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <Card className="p-6 sm:p-8">
        <div className="mb-6 text-center">
          <span className="text-4xl" aria-hidden>
            🌱
          </span>
          <h1 className="mt-2 font-display text-3xl font-semibold">{reason === "save" ? "Save your garden" : "Welcome back"}</h1>
          <p className="mt-2 text-muted">
            {reason === "save"
              ? "Sign in to keep your plan, check off tasks and get a weekly email with what to do next."
              : "Sign in to see your gardens and this week's to-dos."}
          </p>
        </div>
        {error && (
          <p className="mb-4 rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">
            {error === "expired"
              ? "That sign-in link has expired or was already used. Request a new code below."
              : "That sign-in link isn't valid."}
          </p>
        )}
        <LoginForm next={target} />
      </Card>
    </div>
  );
}
