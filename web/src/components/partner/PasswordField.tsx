"use client";

import { useEffect, useId, useRef, useState } from "react";
import { input, label as labelClass } from "./ui";

/**
 * A password box with a Show button inside it.
 *
 * On a phone a password is typed blind on a small keyboard, and one wrong
 * letter means starting again. Show lets someone check what they typed. It
 * goes back to dots when the form is sent, so a password manager sees an
 * ordinary password field and the password is not left on screen.
 */
export function PasswordField({
  label,
  name,
  autoComplete,
  minLength,
  hint,
  error,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const hide = () => setShown(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  const note = error ?? hint;

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={field}
          id={id}
          type={shown ? "text" : "password"}
          name={name}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          className={`${input} pr-[84px]`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-controls={id}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute inset-y-1 right-1 min-w-[72px] rounded-[10px] px-3 text-[15px] font-bold text-brand-300 transition-colors duration-200 ease-out hover:bg-surface-2 motion-reduce:transition-none"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {note && (
        <p
          id={`${id}-note`}
          className={`mt-2 text-sm leading-relaxed ${error ? "text-danger" : "text-text-muted"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}
