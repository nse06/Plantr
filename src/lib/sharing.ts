// Types and labels for public profiles and shared gardens, safe to use in the browser.
// The server side lives in src/lib/server/social.ts.

export interface GardenCard {
  id: string;
  name: string;
  handle: string;
  ownerName: string;
  location: string;
  season: string;
  crops: { plantId: string; emoji: string; name: string }[];
  plantCount: number;
  coverPhotoId: string | null;
  photoCount: number;
  cheers: number;
  updatedAt: string;
}

export interface PhotoMeta {
  id: string;
  caption: string | null;
  width: number;
  height: number;
  createdAt: string;
  hidden: boolean;
}

export const REPORT_REASONS = {
  spam: "Spam or not a garden",
  inappropriate: "Inappropriate or offensive",
  "personal-info": "Shows personal information",
  other: "Something else",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

export function photoUrl(id: string, size: "full" | "thumb" = "full"): string {
  return size === "thumb" ? `/api/photos/${id}?size=thumb` : `/api/photos/${id}`;
}

/** Up to two initials for an avatar: "Sam in DC" -> "SD", "sunny-basil-42" -> "SB". */
export function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter((w) => /[a-z]/i.test(w));
  if (words.length === 0) return "🌱";
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  return picked
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
