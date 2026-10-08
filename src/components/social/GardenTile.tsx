import Link from "next/link";
import { type GardenCard, photoUrl } from "@/lib/sharing";
import { PLANT_COLORS } from "@/lib/garden/plants";

/** A public garden in Explore or on a profile: cover photo (or its crops), name, owner and cheers. */
export function GardenTile({ card, showOwner = true }: { card: GardenCard; showOwner?: boolean }) {
  return (
    <Link
      href={`/g/${card.id}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] bg-cream">
        {card.coverPhotoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own photo endpoint
          <img src={photoUrl(card.coverPhotoId, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full grid-cols-3 gap-1.5 p-4" aria-hidden>
            {card.crops.slice(0, 6).map((c) => (
              <span key={c.plantId} className="flex items-center justify-center rounded-2xl text-3xl" style={{ background: `${PLANT_COLORS[c.plantId] ?? "#9ca3af"}26` }}>
                {c.emoji}
              </span>
            ))}
          </div>
        )}
        {card.photoCount > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white">{card.photoCount} photos</span>
        )}
      </div>
      <div className="p-3.5">
        <p className="truncate font-display text-lg font-semibold leading-tight group-hover:text-leaf-700">{card.name}</p>
        <p className="mt-0.5 truncate text-sm text-muted">
          {showOwner && <>{card.ownerName} · </>}
          {card.location}
        </p>
        <div className="mt-2 flex items-center justify-between text-xs text-faint">
          <span className="truncate">
            {card.crops
              .slice(0, 5)
              .map((c) => c.emoji)
              .join(" ")}{" "}
            {card.crops.length} crops
          </span>
          <span className="shrink-0 font-semibold text-leaf-700">🌱 {card.cheers}</span>
        </div>
      </div>
    </Link>
  );
}
