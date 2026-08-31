"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mediaUrl } from "@/lib/media";
import type { ActionResult } from "@/lib/actions/vehicles";

interface Photo {
  id: string;
  storageKey: string;
  alt: string | null;
  isPrimary: boolean;
}

interface Outcome {
  name: string;
  ok: boolean;
  error?: string;
}

/**
 * Photographs for one vehicle.
 *
 * Uploads run one request per file rather than one request for the batch.
 * That is not a limitation being worked around, it is the only shape that
 * works: a phone photograph is routinely 3–5MB and a server action body is
 * capped at 10MB, so half a dozen pictures in a single request would be
 * rejected wholesale — and one oversized file would take the other five down
 * with it. Sent one at a time, each is judged on its own, a failure names the
 * file that failed, and everything else still lands.
 *
 * What was wrong before was the selecting, not the sending: the input took a
 * single file, so listing a car with eight photographs meant eight rounds of
 * choose-then-wait. The picker now takes the whole set at once and the
 * uploading happens unattended.
 */
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
  const [removeState, removeAction] = useActionState(remove, null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [chosen, setChosen] = useState<File[]>([]);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const failed = outcomes.filter((o) => !o.ok);
  const succeeded = outcomes.filter((o) => o.ok);

  async function uploadAll() {
    if (chosen.length === 0) return;
    setOutcomes([]);
    const results: Outcome[] = [];

    /*
     * The whole run is wrapped so that the controls always come back.
     *
     * Anything that escapes the per-file catch below — a session that expires
     * part-way through a long batch, which server-side throws rather than
     * returns — would otherwise leave the button reading "Uploading 3 of 8…"
     * with nothing running behind it and no way to try again short of
     * reloading the page. Being told the upload stopped is recoverable;
     * a button that lies about still working is not.
     */
    try {
      for (let i = 0; i < chosen.length; i++) {
        setBusy({ done: i, total: chosen.length });
        const file = chosen[i];
        const fd = new FormData();
        fd.set("vehicleId", vehicleId);
        fd.set("file", file);

        try {
          const res = await upload(null, fd);
          results.push({ name: file.name, ok: Boolean(res?.ok), error: res?.error });
        } catch (e) {
          // A request that never arrives — a dropped connection mid-upload —
          // is reported against the file it belongs to rather than ending the
          // run, so the remaining photographs still get their turn.
          results.push({
            name: file.name,
            ok: false,
            error: e instanceof Error ? e.message : "Upload did not complete.",
          });
        }
        setOutcomes([...results]);
      }
    } finally {
      setBusy(null);
      // Whatever did land is now in the grid, and the picker is cleared only
      // for the files that were dealt with.
      setChosen([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }

  return (
    // `scroll-mt` keeps the heading clear of the sticky admin header when the
    // "Add photos now" link jumps here.
    <section id="photos" className="scroll-mt-24 space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Photos
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          The first photo becomes the primary image used on listing cards. You
          can choose several at once.
        </p>
      </div>

      {removeState?.error && (
        <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {removeState.error}
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

      <div className="rounded-lg border border-dashed border-[var(--border-default)] p-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(e) => {
            setChosen(Array.from(e.target.files ?? []));
            setOutcomes([]);
          }}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-3)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--text-primary)]"
        />

        {chosen.length > 0 && !busy && (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {chosen.length} photo{chosen.length === 1 ? "" : "s"} ready to
            upload.
          </p>
        )}

        <button
          type="button"
          onClick={uploadAll}
          disabled={Boolean(busy) || chosen.length === 0}
          className="mt-3 rounded-lg bg-[var(--cta-bg)] px-4 py-2 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-60"
        >
          {busy
            ? `Uploading ${busy.done + 1} of ${busy.total}…`
            : chosen.length > 1
              ? `Upload ${chosen.length} photos`
              : "Upload photo"}
        </button>

        {/* Reported here, beside the button that was pressed. The result used
            to render at the top of this section, above the picture grid, so on
            a car with photographs already the confirmation appeared off-screen
            and the upload looked like it had done nothing. */}
        {busy && (
          <p className="mt-3 text-sm text-[var(--text-muted)]" aria-live="polite">
            Please keep this page open until it finishes.
          </p>
        )}

        {!busy && succeeded.length > 0 && (
          <p
            className="mt-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]"
            aria-live="polite"
          >
            {succeeded.length} photo{succeeded.length === 1 ? "" : "s"} added.
          </p>
        )}

        {!busy && failed.length > 0 && (
          <div className="mt-3 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            <p className="font-semibold">
              {failed.length} photo{failed.length === 1 ? "" : "s"} could not be
              added:
            </p>
            <ul className="mt-1 space-y-0.5">
              {failed.map((f) => (
                <li key={f.name}>
                  {f.name} — {f.error ?? "unknown problem"}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-2 text-xs text-[var(--text-muted)]">
          JPEG, PNG, WebP or AVIF. Maximum 10 MB each.
        </p>
      </div>
    </section>
  );
}
