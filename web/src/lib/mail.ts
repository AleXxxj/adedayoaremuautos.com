/**
 * The From header.
 *
 * An address on its own — `leads@adedayoaremuautos.com` — leaves the mail
 * client to invent a sender name, and every one of them invents the same
 * thing: the local part. So the business appeared in the inbox as "leads",
 * and Gmail drew its avatar from the first letter, giving every message a
 * grey circle with an L in it.
 *
 * A display name fixes both. RFC 5322 calls this a name-addr:
 *
 *     Adedayo Aremu Autos <leads@adedayoaremuautos.com>
 *
 * That is what appears in the inbox list, and it is the single highest-value
 * detail in an email nobody asked to receive — it is the thing people read
 * before deciding whether to open or delete.
 */

const DEFAULT_ADDRESS = "leads@adedayoaremuautos.com";
const DEFAULT_NAME = "Adedayo Aremu Autos";

/** Already a name-addr, e.g. `Someone <a@b.com>`. */
function hasDisplayName(value: string): boolean {
  return /<[^>]+>\s*$/.test(value.trim());
}

/**
 * A display name is quoted when it contains a character that would otherwise
 * change how the header parses. A comma is the dangerous one: unquoted, it
 * separates addresses, so `Adedayo Aremu Autos, Inc <a@b.com>` would be read
 * as two recipients and rejected.
 */
function quoteName(name: string): string {
  const clean = name.replace(/["\\\r\n]/g, "").trim();
  return /[,;:<>@[\]]/.test(clean) ? `"${clean}"` : clean;
}

/**
 * Builds the From header.
 *
 * If the configured value already carries a display name it is left exactly as
 * written — someone who has taken the trouble to set one means it, and
 * wrapping it again would produce `Name <Name <a@b.com>>`.
 */
export function mailFrom(): string {
  const configured = (process.env.LEAD_ALERT_FROM ?? DEFAULT_ADDRESS).trim();
  if (hasDisplayName(configured)) return configured;

  const name = (process.env.MAIL_FROM_NAME ?? DEFAULT_NAME).trim();
  if (!name) return configured;

  return `${quoteName(name)} <${configured}>`;
}

/** The bare address, for anywhere that needs it without the name. */
export function mailFromAddress(): string {
  const configured = (process.env.LEAD_ALERT_FROM ?? DEFAULT_ADDRESS).trim();
  const match = configured.match(/<([^>]+)>\s*$/);
  return (match ? match[1] : configured).trim();
}
