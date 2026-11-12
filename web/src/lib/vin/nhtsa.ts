import "server-only";
import { createHash, createHmac } from "node:crypto";
import { unstable_cache } from "next/cache";
import { readDetails, type CarDetails } from "./features";
import { complaintArea } from "./plain";

/**
 * Free US government data about a vehicle, from NHTSA.
 *
 * Four sources, none needing a key or an account:
 *   - vPIC decodes a VIN into year, make, model, trim, body and engine;
 *   - Recalls lists the recalls issued for a year, make and model;
 *   - Complaints lists owners' reports for that model;
 *   - Safety Ratings gives the 5-Star crash-test results.
 *
 * Server-side only, so every call is checked, cached and rate-limited here
 * rather than sent from visitors' browsers.
 *
 * What is cached is the small summary this module builds, not NHTSA's raw
 * responses. A popular model's complaints arrive as one unpaged response of
 * 2 MB or more (the 2003 Accord: 2,013 complaints, 2.0 MB, 6.7 seconds,
 * measured Nov 2026), and Next's fetch cache refuses anything over 2 MB, so
 * caching the download would mean fetching it again on every check. A lookup
 * that fails is never cached: a timeout today must not hide the data for a
 * week.
 *
 * A cached answer past its refresh time is still shown once while a new one
 * is fetched in the background, so every answer carries the time NHTSA was
 * asked, and the page says "as of" that time rather than implying today.
 *
 * What this cannot say — and the page must not imply — is whether a recall
 * is still open on one specific car. NHTSA's VIN-level lookup sits behind a
 * CAPTCHA its terms forbid automating, and its API is "not meant to be used
 * ... to perform bulk VIN lookups". So recalls here are for the model, said
 * so plainly, with a link for the visitor to check their own VIN themselves.
 *
 * A VIN appears in no URL and no log line. The decode is a POST with the VIN
 * in the body, its cache entry is filed under a keyed hash of the VIN, and
 * errors name the lookup that failed, never the request.
 */

const DAY = 86_400;

/** Thrown inside a cached function so a failure is not stored as an answer. */
class Unavailable extends Error {}

let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
/** For scripts/verify-vin-nhtsa.mts: canned replies in place of NHTSA. */
export function __setFetchForTests(f: typeof fetch): void {
  fetchImpl = f;
}

/**
 * One request, and every way it can fail ends the same way.
 *
 * A refused connection, a timeout, an error page, a reply cut off halfway or
 * malformed JSON all become Unavailable, which callers turn into "couldn't
 * load". The recalls and complaints APIs answer "no match" with HTTP 400 and
 * a JSON count of 0, so for them a JSON 400 is an answer; a 400 that is not
 * JSON (api.nhtsa.gov sends an HTML page for a bad path) is not.
 */
async function getJson<T>(
  what: string,
  url: string,
  o: { timeoutMs: number; post?: string; noMatchIs400?: boolean },
): Promise<T> {
  try {
    const res = await fetchImpl(url, {
      method: o.post ? "POST" : "GET",
      body: o.post,
      // The summaries are cached below; the raw responses are not.
      cache: "no-store",
      signal: AbortSignal.timeout(o.timeoutMs),
      headers: o.post
        ? { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }
        : { accept: "application/json" },
    });
    const isJson = (res.headers.get("content-type") ?? "").includes("json");
    if (!isJson || !(res.ok || (o.noMatchIs400 && res.status === 400))) {
      throw new Unavailable(`${what}: HTTP ${res.status}${isJson ? "" : ", not JSON"}`);
    }
    // Inside the try: a body cut off halfway or a timeout mid-download
    // rejects here, and must not escape as anything but Unavailable.
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Unavailable) throw e;
    // Named, never quoted: an error's message can carry the request.
    throw new Unavailable(`${what}: ${e instanceof Error ? e.name : "failed"}`);
  }
}

/** Any failure becomes null for this request only, logged without detail about the car. */
async function orNull<T>(what: string, p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    console.error(
      `[vin] ${e instanceof Unavailable ? e.message : `${what}: ${e instanceof Error ? e.name : "error"}`}`,
    );
    return null;
  }
}

/**
 * One lookup per model at a time on this server.
 *
 * "Is this the car?" starts fetching the model's data in the background, and
 * the visitor's "Yes" usually arrives before a popular model's complaints
 * have finished downloading. The cache has nothing to give until that first
 * download ends, so without this the second request would start the same
 * multi-megabyte download again.
 */
const inFlight = new Map<string, Promise<unknown>>();
function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const p = run().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** A lookup with no name to ask under: unavailable, never "none on file". */
function needNames(what: string, names: string[]): void {
  if (names.length === 0) throw new Unavailable(`${what}: no model name NHTSA can be asked about`);
}

const enc = encodeURIComponent;
const text = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s && s !== "Not Applicable" ? s : null;
};

/* ── Which names NHTSA files a model under ──────────────────────────────── */

/** A name safe to put in a URL path or query: no "/" and nothing exotic. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 .\-]{0,39}$/;

/**
 * The model names NHTSA's other databases may use for this car, most likely
 * first.
 *
 * vPIC decodes a car by its family and trim, while recalls, complaints and
 * ratings are filed under whatever the maker reported, and the three don't
 * agree with each other (all checked against the live APIs, Nov 2026):
 *
 *   2015 Mercedes C300: vPIC "C-Class" + trim "C300". Recalls are under
 *     "C300" (11) and none under "C-Class"; complaints are under "C-Class"
 *     (453) and none under "C300".
 *   2018 Lexus RX350: vPIC "RX" + trim "350/350 F Sport". Everything is
 *     under "RX350"; nothing under "RX".
 *   2019 Silverado 1500: vPIC "Silverado" + series "1500"; NHTSA wants
 *     "Silverado 1500".
 *
 * So each lookup tries these in turn. A series or trim that is a list of
 * codes ("GYL25L/GGL25L/…") is never sent: NHTSA answers a "/" in the path
 * with an HTML error page.
 */
