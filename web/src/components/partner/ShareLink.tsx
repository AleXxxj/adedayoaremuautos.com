"use client";

import { useState } from "react";

/**
 * The link, with a copy button and the link itself still on screen.
 *
 * Both, deliberately. Clipboard access is refused often enough — an insecure
 * context, a locked-down browser, a webview — that a copy button on its own
 * can leave somebody with no way to get at the one thing this page is for.
 */
export function ShareLink({ link, code }: { link: string; code: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const copy = async (text: string, which: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Refused. The text is on screen to select by hand.
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2.5 text-sm text-[#4e9d76]">
          {link}
        </code>
        <button
          type="button"
          onClick={() => copy(link, "link")}
          className="rounded-lg border border-[#333] px-3 py-2.5 text-xs text-[#d4d4d4]"
        >
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded-lg border border-[#262626] bg-[#0d0d0d] px-3 py-2.5 text-sm font-bold tracking-wide text-white">
          {code}
        </code>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="rounded-lg border border-[#333] px-3 py-2.5 text-xs text-[#d4d4d4]"
        >
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
      </div>
    </div>
  );
}
