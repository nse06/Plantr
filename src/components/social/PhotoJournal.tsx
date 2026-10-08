"use client";

import { useState } from "react";
import { Camera, EyeOff, ImagePlus, Trash2, X } from "lucide-react";
import { fmtLong, fmtShort } from "@/lib/garden/dates";
import { type PhotoMeta, photoUrl } from "@/lib/sharing";
import { prepareImage } from "@/components/wizard/image";
import { Button, Card, Spinner, cx } from "@/components/ui";

/**
 * A garden's photo updates. Owners can post and delete; everyone else sees a read-only gallery.
 * Photos are resized in the browser (which also strips location metadata) before upload.
 */
export function PhotoJournal({
  gardenId,
  initial,
  editable,
  title = "Photos",
  onCountChange,
}: {
  gardenId: string;
  initial: PhotoMeta[];
  editable: boolean;
  title?: string;
  onCountChange?: (count: number) => void;
}) {
  const [photos, setPhotosState] = useState(initial);
  // Updates only happen in event handlers (one at a time), so the current list is up to date.
  const setPhotos = (next: PhotoMeta[]) => {
    setPhotosState(next);
    onCountChange?.(next.length);
  };
  const [draft, setDraft] = useState<{ full: string; thumb: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PhotoMeta | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const { full, thumb } = await prepareImage(file, { full: 1280, thumb: 720 });
      setDraft({ full, thumb });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read that photo.");
    }
  }

  async function post() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/gardens/${gardenId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: draft.full, thumb: draft.thumb, caption: caption.trim() || null }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { photo?: PhotoMeta; error?: string } | null;
    if (res?.ok && data?.photo) {
      setPhotos([data.photo, ...photos]);
      setDraft(null);
      setCaption("");
    } else {
      setError(data?.error ?? "Couldn't post that photo. Try again.");
    }
    setBusy(false);
  }

  async function remove(photo: PhotoMeta) {
    if (!confirm("Delete this photo?")) return;
    const res = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      setPhotos(photos.filter((p) => p.id !== photo.id));
      setOpen(null);
    }
  }

  if (!editable && photos.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        {editable && !draft && (
          <label className={cx("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-leaf-600 px-3.5 text-sm font-semibold text-white hover:bg-leaf-700")}>
            <Camera className="h-4 w-4" /> Add a photo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {draft && (
        <Card className="mb-4 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={draft.full} alt="New photo" className="max-h-80 w-full object-cover" />
          <div className="space-y-3 p-4">
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 200))}
              placeholder="Add a caption (optional): first tomatoes!"
              className="h-11 w-full rounded-xl border border-line-strong bg-paper px-3 focus:border-leaf-500 focus:outline-none"
              aria-label="Caption"
            />
            <div className="flex gap-2">
              <Button onClick={() => void post()} disabled={busy}>
                {busy ? <Spinner /> : "Post photo"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}
      {error && <p className="mb-3 rounded-xl bg-clay-50 px-4 py-3 text-sm text-clay-700">{error}</p>}

      {photos.length ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p)} className="group relative block w-full overflow-hidden rounded-2xl bg-cream text-left">
                {/* eslint-disable-next-line @next/next/no-img-element -- served from our own photo endpoint */}
                <img src={photoUrl(p.id, "thumb")} alt={p.caption ?? "Garden photo"} loading="lazy" className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6 text-xs font-semibold text-white">
                  {fmtShort(p.createdAt.slice(0, 10))}
                  {p.caption ? ` · ${p.caption}` : ""}
                </span>
                {p.hidden && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                    <EyeOff className="h-3 w-3" /> Hidden
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        editable &&
        !draft && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-leaf-300 bg-leaf-50/60 px-6 py-8 text-center hover:border-leaf-500">
            <ImagePlus className="h-7 w-7 text-leaf-600" />
            <span className="font-semibold">Start a photo diary</span>
            <span className="max-w-sm text-sm text-muted">Snap your seedlings, your first harvest, your windowsill. It&apos;s fun to look back on, and it shows on your public page if you share this garden.</span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
        )
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 p-4" role="dialog" aria-modal="true" aria-label="Photo">
          <div className="flex justify-end gap-2">
            {editable && (
              <button type="button" onClick={() => void remove(open)} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center py-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- served from our own photo endpoint */}
            <img src={photoUrl(open.id)} alt={open.caption ?? "Garden photo"} className="max-h-full max-w-full rounded-xl object-contain" />
          </div>
          <p className="text-center text-sm text-white/80">
            {fmtLong(open.createdAt.slice(0, 10))}
            {open.caption ? ` · ${open.caption}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}
