/**
 * Plain facts about a car, from what NHTSA's VIN decoder (vPIC) already
 * returns: doors, seats, engine, transmission, drive, fuel, where it was
 * built, its trims, its base price and its safety equipment.
 *
 * Read once on the server into `details` (summarizeDecode in nhtsa.ts), kept
 * as data rather than sentences so the wording can change without a new
 * cache, and written out as short lines on the page (factLines). Pure, so the
 * page imports it too. Anything vPIC leaves blank is left out, never guessed.
 */
import { joinAnd, joinOr, titleCase } from "./plain";

const text = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s && s !== "Not Applicable" ? s : null;
};

export type DriveKind = "AWD" | "4WD" | "FWD" | "RWD" | "2WD" | "2WD/4WD";
export type FuelKind =
  | "gas"
  | "diesel"
  | "hybrid"
  | "plugin"
  | "electric"
  | "flex"
  | "hydrogen"
  | "natural-gas"
  | "propane";
export type GearboxKind = "automatic" | "manual" | "cvt" | "dual-clutch" | "automated-manual" | "direct";
export type SafetyKey =
  | "aeb"
  | "fcw"
  | "paeb"
  | "bsw"
  | "ldw"
  | "lka"
  | "acc"
  | "camera"
  | "rcta"
  | "esc"
  | "abs"
  | "tcs"
  | "tpms"
  | "autoHigh"
  | "keyless";
export type AirBag = "front" | "side" | "curtain" | "knee" | "driver-knee" | "passenger-knee";

export interface CarDetails {
  doors: number | null;
  seats: number | null;
  seatRows: number | null;
  /** Engine size in liters, one decimal. */
  liters: number | null;
  cylinders: number | null;
  layout: "V" | "inline" | "flat" | "W" | "rotary" | null;
  hp: number | null;
  turbo: boolean;
  /** Runs on an electric motor alone (battery or fuel cell): no engine size to give. */
  electricMotor: boolean;
  speeds: number | null;
  gearbox: GearboxKind | null;
  drive: DriveKind | null;
  fuel: FuelKind | null;
  /** In title case: "Princeton", "Indiana", "United States". */
  plant: { city: string | null; state: string | null; country: string | null };
  /** Only when vPIC lists several: "SE/XLE" -> ["SE", "XLE"]. One trim is already in the car's name. */
  trims: string[];
  /** The maker's base price as reported to NHTSA, when it is a believable one. */
  basePrice: number | null;
  /** Equipment vPIC marks standard or optional, in the order the page lists it. */
  safety: { key: SafetyKey; optional: boolean }[];
  airBags: AirBag[];
}

/** vPIC's field for each piece of safety equipment, in the page's order. */
const SAFETY_FIELDS: [SafetyKey, string[]][] = [
  ["aeb", ["CIB"]],
  ["fcw", ["ForwardCollisionWarning"]],
  ["paeb", ["PedestrianAutomaticEmergencyBraking"]],
  ["bsw", ["BlindSpotMon"]],
  ["ldw", ["LaneDepartureWarning"]],
  ["lka", ["LaneKeepSystem"]],
  ["acc", ["AdaptiveCruiseControl"]],
  ["camera", ["RearVisibilitySystem"]],
  ["rcta", ["RearCrossTrafficAlert"]],
  ["esc", ["ESC"]],
  ["abs", ["ABS"]],
  ["tcs", ["TractionControl"]],
  ["tpms", ["TPMS"]],
  ["autoHigh", ["SemiautomaticHeadlampBeamSwitching", "AdaptiveDrivingBeam"]],
  ["keyless", ["KeylessIgnition"]],
];

function equipped(key: SafetyKey, raw: string | null): "standard" | "optional" | null {
  if (!raw) return null;
  if (/^standard$/i.test(raw)) return "standard";
  if (/^optional$/i.test(raw)) return "optional";
  // vPIC says which kind of tire pressure monitor rather than "Standard".
  if (key === "tpms" && /^(direct|indirect)$/i.test(raw)) return "standard";
  return null;
}

