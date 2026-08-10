/**
 * Versioned text of what a finance applicant agrees to.
 *
 * Kept out of the server-action module because a "use server" file may only
 * export async functions — exporting a constant from one silently strips every
 * export, including the action itself.
 *
 * Bump the version whenever the wording changes. Applications store the
 * version they were shown, so months later it is possible to say exactly what
 * someone consented to rather than merely that they ticked a box.
 */
export const DISCLOSURE_VERSION = "2026-08-fin-1";
