import "server-only";
import { unstable_cache } from "next/cache";
import { siteUrl } from "@/lib/siteUrl";
import { bodyShape, type Shape } from "./features";
import { brand, cleanModel } from "./plain";
import type { DecodedVin } from "./nhtsa";

/**
 * A photo of the car's model, from Wikimedia Commons.
 *
 * NHTSA's own `VehiclePicture` was empty for all 20 popular cars tried (Nov
 * 2026), so the photo comes from Commons, which hosts only freely licensed
 * files. A ranking test on 15 cars found a front view of the exact model
 * year, or one either side, for nearly all of them.
 *
 * Only the year, make and model are sent to Wikimedia, never the VIN. The
 * photo is shown through next/image (next.config.ts), so a visitor's browser
 * never contacts Wikimedia; the credit links to the file's page and license,
 * as CC BY and CC BY-SA require.
 *
 * Makers that sell a class under badges need more than the model's name:
 * NHTSA calls a 2013 ML350 an "ML-Class", and nobody names a photo that.
 * Photographers write "ML350", "ML 350" or "M-Class", so the car is looked
 * for under its badge and then under any badge of its class (photoNames).
 *
 * Wikimedia blocks anonymous scripts and answers 429 when hammered, so the
 * lookup names itself, asks one question at a time, gives each 4 seconds,
 * and treats any failure as "no photo": the page then shows a plain outline
 * of the body shape.
 */

const DAY = 86_400;
const API = "https://commons.wikimedia.org/w/api.php";

export interface CarPhoto {
  /** A 960-pixel thumbnail on Wikimedia's servers, without its query string. */
  src: string;
  width: number;
  height: number;
  /** The model year the photo shows: the car's, or one either side. */
  photoYear: number;
  /** The model it was found under, as people write it: "Highlander", "Silverado 1500", "ML350", "C-Class". */
  model: string;
  /** The file's name on Commons, without "File:" and its extension. */
  title: string;
  /** The file's page, which names its author and license in full. */
  pageUrl: string;
  /** The author, as the file's page gives it; null only for public domain files. */
  artist: string | null;
  /** "CC BY-SA 4.0", "Public domain". */
  license: string;
  licenseUrl: string | null;
}

/** Thrown inside the cached lookup, so a failure is not stored as "no photo". */
class NoAnswer extends Error {}

let fetchImpl: typeof fetch = (input, init) => fetch(input, init);
/** For scripts/verify-vin-plain.mts: canned Commons replies. */
export function __setPhotoFetchForTests(f: typeof fetch): void {
  fetchImpl = f;
}

/** A name safe inside the search's quotes. */
const SAFE = /^[A-Za-z0-9][A-Za-z0-9 .&'+\-]{0,39}$/;

/** Letters and digits only, in capitals: "ML 350" and "ML350" are the same badge. */
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A model badge: a few letters, then two or three digits ("ML350", "RX 350", "E350"). */
const BADGE = /^[A-Za-z]{1,4} ?\d{2,3}[A-Za-z]?$/;

/** A Mercedes-Benz class as NHTSA's decoder names it: "C-Class", "ML-Class", "GLE-Class". */
const CLASS = /^([A-Za-z]{1,3})-Class$/i;

/**
 * The car's own badge, if it has one: "ML350" for an ML-Class with trim
 * "ML350 4-MATIC", "RX350" for an RX with trim "350".
 *
 * Not worked out here a second time: `names` are the names NHTSA's other
 * databases file the model under (nhtsaModelNames, kept on the decode), and
 * the badge is the one among them that the car's own trim spells (`words`).
 * The badges nhtsaModelNames only guesses for a class ("C250", "C300", …)
 * are not in the trim, so none of them is taken.
 */
export function ownBadge(model: string, names: string[], words: string[]): string | null {
  const bases = (cleanModel(model) ?? model).split("/").map((m) => compact(m));
  const own = new Set(words);
  for (const name of names) {
    const key = compact(name);
    if (!BADGE.test(name) || bases.includes(key)) continue;
    const base = bases.find((b) => b && key.startsWith(b));
    if (own.has(key) || (base && own.has(key.slice(base.length)))) return name.replace(/\s+/g, "");
  }
  return null;
}

/**
 * The model names to search for, most specific first.
 *
 *   A truck's load series before the plain name: "Silverado 1500", then
 *   "Silverado". "RAV4 Prime (PHEV)" as "RAV4 Prime".
 *   A badge before its class or model: "ML350", then "ML-Class" (which is
 *   asked for as any ML: "ML 350", "ML 550", "ML-Class"), then "M-Class",
 *   the class as Commons spells it. "RX350", then "RX".
 *   BMW's "3 Series" after the badge that is its model ("328i").
 *
 * At most three, so a lookup is at most nine requests, and for most cars
 * one name and three.
 */
export function photoNames(
  model: string,
  series: string | null,
  names: string[] = [],
  words: string[] = [],
): string[] {
  const bases = (cleanModel(model) ?? model)
    .split("/")
    .map((m) => m.trim())
    .filter(Boolean);
  const out: string[] = [];
  if (series && bases[0]) out.push(`${bases[0]} ${series}`);
  const badge = ownBadge(model, names, words);
  if (badge) out.push(badge);
  for (const base of bases) {
    out.push(base);
    // NHTSA's "ML-Class" is the M-Class everywhere else.
    if (/^ML-Class$/i.test(base)) out.push("M-Class");
  }
  out.push(...names.filter((n) => /^\d Series$/i.test(n)));
  return [...new Set(out)].filter((n) => SAFE.test(n)).slice(0, 3);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * How a name is asked for, how a file's name may write it, and what the
 * credit calls it.
 *
 * A class ("GLE-Class") is asked for by its letters alone: Commons finds
 * whole words in order, so "2016 Mercedes-Benz GLE" finds "GLE 350 d",
 * "GLE 250" and "GLE-Class", all of them the class. Any other name is asked
 * for as written, and a file may write it with a space or a hyphen wherever
 * the name has one or a letter meets a digit: "ML350" is also "ML 350",
 * "F-150" also "F150".
 */
function filed(name: string): { ask: string; pattern: string; shown: string } {
  const letters = CLASS.exec(name)?.[1];
  if (letters) {
    return {
      ask: letters,
      pattern: `${escapeRe(letters)}(?:[ -]?Class|[ -]?\\d{2,3}[A-Za-z]{0,2})`,
      shown: /^ML$/i.test(letters) ? "M-Class" : name,
    };
  }
  const parts = name.split(/[\s-]+|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])/).filter(Boolean);
  return { ask: name, pattern: parts.map(escapeRe).join("[ -]?"), shown: name };
}