function fuelKind(primary: string | null, secondary: string | null, electrification: string | null): FuelKind | null {
  const e = electrification ?? "";
  if (/plug-in|PHEV/i.test(e)) return "plugin";
  if (/FCEV|fuel cell/i.test(e)) return "hydrogen";
  if (/BEV/.test(e)) return "electric";
  // A mild hybrid is sold and driven as a gas car.
  if (/HEV/.test(e) && !/mild/i.test(e)) return "hybrid";
  const p = primary ?? "";
  if (/fuel cell|hydrogen/i.test(p)) return "hydrogen";
  if (/electric/i.test(p)) return "electric";
  if (/diesel/i.test(p)) return "diesel";
  if (/flexible|\bFFV\b/i.test(p) || (/gasoline/i.test(p) && /ethanol|E85/i.test(secondary ?? ""))) return "flex";
  if (/natural gas|\bCNG\b/i.test(p)) return "natural-gas";
  if (/propane|\bLPG\b/i.test(p)) return "propane";
  // Older decodes leave the electrification out but name the second fuel.
  if (/gasoline/i.test(p)) return !e && /electric/i.test(secondary ?? "") ? "hybrid" : "gas";
  if (/ethanol|E85/i.test(p)) return "flex";
  return null;
}

function gearbox(style: string | null): GearboxKind | null {
  if (!style) return null;
  if (/continuously variable|\bCVT\b/i.test(style)) return "cvt";
  if (/dual[- ]clutch|\bDCT\b/i.test(style)) return "dual-clutch";
  if (/automated manual|\bAMT\b/i.test(style)) return "automated-manual";
  if (/direct drive/i.test(style)) return "direct";
  if (/manual|standard/i.test(style)) return "manual";
  if (/automatic/i.test(style)) return "automatic";
  return null;
}

function driveKind(raw: string | null): DriveKind | null {
  if (!raw) return null;
  if (raw === "4x2") return "2WD";
  if (/^2WD\/4WD$/i.test(raw)) return "2WD/4WD";
  const first = raw.split("/")[0].trim().toUpperCase();
  return first === "AWD" || first === "4WD" || first === "FWD" || first === "RWD" || first === "2WD" ? first : null;
}

function layoutOf(raw: string | null): CarDetails["layout"] {
  if (!raw) return null;
  if (/^V\b|V-shaped/i.test(raw)) return "V";
  if (/^W\b|W-shaped/i.test(raw)) return "W";
  if (/in-line|inline|straight/i.test(raw)) return "inline";
  if (/opposed|boxer|flat/i.test(raw)) return "flat";
  if (/rotary/i.test(raw)) return "rotary";
  return null;
}

/** "UNITED STATES (USA)" -> "United States"; "KOREA (SOUTH)" -> "South Korea". */
function countryName(raw: string | null): string | null {
  if (!raw) return null;
  if (/korea/i.test(raw) && /south/i.test(raw)) return "South Korea";
  const name = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return name ? titleCase(name) : null;
}

/**
 * The state of a U.S. car plant, by its city.
 *
 * vPIC often gives a plant's city and leaves its state out: a 2013 ML350
 * decodes as built in "VANCE" with no state, while a 2015 C-Class from the
 * same plant decodes as "VANCE", "ALABAMA" (both live, Nov 2026). "Built in
 * Vance" tells a buyer nothing. This is not a guess: each city here has had
 * one car assembly plant district, in one state, and the lookup is used only
 * when vPIC says the country is the United States. A city it doesn't list
 * stays a city alone. Kansas City is left out on purpose: Ford's plant is in
 * Missouri and GM's in Kansas.
 */
