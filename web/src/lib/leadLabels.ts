/**
 * How staff read a lead's stored values, in the admin inbox and the alerts.
 *
 * Pure, so the inbox (a client component) and the alerts (server) share it.
 */

/**
 * "trade_in" is someone with a car to sell us or trade in: the sell page
 * files every request as one, and the contact form's "Value my trade-in"
 * does too. Every other type reads as its stored name, as it always has.
 */
export function leadTypeLabel(type: string): string {
  if (type === "trade_in") return "Sell / trade-in";
  const words = type.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "sms" is the sell page's "Text"; the others read as stored. */
export function contactLabel(preferred: string): string {
  return preferred === "sms" ? "text" : preferred;
}