export function nhtsaModelNames(
  model: string,
  series: string | null,
  trim: string | null,
  make: string | null = null,
): string[] {
  // "RAV4 Prime (PHEV)" -> "RAV4 Prime"; "Caravan/Grand Caravan" -> both.
  // With the parentheses or the slash left in, nothing passed SAFE_NAME and
  // no lookup was made at all.
  const bases = model
    .replace(/\s*\([^)]*\)\s*$/, "")
    .split("/")
    .map((m) => m.trim())
    .filter(Boolean);
  const base = bases[0] ?? model;
  const names: string[] = [...bases];
  // A truck's load series ("1500", "2500HD"); not a chassis code like "ZRE172L".
  if (series && isLoadSeries(series)) names.push(`${base} ${series}`);
  // Ford files Super Duty recalls as "F-250 SD"; vPIC says model "F-250",
  // series "F-Series Super Duty - Single Rear Wheel". 13 recalls for a 2021
  // F-250 under "F-250 SD", none under "F-250" (live, Nov 2026).
  if (series && /super duty/i.test(series)) names.push(`${base} SD`);
  // BMW: vPIC's series "3-series" is NHTSA's "3 SERIES", where the 2016+
  // stars and complaints are (vPIC's model is the badge, "328i").
  const bmwSeries = series ? /^(\d)-series$/i.exec(series)?.[1] : undefined;
  if (bmwSeries) names.push(`${bmwSeries} Series`);
  // MINI: vPIC says model "Hardtop", series "Cooper"; NHTSA files recalls
  // under "COOPER" and complaints under "COOPER HARDTOP".
  if (make && /^mini$/i.test(make) && series && /^[A-Za-z][A-Za-z ]*$/.test(series)) {
    names.push(`${series} ${base}`, series);
  }

  const firstTrim = trim ? trim.split(/[/,]/)[0].trim() : "";
  // Mercedes-AMG: recalls are under "AMG C43" (11 for 2018); the badge rule
  // below would take "AMG" alone, which has no number.
  const amg = /^AMG\s+[A-Z]{1,4}\d{2,3}[A-Z]?\b/i.exec(firstTrim)?.[0]?.replace(/\s+/g, " ");
  if (amg) names.push(amg);
  // The trim's first word: "350/350 F Sport" -> "350", "GLE350-4M" -> "GLE350".
  const badge = amg ? undefined : /^[A-Za-z0-9]+/.exec(firstTrim)?.[0];
  let hasBadge = Boolean(amg);
  if (badge) {
    // Three digits, so the "4" of "4-MATIC" is not taken for a badge.
    if (/^\d{3}[A-Za-z]?$/.test(badge)) {
      // "RX350" for recalls and stars; "RX 350" for complaints from 2020 on.
      names.push(`${base}${badge}`, `${base} ${badge}`);
      hasBadge = true;
    } else if (isBadge(badge)) {
      names.push(badge); // "C300"
      hasBadge = true;
    }
  }
  /*
   * Mercedes-Benz files recalls under the badge, which older decodes leave
   * out: a 2015 C-Class 4MATIC decodes with trim "4-MATIC". Then each badge
   * the family is sold under is tried, and the page names the ones recalls
   * were found under ("the C300 and C400"): a recall too many, said to be
   * for the model, is better than "no recalls" for a car that has some.
   */
  const family = /^([A-Z]{1,3})-Class$/i.exec(base)?.[1]?.toUpperCase();
  if (family && !hasBadge) {
    for (const n of [250, 300, 350, 400, 450, 500, 550]) names.push(`${family}${n}`);
  }
  return [...new Set(names.filter((n) => SAFE_NAME.test(n)))];
}

/**
 * A model badge in a trim: "C300", "GLE350". Two digits at least, so a trim
 * like "SR5" or an engine like "I4" is not looked up as a model of its own,
 * and not an engine layout ("V12") or a drive ("4x4").
 */
function isBadge(word: string): boolean {
  return (
    /[A-Za-z]/.test(word) &&
    (word.match(/\d/g)?.length ?? 0) >= 2 &&
    !/^[IVWH]\d{1,2}$/i.test(word) &&
    !/^\d+x\d+$/i.test(word)
  );
}

/** Every name to try for a decoded car: its own, then its powertrain's. */
function namesFor(
  model: string,
  series: string | null,
  trim: string | null,
  make: string | null,
  power: Power | null,
): string[] {
  const own = nhtsaModelNames(model, series, trim, make);
  const base = own[0];
  if (!base) return [];
  const extra = powerNames(base, power, `${trim ?? ""} ${model}`).filter((n) => SAFE_NAME.test(n));
  return [...new Set([...own, ...extra])];
}

/** A truck's load series, "1500" or "2500HD": shown, and looked up with the model. */
function isLoadSeries(series: string): boolean {
  return /^\d{3,4}[A-Za-z]{0,2}$/.test(series);
}

/* ── Decode ─────────────────────────────────────────────────────────────── */

export type BodyKind = "convertible" | "hatchback" | "wagon" | "closed" | "suv" | "pickup" | "van";
export type Power = "gas" | "hybrid" | "plugin" | "electric" | "diesel";

/** What tells one crash-tested version of a model from another. */
export interface VersionFit {
  doors: number | null;
  /** Pickup cab: crew, extended or regular, as NHTSA's ratings name them. */
  cab: "CC" | "EC" | "RC" | null;
  drive: "AWD" | "4WD" | "FWD" | "RWD" | "2WD" | null;
  /** "closed" is a sedan or coupe: NHTSA calls both "N DR". */
  body: BodyKind | null;
  power: Power | null;
  /** The trim's and series' words in capitals, without punctuation: "XDRIVE", "SI", "TYPER". */
  words: string[];
}

export interface DecodedVin {
  year: number | null;
  make: string | null;
  model: string | null;
  /** For display; null when NHTSA gives a list of codes rather than one name. */
  trim: string | null;
  series: string | null;
  body: string | null;
  drive: string | null;
  engine: string | null;
  fuel: string | null;
  builtIn: string | null;
  /** What NHTSA's decoder flagged, in plain sentences. */
  warnings: string[];
  /** The names to look this model up under elsewhere (nhtsaModelNames). */
  names: string[];
  fit: VersionFit;
  /** Seats, engine, transmission, plant, base price and safety equipment (features.ts). */
  details: CarDetails;
}

/*
 * NHTSA lists every name for a body or a drive in one label: "Sedan/Saloon"
 * (the second is British), "4WD/4-Wheel Drive/4x4". The first name is the
 * American one. The full lists are vPIC's GetVehicleVariableValuesList for
 * "Body Class" and "Drive Type".
 */
function bodyLabel(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split("/")[0].trim();
  if (first.endsWith("[SUV]")) return "SUV";
  if (first.endsWith("[CUV]")) return "Crossover";
  // "Low Speed Vehicle [LSV]" -> "Low Speed Vehicle".
  return first.replace(/\s*[[(][^\])]*[\])]\s*$/, "").trim() || null;
}

function driveLabel(raw: string | null): string | null {
  if (!raw || raw === "Other") return null;
  if (raw === "4x2") return "2WD";
  if (raw === "2WD/4WD") return "2WD or 4WD";
  return raw.split("/")[0].trim() || null;
}

function driveCode(raw: string | null): VersionFit["drive"] {
  const first = raw?.split("/")[0].trim().toUpperCase();
  if (raw === "4x2") return "2WD";
  return first === "AWD" || first === "4WD" || first === "FWD" || first === "RWD" ? first : null;
}

/**
 * A pickup's cab as NHTSA's ratings name it.
 *
 * vPIC lumps "Extra/Super/Quad/Double/King/Extended" together, and "Double
 * Cab" means different cabs on different trucks: NHTSA rates the Tacoma
 * Double Cab (four full doors) as a crew cab, PU/CC, and the Tundra Double
 * Cab and GM's Double Cab as extended cabs, PU/EC (live, Nov 2026). vPIC
 * names the Toyota cab in Series2.
 */