const US_PLANT_STATE: Record<string, string> = {
  // Alabama
  VANCE: "Alabama",
  TUSCALOOSA: "Alabama",
  LINCOLN: "Alabama",
  MONTGOMERY: "Alabama",
  HUNTSVILLE: "Alabama",
  // California
  FREMONT: "California",
  // Georgia
  "WEST POINT": "Georgia",
  // Illinois
  NORMAL: "Illinois",
  BELVIDERE: "Illinois",
  CHICAGO: "Illinois",
  // Indiana
  PRINCETON: "Indiana",
  LAFAYETTE: "Indiana",
  GREENSBURG: "Indiana",
  "FORT WAYNE": "Indiana",
  ROANOKE: "Indiana",
  MISHAWAKA: "Indiana",
  // Kentucky
  GEORGETOWN: "Kentucky",
  LOUISVILLE: "Kentucky",
  "BOWLING GREEN": "Kentucky",
  // Michigan
  DETROIT: "Michigan",
  DEARBORN: "Michigan",
  "FLAT ROCK": "Michigan",
  WAYNE: "Michigan",
  "STERLING HEIGHTS": "Michigan",
  WARREN: "Michigan",
  FLINT: "Michigan",
  LANSING: "Michigan",
  HAMTRAMCK: "Michigan",
  "LAKE ORION": "Michigan",
  ORION: "Michigan",
  // Mississippi
  CANTON: "Mississippi",
  "BLUE SPRINGS": "Mississippi",
  // Missouri
  WENTZVILLE: "Missouri",
  CLAYCOMO: "Missouri",
  // Ohio
  MARYSVILLE: "Ohio",
  "EAST LIBERTY": "Ohio",
  TOLEDO: "Ohio",
  LORDSTOWN: "Ohio",
  "AVON LAKE": "Ohio",
  // South Carolina
  SPARTANBURG: "South Carolina",
  GREER: "South Carolina",
  LADSON: "South Carolina",
  "NORTH CHARLESTON": "South Carolina",
  RIDGEVILLE: "South Carolina",
  // Tennessee
  SMYRNA: "Tennessee",
  CHATTANOOGA: "Tennessee",
  "SPRING HILL": "Tennessee",
  // Texas
  "SAN ANTONIO": "Texas",
  ARLINGTON: "Texas",
  AUSTIN: "Texas",
};

/** The plant's state: vPIC's own, or the one its U.S. city is in; null when neither is known. */
function plantState(plant: CarDetails["plant"]): string | null {
  if (plant.state) return plant.state;
  if (plant.country !== "United States" || !plant.city) return null;
  return US_PLANT_STATE[plant.city.toUpperCase().replace(/\s+/g, " ").trim()] ?? null;
}

/** A trim name, not a chassis code like "ZRE172L". */
const isTrimName = (t: string) => t.length > 0 && t.length <= 24 && !/^[A-Z]{2,4}\d{2,3}[A-Z]$/.test(t);

