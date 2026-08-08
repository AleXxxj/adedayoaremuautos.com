"use client";

import { useActionState } from "react";
import { mediaUrl } from "@/lib/media";
import type { ActionResult } from "@/lib/actions/vehicles";

interface Photo {
  id: string;
  storageKey: string;
  alt: string | null;
  isPrimary: boolean;
}

export function PhotoManager({
  vehicleId,
  photos,
  upload,
  remove,
}: {
  vehicleId: string;
  photos: Photo[];
  upload: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  remove: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
}) {
  const [uploadState, uploadAction, uploading] = useActionState(upload, null);
  const [removeState, removeAction] = useActionState(remove, null);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Photos
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          The first photo becomes the primary image used on listing cards.
        </p>
      </div>

      {(uploadState?.error || removeState?.error) && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {uploadState?.error ?? removeState?.error}
        </p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-lg border border-[var(--border-subtle)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(p.storageKey)}
                alt={p.alt ?? ""}
                className="aspect-square w-full object-cover"
              />
              {p.isPrimary && (
                <span className="absolute left-2 top-2 rounded bg-[var(--accent-500)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--surface-0)]">
                  Primary
                </span>
              )}
              <form action={removeAction}>
                <input type="hidden" name="mediaId" value={p.id} />
                <button
                  type="submit"
                  className="absolute right-2 top-2 rounded bg-[var(--surface-0)]/85 px-2 py-1 text-xs text-[var(--danger)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form
        action={uploadAction}
        className="rounded-lg border border-dashed border-[var(--border-default)] p-4"
      >
        <input type="hidden" name="vehicleId" value={vehicleId} />
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          required
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-3)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--text-primary)]"
        />
        <button
          type="submit"
          disabled={uploading}
          className="mt-3 rounded-lg bg-[var(--cta-bg)] px-4 py-2 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Upload photo"}
        </button>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          JPEG, PNG, WebP or AVIF. Maximum 10 MB.
        </p>
      </form>
    </section>
  );
}
