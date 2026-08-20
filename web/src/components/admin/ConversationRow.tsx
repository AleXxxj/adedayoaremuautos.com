"use client";

import Link from "next/link";
import { useState } from "react";

interface Conversation {
  id: string;
  marketCode: string;
  intent: string | null;
  summary: string | null;
  landingPath: string | null;
  needsHuman: boolean;
  hasLead: boolean;
  messageCount: number;
  lastMessageAt: string;
}

export function ConversationRow({
  conversation,
  transcript,
}: {
  conversation: Conversation;
  transcript: { role: string; content: string }[];
}) {
  const [open, setOpen] = useState(false);

  const when = new Date(conversation.lastMessageAt);
  const stamp = when.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {conversation.intent ?? "Conversation"}
            </span>
            <span className="text-xs uppercase text-[var(--text-muted)]">
              {conversation.marketCode}
            </span>
            {conversation.needsHuman && (
              <span className="rounded-full border border-[var(--warning)]/40 px-2 py-0.5 text-xs text-[var(--warning)]">
                needs a person
              </span>
            )}
            {conversation.hasLead && (
              <Link
                href="/admin/leads"
                className="rounded-full border border-[var(--success)]/40 px-2 py-0.5 text-xs text-[var(--success)] hover:underline"
              >
                filed as an enquiry
              </Link>
            )}
          </div>

          {conversation.summary ? (
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--text-secondary)]">
              {conversation.summary}
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Too short to summarise — open the transcript below.
            </p>
          )}

          {conversation.landingPath && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Started on{" "}
              <Link
                href={conversation.landingPath}
                target="_blank"
                className="text-[var(--link)] hover:underline"
              >
                {conversation.landingPath}
              </Link>
            </p>
          )}
        </div>

        <div className="text-right text-xs text-[var(--text-muted)]">
          <div>{stamp}</div>
          <div className="mt-1">
            {Math.ceil(conversation.messageCount / 2)} exchange
            {Math.ceil(conversation.messageCount / 2) === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-full border border-[var(--border-default)] px-3 py-1 text-xs"
        >
          {open ? "Hide transcript" : `Read the transcript (${transcript.length})`}
        </button>

        {open && (
          <div className="mt-3 space-y-2">
            {transcript.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No messages were recorded.
              </p>
            ) : (
              transcript.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    m.role === "assistant"
                      ? "bg-[var(--surface-2)] text-[var(--text-secondary)]"
                      : "bg-[var(--surface-3)] font-medium"
                  }`}
                >
                  <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    {m.role === "assistant" ? "Assistant" : "Visitor"}
                  </span>
                  <span className="whitespace-pre-line">{m.content}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </li>
  );
}