/** Reads one vPIC result (DecodeVINValuesBatch) into the car's plain facts. */
export function readDetails(v: Record<string, unknown>): CarDetails {
  const num = (key: string, min: number, max: number) => {
    const s = text(v[key]);
    const n = s === null ? NaN : Number(s.replace(/,/g, ""));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const int = (key: string, min: number, max: number) => {
    const n = num(key, min, max);
    return n !== null && Number.isInteger(n) ? n : null;
  };

  const fuel = fuelKind(text(v.FuelTypePrimary), text(v.FuelTypeSecondary), text(v.ElectrificationLevel));
  const liters = num("DisplacementL", 0.5, 10);
  const hp = num("EngineHP", 20, 2000);
  const price = num("BasePrice", 5_000, 500_000);

  const trim = text(v.Trim);
  const trims = trim && /[/,]/.test(trim) ? [...new Set(trim.split(/[/,]/).map((t) => t.trim()).filter(isTrimName))] : [];

  const safety: CarDetails["safety"] = [];
  for (const [key, fields] of SAFETY_FIELDS) {
    const said = fields.map((f) => equipped(key, text(v[f])));
    const status = said.includes("standard") ? "standard" : said.includes("optional") ? "optional" : null;
    if (status) safety.push({ key, optional: status === "optional" });
  }

  const airBags: AirBag[] = [];
  if (text(v.AirBagLocFront)) airBags.push("front");
  if (text(v.AirBagLocSide)) airBags.push("side");
  if (text(v.AirBagLocCurtain)) airBags.push("curtain");
  const knee = text(v.AirBagLocKnee);
  if (knee) airBags.push(/driver seat only/i.test(knee) ? "driver-knee" : /passenger seat only/i.test(knee) ? "passenger-knee" : "knee");

  const city = text(v.PlantCity);
  const state = text(v.PlantState);
  return {
    doors: int("Doors", 1, 6),
    seats: int("Seats", 1, 15),
    seatRows: int("SeatRows", 1, 5),
    liters: liters === null ? null : Math.round(liters * 10) / 10,
    cylinders: int("EngineCylinders", 1, 16),
    layout: layoutOf(text(v.EngineConfiguration)),
    hp: hp === null ? null : Math.round(hp),
    turbo: /^yes$/i.test(text(v.Turbo) ?? ""),
    electricMotor: fuel === "electric" || fuel === "hydrogen",
    speeds: int("TransmissionSpeeds", 1, 12),
    gearbox: gearbox(text(v.TransmissionStyle)),
    drive: driveKind(text(v.DriveType)),
    fuel,
    plant: {
      city: city ? titleCase(city) : null,
      state: state ? titleCase(state) : null,
      country: countryName(text(v.PlantCountry)),
    },
    trims: trims.length >= 2 ? trims.slice(0, 8) : [],
    basePrice: price === null ? null : Math.round(price),
    safety,
    airBags,
  };
}

/* ── On the page ────────────────────────────────────────────────────────── */

/** What the facts are written from: the decode's own fields plus its details. */
export interface CarFacts {
  body: string | null;
  fit: { cab: "CC" | "EC" | "RC" | null; body: string | null; doors: number | null };
  details?: CarDetails | null;
}

export interface Fact {
  key: "body" | "seats" | "engine" | "transmission" | "drive" | "fuel" | "built" | "trim" | "price";
  /** A Font Awesome icon name, without "fa-". */
  icon: string;
  label: string;
  text: string;
  note?: string;
}

const CAB: Record<"CC" | "EC" | "RC", string> = { CC: "crew cab", EC: "extended cab", RC: "regular cab" };

const DRIVE: Record<DriveKind, string> = {
  AWD: "All-wheel drive",
  "4WD": "4-wheel drive",
  FWD: "Front-wheel drive",
  RWD: "Rear-wheel drive",
  "2WD": "2-wheel drive",
  "2WD/4WD": "2- or 4-wheel drive",
};

const FUEL: Record<FuelKind, [string, string]> = {
  gas: ["Gas", "gas-pump"],
  diesel: ["Diesel", "gas-pump"],
  hybrid: ["Hybrid", "leaf"],
  plugin: ["Plug-in hybrid", "plug"],
  electric: ["Electric", "plug"],
  flex: ["Flex fuel", "gas-pump"],
  hydrogen: ["Hydrogen", "gas-pump"],
  "natural-gas": ["Natural gas", "gas-pump"],
  propane: ["Propane", "gas-pump"],
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3.5L V6", "2.0L turbo 4-cylinder", "Electric motor"; null when vPIC gives none of it. */
function engineName(d: CarDetails): string | null {
  if (d.electricMotor) return "Electric motor";
  const n = d.cylinders;
  const cylinders =
    d.layout === "rotary"
      ? "rotary"
      : n && d.layout === "V"
        ? `V${n}`
        : n && d.layout === "W"
          ? `W${n}`
          : n
            ? `${n}-cylinder`
            : null;
  const engine = [d.liters ? `${d.liters.toFixed(1)}L` : null, d.turbo ? "turbo" : null, cylinders]
    .filter(Boolean)
    .join(" ");
  return engine || null;
}

function engineLine(d: CarDetails): string | null {
  const line = [engineName(d), d.hp ? `${d.hp} hp` : null].filter(Boolean).join(" · ");
  return line || null;
}

function gearboxLine(d: CarDetails): string | null {
  const s = d.speeds;
  switch (d.gearbox) {
    case "cvt":
      return "Automatic (CVT)";
    case "direct":
      return "Single-speed automatic";
    case "dual-clutch":
      return s ? `${s}-speed dual-clutch automatic` : "Dual-clutch automatic";
    case "automated-manual":
      return s ? `${s}-speed automated manual` : "Automated manual";
    case "automatic":
      return s === 1 ? "Single-speed automatic" : s ? `${s}-speed automatic` : "Automatic";
    case "manual":
      return s ? `${s}-speed manual` : "Manual";
    default:
      return s ? `${s}-speed` : null;
  }
}

/**
 * "Vance, Alabama"; "Toyota, Japan"; the country alone when that is all
 * there is. The state is worked out here, not when the decode is read, so a
 * decode already in the cache gets it too.
 */
function builtLine(d: CarDetails): string | null {
  const { city, country } = d.plant;
  const state = plantState(d.plant);
  const abroad = country && country !== "United States" ? country : null;
  const parts = [city, state, abroad].filter((p): p is string => !!p);
  if (parts.length > 0) return [...new Set(parts)].join(", ");
  return country;
}

/**
 * One short line for each thing NHTSA knows about the car, in the page's
 * order; a line NHTSA has nothing for is left out.
 */
export function factLines(car: CarFacts, locale = "en-US"): Fact[] {
  const d = car.details ?? null;
  const out: Fact[] = [];
  const doors = d?.doors ?? car.fit.doors;
  const cab = car.fit.body === "pickup" && car.fit.cab ? CAB[car.fit.cab] : null;
  const body = [car.body, cab, doors ? plural(doors, "door", "doors") : null].filter(Boolean).join(" · ");
  if (body) out.push({ key: "body", icon: "car-side", label: "Body", text: body });
  if (!d) return out;

  if (d.seats && d.seatRows) {
    out.push({
      key: "seats",
      icon: "users",
      label: "Seats",
      text: `${plural(d.seats, "seat", "seats")} in ${plural(d.seatRows, "row", "rows")}`,
    });
  } else if (d.seats) {
    out.push({ key: "seats", icon: "users", label: "Seats", text: plural(d.seats, "seat", "seats") });
  } else if (d.seatRows) {
    out.push({ key: "seats", icon: "users", label: "Seats", text: `${plural(d.seatRows, "row", "rows")} of seats` });
  }

  const engine = engineLine(d);
  if (engine) out.push({ key: "engine", icon: d.electricMotor ? "bolt" : "gauge-high", label: d.electricMotor ? "Motor" : "Engine", text: engine });
  const gears = gearboxLine(d);
  if (gears) out.push({ key: "transmission", icon: "gears", label: "Transmission", text: gears });
  if (d.drive) out.push({ key: "drive", icon: "road", label: "Drive", text: DRIVE[d.drive] });
  if (d.fuel) out.push({ key: "fuel", icon: FUEL[d.fuel][1], label: "Fuel", text: FUEL[d.fuel][0] });
  const built = builtLine(d);
  if (built) out.push({ key: "built", icon: "industry", label: "Built in", text: built });
  if (d.trims.length >= 2) out.push({ key: "trim", icon: "tag", label: "Trim", text: joinOr(d.trims) });
  if (d.basePrice) {
    const price = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
      d.basePrice,
    );
    out.push({
      key: "price",
      icon: "dollar-sign",
      label: "Price new",
      text: `From ${price} when new`,
      note: "Maker’s base price reported to NHTSA.",
    });
  }
  return out;
}

/** The facts that tell one car from another at a glance, in the page's order. */
const CONFIRM_KEYS: Fact["key"][] = ["body", "seats", "engine", "transmission", "drive", "fuel", "built"];

/**
 * The short list on "Is this the car?": the results' own facts (factLines),
 * so the two steps can't say different things, without the ones that don't
 * help someone recognize a car (its trims and its price when new). Gas is
 * left out next to an engine, which already says as much; a hybrid, a diesel
 * or an electric car is named.
 */
export function confirmFacts(car: CarFacts, locale = "en-US"): Fact[] {
  const facts = factLines(car, locale).filter((f) => CONFIRM_KEYS.includes(f.key));
  const engine = facts.some((f) => f.key === "engine");
  return facts.filter((f) => f.key !== "fuel" || !engine || car.details?.fuel !== "gas");
}

/**
 * The same facts as one line, for a decode with too few of them for a list:
 * "SUV · 3.5L V6 · 4-wheel drive · Built in Princeton, Indiana". Null
 * without details, so the page can fall back.
 */
export function summaryLine(car: CarFacts): string | null {
  const d = car.details;
  if (!d) return null;
  const built = builtLine(d);
  return [
    car.body,
    // An electric car has no engine size; what it runs on says enough.
    engineName(d) ?? (d.fuel ? FUEL[d.fuel][0] : null),
    d.drive ? DRIVE[d.drive] : null,
    built ? `Built in ${built}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const SAFETY_NAMES: Record<SafetyKey, string> = {
  aeb: "Automatic emergency braking",
  fcw: "Forward collision warning",
  paeb: "Pedestrian emergency braking",
  bsw: "Blind spot warning",
  ldw: "Lane departure warning",
  lka: "Lane keeping assist",
  acc: "Adaptive cruise control",
  camera: "Backup camera",
  rcta: "Rear cross traffic alert",
  esc: "Stability control",
  abs: "Anti-lock brakes",
  tcs: "Traction control",
  tpms: "Tire pressure monitor",
  autoHigh: "Auto high beams",
  keyless: "Keyless start",
};

/** The safety checklist: what is standard first, then what was optional. */
export function safetyItems(d: CarDetails | null | undefined): { name: string; optional: boolean }[] {
  if (!d) return [];
  const items = d.safety.map((s) => ({ name: SAFETY_NAMES[s.key], optional: s.optional }));
  return [...items.filter((i) => !i.optional), ...items.filter((i) => i.optional)];
}

const AIR_BAG_WORDS: Record<AirBag, string> = {
  front: "front",
  side: "side",
  curtain: "curtain",
  knee: "knee",
  "driver-knee": "driver’s knee",
  "passenger-knee": "passenger’s knee",
};

/** "Air bags: front, side, curtain and driver's knee". */
export function airBagsLine(d: CarDetails | null | undefined): string | null {
  if (!d || d.airBags.length === 0) return null;
  return `Air bags: ${joinAnd(d.airBags.map((a) => AIR_BAG_WORDS[a]))}`;
}

/* ── The outline shown when there is no photo ──────────────────────────── */

export type Shape = "sedan" | "suv" | "pickup" | "van" | "hatchback" | "coupe" | "convertible" | "wagon" | "car";

/** The body shape to outline, from the decoded body ("closed" is a sedan or a coupe). */
export function bodyShape(car: CarFacts): Shape {
  switch (car.fit.body) {
    case "convertible":
    case "hatchback":
    case "wagon":
    case "suv":
    case "pickup":
    case "van":
      return car.fit.body;
    case "closed":
      return car.body === "Coupe" || (car.details?.doors ?? car.fit.doors) === 2 ? "coupe" : "sedan";
    default:
      return "car";
  }
}
