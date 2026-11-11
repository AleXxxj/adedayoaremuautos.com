/**
 * A VIN as people type it, checked before anything is looked up.
 *
 * Pure and shared by the page and the server. NHTSA's own decoder is not a
 * validator: tested in November 2026 it answered "success" for a VIN of all
 * Z's, called an 18-character input decoded cleanly, and answered a trailing
 * space with a redirect. So the shape is checked here first, and a typo gets
 * a message that says how to fix it instead of an empty result.
 *
 * The format matches the database rule on our own cars
 * (vehicles_vin_well_formed, migration 0019): 17 letters and digits, never
 * I, O or Q — VINs leave those out so they can't be read as 1 and 0.
 */

export type VinProblem = "length" | "characters" | "checkDigit";

export interface VinCheck {
  /** Uppercased, with spaces and dashes removed. */
  vin: string;
  /** Right length and characters: worth looking up. */
  wellFormed: boolean;
  /** The 9th character agrees with the other 16. */
  checkDigitOk: boolean;
  problem: VinProblem | null;
  /** What to do about it, in plain words; null when all is well. */
  message: string | null;
}

/** What each character counts for in the check-digit sum (49 CFR 565). */
const VALUE: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
/** The weight of each of the 17 positions; the 9th (the check digit) counts 0. */
export const VIN_WEIGHTS: readonly number[] = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** What one character counts for: a digit for itself, a letter by the table. */
export function charValue(c: string): number {
  return c >= "0" && c <= "9" ? Number(c) : (VALUE[c] ?? 0);
}

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

/** The check digit a well-formed VIN should have: "0"–"9" or "X" for 10. */
export function expectedCheckDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += charValue(vin[i]) * VIN_WEIGHTS[i];
  const r = sum % 11;
  return r === 10 ? "X" : String(r);
}

export function checkVin(raw: string): VinCheck {
  const vin = normalizeVin(raw);

  if (vin.length !== 17) {
    return {
      vin,
      wellFormed: false,
      checkDigitOk: false,
      problem: "length",
      message:
        vin.length === 0
          ? "Enter the 17-character VIN."
          : `A VIN has 17 characters. This one has ${vin.length}.`,
    };
  }

  if (!VIN_PATTERN.test(vin)) {
    return {
      vin,
      wellFormed: false,
      checkDigitOk: false,
      problem: "characters",
      message: /[IOQ]/.test(vin)
        ? "VINs never use the letters I, O or Q. Check for the numbers 1 and 0 instead."
        : "A VIN uses only letters and numbers.",
    };
  }

  /*
   * A wrong check digit is a warning, not a refusal. On a car built for North
   * America it almost always means one mistyped character — but some
   * imported cars are not built to that rule, so the visitor who has checked
   * every character can still go on.
   */
  const checkDigitOk = vin[8] === expectedCheckDigit(vin);
  return {
    vin,
    wellFormed: true,
    checkDigitOk,
    problem: checkDigitOk ? null : "checkDigit",
    message: checkDigitOk
      ? null
      : "This VIN doesn't add up, so a character may be mistyped. Check it against the car. If it is exactly right, you can still continue.",
  };
}