/* ── Choosing a photo ───────────────────────────────────────────────────── */

/**
 * Words in a file's name, after "2016 Toyota Highlander", that mean it shows
 * a part, a scene or a different car: the back, the dashboard, a badge, a
 * wreck, a police car, a show stand, a concept. From the ranking test
 * (scratchpad rank.py); not "cab", which a crew-cab pickup's name has.
 */
const NOT_THE_CAR =
  /\b(rear|back|behind|interior|inside|dash|dashboard|cockpit|engine|motor|grille?|badges?|emblems?|logos?|lights?|lamps?|headlights?|taillights?|wheels?|rims?|tires?|tyres?|seats?|trunk|boot|details?|close|closeup|close-up|wreck|wrecked|crash|crashed|accident|damaged?|burn|burned|burnt|fire|police|sheriff|taxi|ambulance|limo|limousine|hearse|concept|prototype|race|racing|rally|drift|modified|custom|tuned|lifted|show|expo|salon|motorshow|cias|naias|mias|nyias|laas|sema|iaa|geneva|frankfurt|key|steering|gauges?|odometer|console|mirrors?|hood|bonnet|underside|chassis|cutaway)\b/i;

/** A word right after the model that names a different, smaller model: a Rogue Sport is not a Rogue. */
const OTHER_MODEL = /^[\s,(_-]*(sport|cross|crosstour|connect)\b/i;

/** Body words a file's name may carry, and the shape each one means. */
const BODY_WORDS: [RegExp, Shape][] = [
  [/\b(sedan|saloon)\b/i, "sedan"],
  [/\bcoupe\b/i, "coupe"],
  [/\b(convertible|cabrio|cabriolet|roadster|spyder|spider|volante)\b/i, "convertible"],
  [/\b(wagon|estate|avant|sportwagen|shooting brake)\b/i, "wagon"],
  [/\b(hatchback|hatch|liftback|sportback)\b/i, "hatchback"],
  [/\b(pickup|truck)\b/i, "pickup"],
  [/\b(van|minivan)\b/i, "van"],
  [/\b(suv|crossover)\b/i, "suv"],
];

/** Licenses that allow showing the photo on a business's site, with credit. */
const PUBLIC_DOMAIN = /^(public domain|pd\b|cc0)/i;
const allowedLicense = (l: string) => PUBLIC_DOMAIN.test(l) || /^cc[ -]by(-sa)?[ -]\d/i.test(l);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Commons gives the author as HTML ("<a href=…>SsmIntrigue</a>"); the credit wants the words. */
export function plainArtist(html: unknown): string | null {
  if (typeof html !== "string") return null;
  const words = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 31 ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return null;
  return words.length <= 80 ? words : `${words.slice(0, 79).replace(/\s+\S*$/, "")}…`;
}

/** The thumbnail without its tracking query, if it is on a host next.config.ts allows. */
function thumbSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    const ok =
      u.protocol === "https:" &&
      ((u.hostname === "thumb.wikimedia.org" && u.pathname.startsWith("/wikipedia/commons/thumb/")) ||
        (u.hostname === "upload.wikimedia.org" && u.pathname.startsWith("/wikipedia/commons/")));
    return ok ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

/** What the car is, for telling a photo of it from a photo of a sibling. */
export interface PhotoWant {
  /** The car's load series ("1500"), when it has one. */
  series: string | null;
  shape: Shape;
  /** The trim's words (VersionFit.words): a Civic Sport may show a "Civic Sport". */
  words: string[];
  /** The car's own badge (ownBadge), when it has one: among a class's photos, its own comes first. */
  badge?: string | null;
}

type Info = {
  thumburl?: unknown;
  thumbwidth?: unknown;
  thumbheight?: unknown;
  width?: unknown;
  height?: unknown;
  mime?: unknown;
  descriptionurl?: unknown;
  extmetadata?: Record<string, { value?: unknown } | undefined>;
};
type Page = { title?: unknown; index?: unknown; imageinfo?: Info[] };

/**
 * The best photo in one Commons reply for "{year} {make} {model}", or null.
 *
 * Kept: JPEG or PNG; at least 800 × 450; landscape, 1.2 to 2.2 times as wide
 * as tall; public domain, CC0, CC BY or CC BY-SA; a name that starts with
 * the year, make and model (in any of the ways `filed` allows), with nothing
 * after it that names a part, a bad scene, a different series or a
 * different body. An SUV may be called a wagon, as Australian photographers
 * call one.
 *
 * Among a class's photos, the car's own badge comes first ("GLE 350" for a
 * GLE350), and an AMG after the plain cars unless the car is one. Then front
 * views, then Commons' own search order.
 */
export function pickPhoto(reply: unknown, year: number, make: string, model: string, want: PhotoWant): CarPhoto | null {
  const pages = Object.values(
    ((reply as { query?: { pages?: Record<string, Page> } } | null)?.query?.pages ?? {}) as Record<string, Page>,
  );
  const name = filed(model);
  const start = `${year} ${make} `;
  const prefix = new RegExp(`^${escapeRe(start)}${name.pattern}`, "i");
  const badge = want.badge ? compact(want.badge) : null;
  const found: { own: boolean; amg: boolean; front: boolean; index: number; photo: CarPhoto }[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || typeof page.title !== "string") continue;
    if (info.mime !== "image/jpeg" && info.mime !== "image/png") continue;
    const w = Number(info.width);
    const h = Number(info.height);
    if (!(w >= 800 && h >= 450) || w / h < 1.2 || w / h > 2.2) continue;

    const meta = (k: string) => {
      const v = info.extmetadata?.[k]?.value;
      return typeof v === "string" ? v.trim() : "";
    };
    const license = meta("LicenseShortName");
    if (!allowedLicense(license)) continue;

    const title = page.title.replace(/^File:/i, "").replace(/\.(jpe?g|png)$/i, "").trim();
    const named = prefix.exec(title)?.[0];
    if (!named) continue;
    const rest = title.slice(named.length);
    // "2016 Toyota Highlanders" or "…RAV4X" is not this model.
    if (/^[A-Za-z0-9]/.test(rest)) continue;
    if (NOT_THE_CAR.test(rest)) continue;
    const sibling = OTHER_MODEL.exec(rest)?.[1];
    if (sibling && !want.words.includes(sibling.toUpperCase())) continue;
    const series = /^[\s,(_-]*(\d{3,4}[A-Za-z]{0,2})\b/.exec(rest)?.[1];
    if (series && want.series && series.toUpperCase() !== want.series.toUpperCase()) continue;
    if (
      want.shape !== "car" &&
      BODY_WORDS.some(
        ([re, shape]) => shape !== want.shape && !(shape === "wagon" && want.shape === "suv") && re.test(rest),
      )
    ) {
      continue;
    }

    const src = thumbSrc(info.thumburl);
    const tw = Number(info.thumbwidth);
    const th = Number(info.thumbheight);
    if (!src || !(tw > 0 && th > 0)) continue;
    const artist = plainArtist(meta("Artist"));
    // CC BY and CC BY-SA can't be shown without naming the author.
    if (!artist && !PUBLIC_DOMAIN.test(license)) continue;
    const pageUrl = typeof info.descriptionurl === "string" && /^https:\/\//.test(info.descriptionurl) ? info.descriptionurl : null;
    if (!pageUrl) continue;
    const licenseUrl = meta("LicenseUrl");

    // "GLE 350 d" and "GLE350" are both the GLE350.
    const own = badge !== null && compact(title.slice(start.length)).startsWith(badge);
    found.push({
      own,
      amg: /\bAMG\b/i.test(title) && !want.words.includes("AMG"),
      front: /\bfront\b/i.test(rest),
      index: Number(page.index) || 999,
      photo: {
        src,
        width: Math.round(tw),
        height: Math.round(th),
        photoYear: year,
        // The badge when the photo shows it, the class when it shows a sibling.
        model: own && want.badge ? want.badge : name.shown,
        title,
        pageUrl,
        artist,
        license,
        licenseUrl: /^https?:\/\//.test(licenseUrl) ? licenseUrl.replace(/^http:/, "https:") : null,
      },
    });
  }
  found.sort(
    (a, b) =>
      Number(b.own) - Number(a.own) ||
      Number(a.amg) - Number(b.amg) ||
      Number(b.front) - Number(a.front) ||
      a.index - b.index,
  );
  return found[0]?.photo ?? null;
}

/* ── Asking Commons ─────────────────────────────────────────────────────── */

/** Wikimedia asks automated clients to say who they are and how to reach them. */
const userAgent = () => `AdedayoAremuAutos-CarCheck/1.0 (+${siteUrl()}/us/contact)`;

export function searchUrl(year: number, make: string, model: string): string {
  const q = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `intitle:"${year} ${make} ${filed(model).ask}"`,
    gsrnamespace: "6",
    gsrlimit: "30",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "960",
    // Only the three fields the credit needs, not every file's description.
    iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
    format: "json",
  });
  return `${API}?${q}`;
}