function cabCode(raw: string | null, model: string | null, series2: string | null): VersionFit["cab"] {
  if (/tacoma/i.test(model ?? "")) {
    // From Series2 alone: BodyCabType's lumped label ("Extra/Super/Quad/
    // Double/…") contains "Double" for an Access Cab too.
    if (/double/i.test(series2 ?? "")) return "CC";
    if (/access|extra/i.test(series2 ?? "")) return "EC";
    if (/regular/i.test(series2 ?? "")) return "RC";
    if (!series2) return null;
  }
  const said = `${series2 ?? ""} ${raw ?? ""}`;
  if (/crew/i.test(said)) return "CC";
  if (/extra|super|quad|double|king|extended|access/i.test(said)) return "EC";
  if (/regular/i.test(said)) return "RC";
  return null;
}

/** The body as bodyLabel names it, in the kinds a rated version's name tells apart. */
function bodyCode(label: string | null): BodyKind | null {
  switch (label) {
    case "Convertible":
    case "Roadster":
      return "convertible";
    case "Hatchback":
      return "hatchback";
    case "Wagon":
      return "wagon";
    case "Sedan":
    case "Coupe":
      return "closed";
    case "SUV":
    case "Crossover":
      return "suv";
    case "Pickup":
    case "Sport Utility Truck":
      return "pickup";
    case "Minivan":
    case "Van":
    case "Cargo Van":
      return "van";
    default:
      return null;
  }
}

/**
 * What moves the car. NHTSA rates a model's hybrid, plug-in and diesel
 * versions under names of their own ("RAV4 HYBRID", "F-150 SUPER CREW
 * DIESEL"), which share every other detail with the gasoline one. A mild
 * hybrid is rated as the gasoline car.
 */
function powerCode(
  fuel: string | null,
  electrification: string | null,
  fuelSecondary: string | null = null,
): Power | null {
  const e = electrification ?? "";
  if (/plug-in|PHEV/i.test(e)) return "plugin";
  if (/BEV|FCEV/.test(e)) return "electric";
  if (/HEV/.test(e) && !/mild/i.test(e)) return "hybrid";
  // Older decodes leave the electrification out but name the second fuel.
  if (!e && fuel && /gasoline/i.test(fuel) && /electric/i.test(fuelSecondary ?? "")) return "hybrid";
  if (!fuel) return null;
  if (/electric|fuel cell|hydrogen/i.test(fuel)) return "electric";
  if (/diesel/i.test(fuel)) return "diesel";
  return "gas";
}

/**
 * The names NHTSA files a powertrain's own recalls and complaints under,
 * which the plain model name never finds. Live, Nov 2026: a 2018 Pacifica
 * plug-in hybrid has 4 recalls under "PACIFICA HYBRID" and 2 under
 * "PACIFICA PLUG-IN HYBRID", two of them fire recalls that say to park it
 * outside; "IONIQ" finds nothing for a 2017 Ioniq and "IONIQ HYBRID" finds
 * 3; a 2021 Wrangler 4xe has its own under "WRANGLER 4XE" and "WRANGLER
 * PHEV". A name with no records costs one small "no match" reply.
 */
export function powerNames(base: string, power: Power | null, trimOrModel: string): string[] {
  const out: string[] = [];
  if (power === "hybrid" || power === "plugin") out.push(`${base} Hybrid`);
  if (power === "plugin") out.push(`${base} Plug-In Hybrid`, `${base} PHEV`);
  if (/\b4xe\b/i.test(trimOrModel)) out.push(`${base} 4xe`);
  if (power === "electric") out.push(`${base} Electric`, `${base} EV`);
  if (power === "diesel") out.push(`${base} Diesel`);
  return out;
}

/** Words in capitals, with each pair joined too, so "Type R" also gives "TYPER". */
function wordsOf(...parts: (string | null)[]): string[] {
  const words = parts.join(" ").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const pairs = words.slice(1).map((w, i) => words[i] + w);
  return [...new Set([...words, ...pairs])].filter((w) => w.length >= 2).slice(0, 24);
}

/** For the car's name: "LT (1LT)" -> "LT", "GL - Middle-low" -> "GL", a chassis code -> nothing. */
function displayTrim(trim: string | null): string | null {
  const one = oneName(trim);
  if (!one) return null;
  const t = one.replace(/\s*\([^)]*\)\s*$/, "").split(" - ")[0].trim();
  return t && !/^[A-Z]{2,4}\d{2,3}[A-Z]$/.test(t) ? t : null;
}

/** One name, or nothing: "ASA44L/ASA42L" and "L/LE/SE/XLE" are lists, not names. */
const oneName = (s: string | null) => (s && !/[/,]/.test(s) ? s : null);

/**
 * vPIC's codes (GetVehicleVariableValuesList "Error Code") in plain words.
 * Code 0 is a clean decode; the check digit (code 1) is also checked on our
 * side, before anything is sent.
 */
const DECODE_WARNINGS: Record<string, string> = {
  "1": "The check digit (the 9th character) doesn't match the rest of the VIN, so a character may be wrong.",
  "2": "NHTSA had to correct one character of this VIN to decode it.",
  "3": "NHTSA had to correct one character of this VIN to decode it.",
  "4": "NHTSA had to guess one character of this VIN to decode it.",
  "5": "Several characters of this VIN don't match NHTSA's records.",
  "6": "This VIN looks incomplete.",
  "7": "This maker isn't registered with NHTSA to sell vehicles in the US.",
  "8": "NHTSA has only basic details for this VIN.",
  "11": "The model-year character (the 10th) isn't a valid one, so the year may be wrong.",
  "12": "The model year may be wrong.",
  "14": "NHTSA couldn't decode some characters of this VIN.",
  "400": "This VIN has characters a VIN can't have.",
};

export function decodeWarnings(errorCode: string | null): string[] {
  const codes = (errorCode ?? "0").split(",").map((c) => c.trim()).filter((c) => c && c !== "0");
  const said = codes.map((c) => DECODE_WARNINGS[c] ?? "NHTSA couldn't fully decode this VIN.");
  return [...new Set(said)];
}

