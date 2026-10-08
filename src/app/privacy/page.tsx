import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold">Privacy, in plain English</h1>
      <div className="mt-6 space-y-5 text-[17px] leading-relaxed text-muted">
        <p>
          <strong className="text-ink">Your photo.</strong> When you add a photo, it&apos;s sent to our AI provider (Anthropic) to estimate your
          space&apos;s size and sunlight. We store only a small thumbnail on your plan, never the original photo. To avoid paying twice for the
          same request, we keep the AI&apos;s written results (never the photo itself) for up to 30 days, filed under a one-way fingerprint of the
          request.
        </p>
        <p>
          <strong className="text-ink">Your plan.</strong> We store your answers (ZIP code, space, preferences) and the plan we generate so you can
          come back to it. Plan links are private and unguessable, but anyone you share a link with can view that plan.
        </p>
        <p>
          <strong className="text-ink">Sharing your garden.</strong> Gardens are private unless you turn on sharing for one. A shared garden&apos;s
          name, plants, layout, progress and the photos you add are visible to anyone, along with your profile name, state and growing zone. We
          never show your ZIP code or email address. Photos are resized and stripped of location data before we store them. You can stop sharing
          or delete a photo anytime, and anyone can report something that shouldn&apos;t be there.
        </p>
        <p>
          <strong className="text-ink">Your account.</strong> We store your email address to sign you in and, if you keep it on, to send one weekly
          garden email. Every email has a one-click unsubscribe link.
        </p>
        <p>
          <strong className="text-ink">What we don&apos;t do.</strong> We don&apos;t sell your data, run ads, or use third-party tracking cookies.
          The only cookies we set keep you signed in and remember plans you made before signing up.
        </p>
        <p>
          <strong className="text-ink">Deleting your data.</strong> You can delete your account and everything in it anytime from your account page.
        </p>
      </div>
    </div>
  );
}
