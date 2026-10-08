import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { getProfile } from "@/lib/server/social";
import { initials } from "@/lib/sharing";
import { GardenTile } from "@/components/social/GardenTile";
import { ButtonLink, Card, buttonClass } from "@/components/ui";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfile(handle.toLowerCase());
  if (!profile) return { title: "Gardener" };
  const name = profile.displayName || profile.handle;
  return { title: `${name}'s gardens`, description: profile.bio ?? `${name} plans their garden with Plantr.` };
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  const profile = await getProfile(handle.toLowerCase());
  if (!profile) notFound();
  const viewer = await getCurrentUser();
  const isMe = viewer?.id === profile.id;
  const name = profile.displayName || profile.handle;
  const since = new Date(profile.memberSince).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:pt-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-leaf-100 font-display text-3xl font-semibold text-leaf-700">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl font-semibold leading-tight">{name}</h1>
          <p className="text-muted">
            @{profile.handle} · Growing with Plantr since {since}
          </p>
          {profile.bio && <p className="mt-2 max-w-xl text-[17px] leading-relaxed">{profile.bio}</p>}
        </div>
        {isMe && (
          <Link href="/account#profile" className={buttonClass("secondary", "sm")}>
            Edit profile
          </Link>
        )}
      </div>

      <h2 className="mt-10 font-display text-2xl font-semibold">Gardens</h2>
      {profile.gardens.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profile.gardens.map((card) => (
            <GardenTile key={card.id} card={card} showOwner={false} />
          ))}
        </div>
      ) : (
        <Card className="mt-4 p-6 text-muted">
          {isMe ? (
            <>
              Nothing shared yet. Open one of your gardens and turn on <span className="font-semibold text-ink">Share on your profile</span>.{" "}
              <ButtonLink href="/garden" variant="ghost" size="sm">
                My gardens
              </ButtonLink>
            </>
          ) : (
            "No shared gardens yet."
          )}
        </Card>
      )}
    </div>
  );
}