/** One question to Commons; every way it can fail throws NoAnswer. */
async function searchCommons(year: number, make: string, model: string): Promise<unknown> {
  try {
    const res = await fetchImpl(searchUrl(year, make, model), {
      headers: { accept: "application/json", "user-agent": userAgent() },
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
      throw new NoAnswer(`commons: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { error?: { code?: unknown } };
    if (body?.error) throw new NoAnswer(`commons: ${String(body.error.code ?? "error")}`);
    return body;
  } catch (e) {
    if (e instanceof NoAnswer) throw e;
    throw new NoAnswer(`commons: ${e instanceof Error ? e.name : "failed"}`);
  }
}

/**
 * The exact year, then the year before, then the year after; each year under
 * each name; the first year with a usable photo wins. One request at a time.
 */
async function photoLive(year: number, make: string, names: string[], want: PhotoWant): Promise<CarPhoto | null> {
  for (const y of [year, year - 1, year + 1]) {
    for (const name of names) {
      const photo = pickPhoto(await searchCommons(y, make, name), y, make, name, want);
      if (photo) return photo;
    }
  }
  return null;
}

/** One lookup per model at a time: "Is this the car?" starts it, and "Yes" may ask again before it ends. */
const inFlight = new Map<string, Promise<CarPhoto | null>>();

const photoCached = unstable_cache(
  (year: number, make: string, names: string[], want: PhotoWant) => {
    const key = JSON.stringify([year, make, names, want]);
    const running = inFlight.get(key);
    if (running) return running;
    const p = photoLive(year, make, names, want).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  },
  // v2: badges and classes are searched, and an SUV may be called a wagon;
  // a "no photo" kept under the old rules is asked again.
  ["commons-photo-v2"],
  { revalidate: 30 * DAY },
);

/** What is searched for: the make as people write it, and the model's names. */
function query(car: DecodedVin): { year: number; make: string; names: string[]; want: PhotoWant } | null {
  if (!car.year || !car.make || !car.model) return null;
  const make = brand(car.make);
  // `names` and `words` may be missing on a decode cached before they existed.
  const filedUnder = car.names ?? [];
  const words = car.fit?.words ?? [];
  const names = photoNames(car.model, car.series, filedUnder, words);
  if (!SAFE.test(make) || names.length === 0) return null;
  return {
    year: car.year,
    make,
    names,
    want: { series: car.series, shape: bodyShape(car), words, badge: ownBadge(car.model, filedUnder, words) },
  };
}

/** The photo for a decoded car, or null: none found, or Commons couldn't be asked. Never throws. */
export async function carPhoto(car: DecodedVin): Promise<CarPhoto | null> {
  const q = query(car);
  if (!q) return null;
  try {
    // A failed lookup throws inside the cache, so it isn't kept as "no photo".
    return await photoCached(q.year, q.make, q.names, q.want);
  } catch (e) {
    console.error(`[vin] photo: ${e instanceof NoAnswer ? e.message : e instanceof Error ? e.name : "error"}`);
    return null;
  }
}

/** The same lookup without the cache, for scripts. */
export async function carPhotoUncached(car: DecodedVin): Promise<CarPhoto | null> {
  const q = query(car);
  if (!q) return null;
  try {
    return await photoLive(q.year, q.make, q.names, q.want);
  } catch (e) {
    console.error(`[vin] photo: ${e instanceof NoAnswer ? e.message : e instanceof Error ? e.name : "error"}`);
    return null;
  }
}
