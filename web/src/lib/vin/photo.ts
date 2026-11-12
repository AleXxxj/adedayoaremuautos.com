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
 * Wikimedia blocks anonymous scripts and answers 429 when hammered, so the
 * lookup names itself, asks one question at a time, gives each 4 seconds,
 * and treats any failure as "no photo": the page then draws the body shape.
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
  /** The model it was found under: "Highlander", "Silverado 1500". */
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

/**
 * The model names to search for, most specific first: a truck's load series
 * before the plain name ("Silverado 1500", then "Silverado"); "RAV4 Prime
 * (PHEV)" as "RAV4 Prime". At most two, so a lookup is at most six requests.
 */
export function photoNames(model: string, series: string | null): string[] {
  const bases = (cleanModel(model) ?? model)
    .split("/")
    .map((m) => m.trim())
    .filter(Boolean);
  const names = series && bases[0] ? [`${bases[0]} ${series}`, ...bases] : bases;
  return [...new Set(names)].filter((n) => SAFE.test(n)).slice(0, 2);
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
 * the year, make and model, with nothing after it that names a part, a bad
 * scene, a different series or a different body. Front views first, then
 * Commons' own search order.
 */
export function pickPhoto(reply: unknown, year: number, make: string, model: string, want: PhotoWant): CarPhoto | null {
  const pages = Object.values(
    ((reply as { query?: { pages?: Record<string, Page> } } | null)?.query?.pages ?? {}) as Record<string, Page>,
  );
  const prefix = `${year} ${make} ${model}`.toLowerCase();
  const found: { front: boolean; index: number; photo: CarPhoto }[] = [];

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
    if (!title.toLowerCase().startsWith(prefix)) continue;
    const rest = title.slice(prefix.length);
    // "2016 Toyota Highlanders" or "…RAV4X" is not this model.
    if (/^[A-Za-z0-9]/.test(rest)) continue;
    if (NOT_THE_CAR.test(rest)) continue;
    const sibling = OTHER_MODEL.exec(rest)?.[1];
    if (sibling && !want.words.includes(sibling.toUpperCase())) continue;
    const series = /^[\s,(_-]*(\d{3,4}[A-Za-z]{0,2})\b/.exec(rest)?.[1];
    if (series && want.series && series.toUpperCase() !== want.series.toUpperCase()) continue;
    if (want.shape !== "car" && BODY_WORDS.some(([re, shape]) => shape !== want.shape && re.test(rest))) continue;

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

    found.push({
      front: /\bfront\b/i.test(rest),
      index: Number(page.index) || 999,
      photo: {
        src,
        width: Math.round(tw),
        height: Math.round(th),
        photoYear: year,
        model,
        title,
        pageUrl,
        artist,
        license,
        licenseUrl: /^https?:\/\//.test(licenseUrl) ? licenseUrl.replace(/^http:/, "https:") : null,
      },
    });
  }
  found.sort((a, b) => Number(b.front) - Number(a.front) || a.index - b.index);
  return found[0]?.photo ?? null;
}

/* ── Asking Commons ─────────────────────────────────────────────────────── */

/** Wikimedia asks automated clients to say who they are and how to reach them. */
const userAgent = () => `AdedayoAremuAutos-CarCheck/1.0 (+${siteUrl()}/us/contact)`;

export function searchUrl(year: number, make: string, model: string): string {
  const q = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `intitle:"${year} ${make} ${model}"`,
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
  ["commons-photo-v1"],
  { revalidate: 30 * DAY },
);

/** What is searched for: the make as people write it, and the model's names. */
function query(car: DecodedVin): { year: number; make: string; names: string[]; want: PhotoWant } | null {
  if (!car.year || !car.make || !car.model) return null;
  const make = brand(car.make);
  const names = photoNames(car.model, car.series);
  if (!SAFE.test(make) || names.length === 0) return null;
  return { year: car.year, make, names, want: { series: car.series, shape: bodyShape(car), words: car.fit.words } };
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
