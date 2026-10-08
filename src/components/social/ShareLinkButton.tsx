"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Share or copy the current page's link. */
export function ShareLinkButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-paper px-4 text-sm font-semibold hover:border-leaf-400 hover:bg-leaf-50"
    >
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