/** Turns one vPIC result into the summary the page uses. */
export function summarizeDecode(v: Record<string, unknown>): DecodedVin {
  const cylinders = text(v.EngineCylinders);
  const litres = text(v.DisplacementL);
  const engine = [
    litres && Number(litres) > 0 ? `${Number(litres).toFixed(1)} L` : null,
    cylinders ? `${cylinders}-cylinder` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const year = Number(text(v.ModelYear));
  const make = text(v.Make);
  const model = text(v.Model);
  const series = text(v.Series);
  const trim = text(v.Trim);
  const doors = Number(text(v.Doors));
  const body = bodyLabel(text(v.BodyClass));
  const power = powerCode(text(v.FuelTypePrimary), text(v.ElectrificationLevel), text(v.FuelTypeSecondary));

  return {
    year: Number.isFinite(year) && year > 1900 ? year : null,
    make,
    model,
    // Shown in the car's name: a load series ("1500") and a cleaned trim,
    // never the manufacturer's codes ("ZRE172L", "(1LT)").
    trim: displayTrim(trim),
    series: series && isLoadSeries(series) ? series : null,
    body,
    drive: driveLabel(text(v.DriveType)),
    engine: engine || null,
    fuel: text(v.FuelTypePrimary),
    // "UNITED STATES (USA)" -> "UNITED STATES"; the page sets the case.
    builtIn: text(v.PlantCountry)?.replace(/\s*\(.*\)\s*$/, "") || null,
    warnings: decodeWarnings(text(v.ErrorCode)),
    names: model ? namesFor(model, series, trim, make, power) : [],
    fit: {
      doors: Number.isInteger(doors) && doors >= 2 && doors <= 5 ? doors : null,
      cab: cabCode(text(v.BodyCabType), model, text(v.Series2)),
      drive: driveCode(text(v.DriveType)),
      body: bodyCode(body),
      power,
      words: wordsOf(trim, series, text(v.Series2)),
    },
    details: readDetails(v),
  };
}

async function decodeLive(vin: string): Promise<DecodedVin | null> {
  // The batch endpoint, for one VIN: the same fields as DecodeVinValues, with
  // the VIN in the body rather than the URL.
  const body = await getJson<{ Results?: Record<string, unknown>[] }>(
    "decode",
    "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/",
    { timeoutMs: 8_000, post: `format=json&data=${enc(vin)}` },
  );
  const v = body.Results?.[0];
  return v ? summarizeDecode(v) : null;
}

/**
 * The cache key for a VIN: a keyed hash of it, not the VIN.
 *
 * Next logs the whole cache key when a background refresh fails, arguments
 * included, so the VIN is neither an argument nor a key part. Keyed with a
 * secret kept on the server, the hash can't be matched back to a VIN by
 * hashing likely VINs.
 */
function vinKey(vin: string): string {
  const secret = process.env.VISITOR_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h = secret
    ? createHmac("sha256", secret).update(`vin-cache:${vin}`)
    : createHash("sha256").update(`vin-cache:${vin}`);
  return h.digest("base64url").slice(0, 32);
}

export function decodeVin(vin: string): Promise<DecodedVin | null> {
  // v6: the answer gained `details`.
  const cached = unstable_cache(() => decodeLive(vin), ["nhtsa-decode-v6", vinKey(vin)], {
    revalidate: 30 * DAY,
  });
  return orNull("decode", cached());
}

/* ── NHTSA's own model names, per make and year ───────────────────────── */

/** What a car's own versions are, for choosing among NHTSA's longer names. */
export interface Want {
  power: Power | null;
  cab: VersionFit["cab"];
  /** The trim's words (VersionFit.words): "UNLIMITED" makes "WRANGLER UNLIMITED" the car's own. */
  words?: string[];
}
const ANY: Want = { power: null, cab: null };

/** The powertrain a name of NHTSA's says, if any: "PACIFICA HYBRID", "WRANGLER 4XE". */
function powerOfName(name: string): Power | null {
  const n = name.toUpperCase();
  if (/\b(PHEV|PLUG-IN|ENERGI|4XE|PRIME)\b/.test(n)) return "plugin";
  if (/\b(HEV|HYBRID)\b/.test(n)) return "hybrid";
  if (/\b(DIESEL|TDI|BLUETEC|ECODIESEL|CDI)\b/.test(n)) return "diesel";
  if (/\b(EV|BEV|ELECTRIC)\b/.test(n)) return "electric";
  return null;
}

/** The cab a name spells out: "F-150 SUPERCAB", "Titan Crew Cab AWD". "Double Cab" differs by truck, so it says nothing. */
export function cabOfName(name: string): VersionFit["cab"] {
  const n = name.toUpperCase();
  if (/\b(CREW ?CAB|CREW ?MAX|SUPER ?CREW)\b/.test(n)) return "CC";
  if (/\b(SUPER ?CAB|KING ?CAB|ACCESS ?CAB|QUAD ?CAB|EXTENDED ?CAB|EXT ?CAB)\b/.test(n)) return "EC";
  if (/\b(REGULAR ?CAB|SINGLE ?CAB|REG ?CAB)\b/.test(n)) return "RC";
  return null;
}

/**
 * The model names NHTSA has recall ("r") or complaint ("c") records under,
 * for a make and year. Names from NHTSA itself, so any character but "/"
 * can be asked about (it goes in a query string, encoded).
 */
async function catalogueLive(year: number, make: string, issue: "r" | "c"): Promise<string[]> {
  const body = await getJson<{ results?: { model?: unknown }[] }>(
    "model list",
    `https://api.nhtsa.gov/products/vehicle/models?modelYear=${year}&make=${enc(make)}&issueType=${issue}&max=5000`,
    { timeoutMs: 8_000, noMatchIs400: true },
  );
  return [
    ...new Set(
      (body.results ?? [])
        .map((r) => text(r.model))
        .filter((m): m is string => !!m && m.length <= 60 && !m.includes("/")),
    ),
  ];
}

/**
 * The models vPIC decodes for a make and year: separate cars, so a longer
 * name of NHTSA's that is one of them ("ROGUE SPORT" beside "Rogue",
 * "TRANSIT CONNECT" beside "Transit") is never taken for a version of this
 * one. One request per make and year, shared by the three lookups; if it
 * fails, nothing is ruled out.
 */
async function separateModels(year: number, make: string): Promise<string[]> {
  const got = await orNull(
    "vpic models",
    shared(JSON.stringify(["vpic-models", year, make]), async () => {
      const body = await getJson<{ Results?: { Model_Name?: unknown }[] }>(
        "vpic models",
        `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${enc(make)}/modelyear/${year}?format=json`,
        { timeoutMs: 8_000 },
      );
      return [...new Set((body.Results ?? []).map((r) => text(r.Model_Name)).filter((m): m is string => !!m))];
    }),
  );
  return got ?? [];
}

/**
 * Whether a longer name is a separate model rather than a version of the
 * car's: it is a vPIC model itself, or its added words are one ("COOPER
 * COUNTRYMAN" for a MINI Hardtop). The car's own model never counts.
 */
export function isSeparateModel(name: string, root: string, models: string[], own: string): boolean {
  const u = name.toUpperCase();
  const added = ` ${u.slice(root.length).trim()} `;
  const ownU = own.toUpperCase();
  return models.some((m) => {
    const mu = m.toUpperCase();
    if (mu === ownU) return false;
    return mu === u || added.includes(` ${mu} `);
  });
}

/**
 * The names to ask under: the car's own, plus the longer names NHTSA files
 * its versions under, from NHTSA's list for the make and year.
 *
 * Live, Nov 2026: a 2015 F-150 has no complaints under "F-150" and 1,425
 * under each of "F-150 SUPERCAB", "F-150 SUPER CREW" and "F-150 REGULAR
 * CAB" (the same 1,425); a 2016 Model S has none under "MODEL S" and 604
 * under each of "MODEL S 70D", "MODEL S 90D" and the rest.
 *
 * A longer name that names a powertrain or a cab is used only when it is
 * the car's own (or the car's is unknown): a gasoline RAV4 is not given the
 * RAV4 Hybrid's. A name is not lengthened when a longer form of it is
 * already among the car's names and on NHTSA's list ("RX" when "RX 350" is
 * there), so the RX 350L's records are not counted as the RX 350's, and
 * never to a separate model vPIC knows (isSeparateModel). Complaints take
 * one plain longer name per name, plus the car's own powertrain's: cab and
 * version siblings hold the same complaints, and each can be megabytes. Recalls also take the family a
 * variant belongs to ("CIVIC" for a "Civic Type R"), whose recalls often
 * name it; the page says some recalls may not apply.
 */
export function expandNames(
  names: string[],
  catalogue: string[],
  want: Want,
  kind: "recalls" | "complaints",
  models: string[] = [],
): string[] {
  const own = names[0] ?? "";
  const out = [...names];
  const have = new Set(names.map((n) => n.toUpperCase()));
  const listed = new Set(catalogue.map((m) => m.toUpperCase()));
  const fits = (m: string) => {
    const p = powerOfName(m);
    const c = cabOfName(m);
    return !(p && want.power && p !== want.power) && !(c && want.cab && c !== want.cab);
  };
  for (const root of names.map((n) => n.toUpperCase())) {
    const covered = [...have].some((n) => n !== root && n.startsWith(`${root} `) && listed.has(n));
    if (covered) continue;
    const longer = catalogue.filter((m) => {
      const u = m.toUpperCase();
      return u.startsWith(`${root} `) && !have.has(u) && fits(m) && !isSeparateModel(m, root, models, own);
    });
    // Complaints: the car's own cab or powertrain first, then the shortest.
    const ranked = longer.sort(
      (a, b) =>
        Number(cabOfName(b) !== null && cabOfName(b) === want.cab) -
          Number(cabOfName(a) !== null && cabOfName(a) === want.cab) ||
        Number(powerOfName(b) !== null && powerOfName(b) === want.power) -
          Number(powerOfName(a) !== null && powerOfName(a) === want.power) ||
        a.length - b.length ||
        a.localeCompare(b),
    );
    // Complaints: the best plain name, and the car's own powertrain's name
    // too: those hold different complaints (a 2021 F-150 SuperCrew's, and
    // the hybrid's under "F-150 SUPER CREW HEV").
    //
    // When NHTSA lists the name itself, it has its own complaints, and a
    // longer name is another version's ("GRAND CHEROKEE SRT", "JETTA TDI",
    // "MALIBU ECO") unless it is this car's: its cab, its powertrain, or
    // words its trim has ("WRANGLER UNLIMITED" for an Unlimited). When the
    // name isn't listed (a 2015 "F-150", a 2016 "MODEL S"), the complaints
    // are only under the longer names, so the best plain one is used.
    const isOwn = (m: string) => {
      const c = cabOfName(m);
      const p = powerOfName(m);
      const added = m.toUpperCase().slice(root.length).trim().split(/\s+/).map((w) => w.replace(/[^A-Z0-9]/g, ""));
      return (
        (c !== null && c === want.cab) ||
        (p !== null && p === want.power) ||
        (added.length > 0 && added.every((w) => !w || (want.words ?? []).includes(w)))
      );
    };
    const picks =
      kind === "complaints"
        ? listed.has(root)
          ? ranked.filter(isOwn).slice(0, 2)
          : [
              ranked.find((m) => !powerOfName(m)),
              want.power ? ranked.find((m) => powerOfName(m) === want.power) : undefined,
            ].filter((m): m is string => !!m)
        : ranked.slice(0, 6);
    for (const m of picks) {
      out.push(m);
      have.add(m.toUpperCase());
    }
  }
  if (kind === "recalls") {
    for (const m of catalogue) {
      const u = m.toUpperCase();
      if (!have.has(u) && names.some((n) => n.toUpperCase().startsWith(`${u} `)) && fits(m)) {
        out.push(m);
        have.add(u);
      }
    }
  }
  return out.slice(0, kind === "recalls" ? 16 : 10);
}

/* ── Recalls for the model ──────────────────────────────────────────────── */

/**
 * NHTSA's recall dates are day first ("27/06/2019"); an American reader
 * would take "06/03/2019" for June 3 instead of March 6. Turned into
 * YYYY-MM-DD here, and formatted for the reader on the page.
 */
function isoFromDayFirst(raw: string | null): string | null {
  const m = raw ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export interface ModelRecall {
  campaign: string;
  /** YYYY-MM-DD, when NHTSA received the recall report. */
  date: string | null;
  component: string | null;
  summary: string | null;
  consequence: string | null;
  remedy: string | null;
  /** NHTSA's "do not drive" and "park outside" warnings. */
  parkIt: boolean;
  parkOutside: boolean;
}

export interface ModelRecalls {
  list: ModelRecall[];
  /** The model names the recalls were found under. */
  foundUnder: string[];
  /** ISO time NHTSA was asked: the page says "as of" this, not today. */
  fetchedAt: string;
}

/**
 * Recalls issued for the model, under every name it may be filed under, with
 * each campaign once — not proof any is open on one car.
 *
 * Equipment and tire campaigns that merely list the model (a replacement
 * pedal sold for it, say) are left out: a vehicle campaign number has a V in
 * its third position.
 */
async function recallsLive(year: number, make: string, own: string[], want: Want): Promise<ModelRecalls> {
  needNames("recalls", own);
  // A list that can't be read makes the recalls unavailable: without it, a
  // version's recalls would be missing from an answer kept for a day.
  const [catalogue, models] = await Promise.all([catalogueLive(year, make, "r"), separateModels(year, make)]);
  const names = expandNames(own, catalogue, want, "recalls", models);
  const perName = await Promise.all(
    names.map(async (name) => {
      const body = await getJson<{ results?: Record<string, unknown>[] }>(
        "recalls",
        `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${enc(make)}&model=${enc(name)}&modelYear=${year}`,
        { timeoutMs: 8_000, noMatchIs400: true },
      );
      return { name, rows: (body.results ?? []).filter((x) => String(x.NHTSACampaignNumber ?? "").charAt(2) === "V") };
    }),
  );

  const byCampaign = new Map<string, ModelRecall>();
  for (const { rows } of perName) {
    for (const x of rows) {
      const campaign = String(x.NHTSACampaignNumber);
      if (byCampaign.has(campaign)) continue;
      byCampaign.set(campaign, {
        campaign,
        date: isoFromDayFirst(text(x.ReportReceivedDate)),
        component: text(x.Component),
        summary: text(x.Summary),
        consequence: text(x.Consequence),
        remedy: text(x.Remedy),
        parkIt: x.parkIt === true,
        parkOutside: x.parkOutSide === true,
      });
    }
  }

  return {
    // Newest first: the latest recalls are the likeliest still open.
    list: [...byCampaign.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    foundUnder: perName.filter((p) => p.rows.length > 0).map((p) => p.name),
    fetchedAt: new Date().toISOString(),
  };
}

/*
 * One download per model at a time, inside the cache: an answer past its
 * refresh time is shown once while unstable_cache refreshes it in the
 * background, and the visitor's "Yes" usually comes while that refresh is
 * still downloading. Shared here, the second request joins it instead of
 * starting the same download again.
 */
const recallsCached = unstable_cache(
  (year: number, make: string, names: string[], want: Want) =>
    shared(JSON.stringify(["recalls", year, make, names, want]), () => recallsLive(year, make, names, want)),
  ["nhtsa-recalls-v5"],
  { revalidate: DAY },
);

export function recallsForModel(
  year: number,
  make: string,
  names: string[],
  want: Want = ANY,
): Promise<ModelRecalls | null> {
  return orNull("recalls", recallsCached(year, make, names, want));
}

/* ── Owner complaints for the model ─────────────────────────────────────── */

export interface ComplaintSummary {
  total: number;
  crashes: number;
  fires: number;
  injuries: number;
  /** The parts complained about most, with counts, most first. */
  topParts: { part: string; count: number }[];
  /**
   * The same in plain groups ("Brakes", "Electrical"), each complaint counted
   * once per group: "SERVICE BRAKES" and "SERVICE BRAKES, HYDRAULIC" on one
   * complaint is one brake complaint, not two.
   */
  topAreas: { area: string; count: number }[];
  /** The model names the complaints were found under. */
  foundUnder: string[];
  fetchedAt: string;
}

/**
 * NHTSA joins a complaint's parts with a bare comma, and part names have
 * their own comma-and-space: "SERVICE BRAKES, HYDRAULIC,ENGINE" is two
 * parts, not three.
 */
export function complaintParts(components: string): string[] {
  return components
    .split(/,(?! )/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Complaints under every name, each complaint once.
 *
 * Not the first name that has any: a 2018 Lexus IS has 3 under "IS" and 6
 * under "IS300" (live, Nov 2026). The names that find nothing answer with a
 * small "no match", so asking them all costs little beyond the one big
 * download.
 */
async function complaintsLive(year: number, make: string, own: string[], want: Want): Promise<ComplaintSummary> {
  needNames("complaints", own);
  const [catalogue, models] = await Promise.all([catalogueLive(year, make, "c"), separateModels(year, make)]);
  const names = expandNames(own, catalogue, want, "complaints", models);
  const perName = await Promise.all(
    names.map(async (name) => {
      const body = await getJson<{ results?: Record<string, unknown>[] }>(
        "complaints",
        `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${enc(make)}&model=${enc(name)}&modelYear=${year}`,
        { timeoutMs: 20_000, noMatchIs400: true },
      );
      return { name, rows: body.results ?? [] };
    }),
  );

  const byId = new Map<string, Record<string, unknown>>();
  perName.forEach(({ rows }, i) =>
    rows.forEach((row, j) => {
      // NHTSA's own number for a complaint; one without is kept as its own.
      const id = row.odiNumber != null ? String(row.odiNumber) : `${i}:${j}`;
      if (!byId.has(id)) byId.set(id, row);
    }),
  );
  const rows = [...byId.values()];

  const parts = new Map<string, number>();
  const areas = new Map<string, number>();
  for (const row of rows) {
    const own = complaintParts(String(row.components ?? ""));
    for (const part of own) parts.set(part, (parts.get(part) ?? 0) + 1);
    for (const area of new Set(own.map(complaintArea))) areas.set(area, (areas.get(area) ?? 0) + 1);
  }
  const top = <K extends string>(m: Map<string, number>, key: K) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ [key]: name, count }) as Record<K, string> & { count: number });
  return {
    total: rows.length,
    crashes: rows.filter((x) => x.crash === true).length,
    fires: rows.filter((x) => x.fire === true).length,
    injuries: rows.reduce((s, x) => s + (Number(x.numberOfInjuries) || 0), 0),
    topParts: top(parts, "part"),
    topAreas: top(areas, "area"),
    foundUnder: perName.filter((p) => p.rows.length > 0).map((p) => p.name),
    fetchedAt: new Date().toISOString(),
  };
}

// Two days, not one: new complaints trickle in, and a popular model's list
// is the one multi-megabyte download this tool makes.
const complaintsCached = unstable_cache(
  (year: number, make: string, names: string[], want: Want) =>
    shared(JSON.stringify(["complaints", year, make, names, want]), () => complaintsLive(year, make, names, want)),
  // v6: the answer gained `topAreas`.
  ["nhtsa-complaints-v6"],
  { revalidate: 2 * DAY },
);

export function complaintsForModel(
  year: number,
  make: string,
  names: string[],
  want: Want = ANY,
): Promise<ComplaintSummary | null> {
  return orNull("complaints", complaintsCached(year, make, names, want));
}

/* ── 5-Star crash-test ratings ──────────────────────────────────────────── */

export interface RatedVersion {
  /** NHTSA's own name for the version, e.g. "2019 Chevrolet Silverado 1500 PU/CC 4WD". */
  description: string;
  overall: string | null;
  front: string | null;
  side: string | null;
  rollover: string | null;
  /** NHTSA's chance of rolling over in a crash with no other car: 0.169 is 17%. */
  rolloverRisk: number | null;
}

export interface CrashRatings {
  /** The versions that match this car best; one when the VIN pins it down. */
  versions: RatedVersion[];
  /**
   * How many versions matched equally well. More than `versions` holds when
   * some were left out; then the page lists none of them as the choices.
   */
  matched: number;
  /**
   * Other versions of the model built like this one (same body, cab and
   * doors: an AWD's FWD sibling, a gas car's hybrid), to compare with. Only
   * when the VIN pins down one version; at most a few.
   */
  others: RatedVersion[];
  /** How many other versions NHTSA rates in all; more than `others` holds when some weren't read. */
  otherCount: number;
  fetchedAt: string;
}

/** A version as the model's list names it, before its stars are fetched. */
export interface VersionName {
  id: number;
  /** NHTSA's name for it: "2019 Ram 1500 Classic Crew PU/CC 4WD". */
  description: string;
  /** Words of its model's name past the name the car was found under: "XDRIVE", "CLASSIC". */
  extra?: string[];
}

const DRIVE_WORD = /^(AWD|4WD|FWD|RWD|2WD|4X4|4X2)$/;

/**
 * What a version's name says about it. NHTSA ends each name with the body
 * and the drive: "4 DR FWD" (sedan or coupe), "5 HB FWD", "C RWD"
 * (convertible), "SW AWD" (wagon), "SUV AWD", "VAN FWD", "Crew PU/CC 4x4".
 * Only the end is read, so "C-Class" or "C 300" is never taken for "C".
 */
export function readVersion(description: string): {
  doors: number | null;
  cab: VersionFit["cab"];
  drive: VersionFit["drive"];
  body: BodyKind | null;
  power: Power | null;
} {
  const d = description.toUpperCase();
  // Up to the last drive word: NHTSA adds notes after it ("… FWD Later
  // Release", "… 4WD W/ SAB"), which hid the drive, body and doors.
  const all = d.trim().split(/\s+/);
  let lastDrive = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (DRIVE_WORD.test(all[i])) {
      lastDrive = i;
      break;
    }
  }
  const words = lastDrive >= 0 ? all.slice(0, lastDrive + 1) : all;
  const driveWord = DRIVE_WORD.test(words.at(-1) ?? "") ? words.pop()! : null;
  const drive = (driveWord === "4X4" ? "4WD" : driveWord === "4X2" ? "2WD" : driveWord) as VersionFit["drive"];
  const last = words.at(-1) ?? "";
  const glued = /^(\d)(DR|HB)$/.exec(last); // "4DR"
  const kind = glued ? glued[2] : last;
  const doorWord = glued ? glued[1] : words.at(-2);

  // The code when there is one ("PU/CC"), else the cab in words ("Crew Cab").
  const cab = ((/\bPU\/(CC|EC|RC)\b/.exec(d)?.[1] as VersionFit["cab"] | undefined) ?? cabOfName(d)) as VersionFit["cab"];
  const body: BodyKind | null = /\bPU\//.test(d) || cab
    ? "pickup"
    : kind === "C"
      ? "convertible"
      : kind === "HB"
        ? "hatchback"
        : kind === "SW"
          ? "wagon"
          : kind === "SUV"
            ? "suv"
            : kind === "VAN"
              ? "van"
              : kind === "DR"
                ? "closed"
                : null;
  const doors = (kind === "DR" || kind === "HB") && doorWord && /^\d$/.test(doorWord) ? Number(doorWord) : null;
  // "HV" too: NHTSA names the 2017 Highlander Hybrid "Highlander HV SUV AWD".
  const power: Power | null = /\b(PHEV|PRIME|PLUG-IN|ENERGI|4XE)\b/.test(d)
    ? "plugin"
    : /\b(HEV|HV|HYBRID)\b/.test(d)
      ? "hybrid"
      : /\bDIESEL\b/.test(d)
        ? "diesel"
        : /\b(EV|BEV|ELECTRIC)\b/.test(d)
          ? "electric"
          : null;
  return { doors, cab, drive, body, power };
}

const allWheels = (x: string) => x === "AWD" || x === "4WD";

/**
 * How well a rated version matches the car. Each detail counts only when
 * both sides state it; a clash counts against.
 *
 * Ratings treat all-wheel and four-wheel drive alike (a Mercedes 4MATIC
 * sedan is rated "4 DR 4WD"), and a truck's "2WD" is its rear-wheel drive,
 * so those are near matches. A word of the rated model's own name that the
 * car's trim also has ("XDRIVE") counts for it; one it lacks counts for
 * nothing, because vPIC leaves some out (it decodes a Ram 1500 Classic as a
 * "1500" like the newer truck).
 */
function versionScore(v: { description: string; extra?: string[] }, fit: VersionFit): number {
  const r = readVersion(v.description);
  let score = 0;
  if (r.doors && fit.doors) score += r.doors === fit.doors ? 2 : -3;
  if (r.cab && fit.cab) score += r.cab === fit.cab ? 2 : -3;
  if (r.drive && fit.drive) {
    const near =
      (allWheels(r.drive) && allWheels(fit.drive)) ||
      ((r.drive === "2WD" || fit.drive === "2WD") && !allWheels(r.drive) && !allWheels(fit.drive));
    score += r.drive === fit.drive ? 2 : near ? 1 : -2;
  }
  if (r.body && fit.body) score += r.body === fit.body ? 3 : -3;
  if (r.power && fit.power) score += r.power === fit.power ? 3 : -3;
  for (const w of v.extra ?? []) if (fit.words.includes(w)) score += 2;
  return score;
}

/**
 * The best-matching versions. Several only when they tie; the page then shows
 * one set of stars if they agree, or each version if they don't — never one
 * version's stars as another's.
 */
export function pickVersions<T extends { description: string; extra?: string[] }>(versions: T[], fit: VersionFit): T[] {
  if (versions.length <= 1) return versions;
  const scored = versions.map((v) => ({ v, s: versionScore(v, fit) }));
  const best = Math.max(...scored.map((x) => x.s));
  return scored.filter((x) => x.s === best).map((x) => x.v);
}

/**
 * The other versions to compare this car's stars with: built like it (the
 * same body, cab and doors as NHTSA names them), differing in drive or
 * powertrain. A crew cab is compared with crew cabs, never with a regular
 * cab; closest to the car first.
 */
export function siblingVersions<T extends { description: string; extra?: string[] }>(
  primary: T,
  rest: T[],
  fit: VersionFit,
): T[] {
  const p = readVersion(primary.description);
  return rest
    .map((v, i) => ({ v, i, r: readVersion(v.description) }))
    .filter(({ r }) => r.body === p.body && r.cab === p.cab && r.doors === p.doors)
    .sort((a, b) => versionScore(b.v, fit) - versionScore(a.v, fit) || a.i - b.i)
    .map(({ v }) => v);
}

/** The most rated models one check reads, and the most versions it fetches stars for. */
const MAX_RATED_MODELS = 16;
const MAX_RATED_VERSIONS = 6;
/** The most other versions read to compare with. */
const MAX_OTHER_VERSIONS = 4;

/**
 * The rated models to read for this car, from the make's list for the year.
 *
 * A model's versions are often rated under names of their own. A 2015 BMW
 * 328i xDrive is rated as "328I XDRIVE", the rear-drive car as "328I"; a 2018
 * F-150 only as "F-150 SUPER CREW", "F-150 SUPERCAB" and "F-150 REGULAR CAB";
 * a 2019 Ram 1500 as "1500" or "1500 CLASSIC", the older truck, which vPIC
 * decodes the same way; a 2021 RAV4 beside "RAV4 HYBRID" and "RAV4 PRIME"
 * (all live, Nov 2026). So a name NHTSA rates as it is brings the longer
 * names that start with it, and when none is rated as it is, the longer
 * names of all of them are read. "SILVERADO" never brings "SILVERADO 2500"
 * when "SILVERADO 1500" is rated as it is.
 */
export function ratedModelsFor(
  rated: string[],
  names: string[],
  limit = MAX_RATED_MODELS,
  separate: string[] = [],
): { model: string; extra: string[] }[] {
  // NHTSA's own names, so "(ALL VARIANTS)" and "450H+" are fine; only "/"
  // would break the request path.
  const models = [...new Set(rated.map((m) => m.trim()).filter((m) => m && m.length <= 60 && !m.includes("/")))];
  const wanted = names.map((n) => n.toUpperCase());
  const exact = wanted.filter((n) => models.some((m) => m.toUpperCase() === n));
  const roots = exact.length > 0 ? exact : wanted;

  const found: { model: string; extra: string[]; rank: number; longer: number }[] = [];
  for (const model of models) {
    const u = model.toUpperCase();
    // The longest root it equals or extends: "SILVERADO 1500" before "SILVERADO".
    const root = roots
      .filter((n) => u === n || u.startsWith(`${n} `))
      .sort((a, b) => b.length - a.length)[0];
    if (root === undefined) continue;
    // "ROGUE SPORT" is not a version of the Rogue.
    if (u !== root && isSeparateModel(model, root, separate, names[0] ?? "")) continue;
    const extra = u
      .slice(root.length)
      .split(/\s+/)
      .map((w) => w.replace(/[^A-Z0-9]/g, ""))
      .filter((w) => w.length >= 2);
    found.push({ model, extra, rank: wanted.indexOf(root), longer: u === root ? 0 : 1 });
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.longer - b.longer || a.model.localeCompare(b.model))
    .slice(0, limit)
    .map(({ model, extra }) => ({ model, extra }));
}

async function ratingsLive(year: number, make: string, names: string[], fit: VersionFit): Promise<CrashRatings> {
  needNames("ratings", names);
  const stars = (v: unknown) => {
    const s = text(v);
    return s && s !== "Not Rated" ? s : null;
  };
  const base = `https://api.nhtsa.gov/SafetyRatings/modelyear/${year}/make/${enc(make)}`;

  const [all, separate] = await Promise.all([
    getJson<{ Results?: { Model?: unknown }[] }>("ratings models", base, { timeoutMs: 8_000 }),
    separateModels(year, make),
  ]);
  const allModels = (all.Results ?? []).map((r) => text(r.Model)).filter((m): m is string => !!m);
  const models = ratedModelsFor(allModels, names, MAX_RATED_MODELS, separate);
  // Models left out by the cap mean the matches below may not be all of them.
  const modelsCut = ratedModelsFor(allModels, names, Infinity, separate).length > models.length;

  // Each model's list names its versions, so the matching is done on the
  // names and stars are fetched only for the versions that match best.
  const lists = await Promise.all(
    models.map(({ model }) =>
      getJson<{ Results?: { VehicleId?: unknown; VehicleDescription?: unknown }[] }>(
        "ratings list",
        `${base}/model/${enc(model)}`,
        { timeoutMs: 8_000 },
      ),
    ),
  );
  const seen = new Set<number>();
  const candidates: VersionName[] = [];
  lists.forEach((list, i) => {
    for (const r of list.Results ?? []) {
      const id = Number(r.VehicleId);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      candidates.push({
        id,
        description: text(r.VehicleDescription) ?? `${year} ${make} ${models[i].model}`,
        extra: models[i].extra,
      });
    }
  });

  const best = pickVersions(candidates, fit);
  const picked = best.slice(0, MAX_RATED_VERSIONS);
  const bestIds = new Set(best.map((b) => b.id));
  const rest = candidates.filter((c) => !bestIds.has(c.id));
  // Others are only compared with one version the VIN pins down.
  const siblings = best.length === 1 ? siblingVersions(best[0], rest, fit).slice(0, MAX_OTHER_VERSIONS) : [];

  const detail = (c: VersionName) =>
    getJson<{ Results?: Record<string, unknown>[] }>("ratings", `https://api.nhtsa.gov/SafetyRatings/VehicleId/${c.id}`, {
      timeoutMs: 8_000,
    });
  const read = (r: Record<string, unknown>, fallback: string): RatedVersion => {
    const risk = Number(r.RolloverPossibility);
    return {
      description: text(r.VehicleDescription) ?? fallback,
      overall: stars(r.OverallRating),
      front: stars(r.OverallFrontCrashRating),
      side: stars(r.OverallSideCrashRating),
      rollover: stars(r.RolloverRating),
      rolloverRisk: Number.isFinite(risk) && risk > 0 && risk < 1 ? risk : null,
    };
  };
  const [details, otherDetails] = await Promise.all([
    Promise.all(picked.map(detail)),
    // A version only compared with is left out if it can't be read; the
    // count below then tells the page not every version was checked.
    Promise.all(siblings.map((c) => detail(c).catch(() => null))),
  ]);
  const versions = details.map((d, i): RatedVersion => {
    const r = d.Results?.[0];
    // Never shown short: with one of the best matches missing, the others'
    // stars could pass for this car's.
    if (!r) throw new Unavailable("ratings: a version came back empty");
    return read(r, picked[i].description);
  });
  const others = otherDetails.flatMap((d, i) => {
    const r = d?.Results?.[0];
    return r ? [read(r, siblings[i].description)] : [];
  });
  return {
    versions,
    matched: modelsCut ? Math.max(best.length, picked.length + 1) : best.length,
    others,
    // Models left out by the cap may hold more versions still.
    otherCount: modelsCut ? Math.max(rest.length, others.length + 1) : rest.length,
    fetchedAt: new Date().toISOString(),
  };
}

const ratingsCached = unstable_cache(
  (year: number, make: string, names: string[], fit: VersionFit) =>
    shared(JSON.stringify(["ratings", year, make, names, fit]), () => ratingsLive(year, make, names, fit)),
  // v6: versions gained `rolloverRisk`, and the answer `others` and `otherCount`.
  ["nhtsa-ratings-v6"],
  { revalidate: 30 * DAY },
);

export function crashRatings(
  year: number,
  make: string,
  names: string[],
  fit: VersionFit,
): Promise<CrashRatings | null> {
  return orNull("ratings", ratingsCached(year, make, names, fit));
}

/**
 * The same lookups without the cache, for scripts — the cache needs Next's
 * runtime, which a script lacks. The site always uses the functions above.
 */
export const uncached = {
  decodeVin: (vin: string) => orNull("decode", decodeLive(vin)),
  recallsForModel: (y: number, mk: string, names: string[], want: Want = ANY) =>
    orNull("recalls", recallsLive(y, mk, names, want)),
  complaintsForModel: (y: number, mk: string, names: string[], want: Want = ANY) =>
    orNull("complaints", complaintsLive(y, mk, names, want)),
  crashRatings: (y: number, mk: string, names: string[], fit: VersionFit) =>
    orNull("ratings", ratingsLive(y, mk, names, fit)),
};
