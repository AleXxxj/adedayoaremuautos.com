/**
 * NHTSA's labels in the words a car buyer uses.
 *
 * Pure, with no server-only imports: the page (VinCheck.tsx) and the server
 * (nhtsa.ts, photo.ts, recallPlain.ts) share it, so a name reads the same in
 * the photo credit, the recall list and the complaint bars.
 */

/** Makes NHTSA spells in capitals that are written that way. */
const ACRONYMS = new Set(["BMW", "GMC", "RAM", "MINI", "SRT", "AMG", "VW"]);

/** "MERCEDES-BENZ" -> "Mercedes-Benz", "BMW" stays "BMW". */
export function brand(make: string): string {
  if (ACRONYMS.has(make)) return make;
  return make
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** vPIC's model without its note: "RAV4 Prime (PHEV)" -> "RAV4 Prime". */
export const cleanModel = (m: string | null) => m?.replace(/\s*\([^)]*\)\s*$/, "") || null;

/**
 * NHTSA's capitals as a heading: "FUEL/PROPULSION SYSTEM" -> "Fuel/Propulsion
 * System", "UNKNOWN OR OTHER" -> "Unknown or Other", "ELECTRONIC STABILITY
 * CONTROL (ESC)" keeps its "(ESC)".
 */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/ (And|Or|Of|The|To|For|In|On|With) /g, (w) => w.toLowerCase())
    .replace(/\(([A-Za-z]{2,4})\)$/, (_, a: string) => `(${a.toUpperCase()})`);
}

/** "C300, C350 and C400". */
export function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "SE or XLE"; "L, LE or SE". */
export function joinOr(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

/** "a Toyota dealer", "an Audi dealer". */
export function aOrAn(word: string): "a" | "an" {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/* ── Sentences ──────────────────────────────────────────────────────────── */

/** Abbreviations a recall notice uses that end in a period but not a sentence. */
const ABBREVIATION = /\b(?:Inc|Co|Corp|Ltd|LLC|U\.S|Mr|Mrs|Ms|Dr|St|No|vs|approx|etc|e\.g|i\.e|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/i;

/**
 * A notice split into sentences. "Gulf States Toyota, Inc. (GST) is
 * recalling…" stays one sentence; "3.5L" and "U.S." don't end one.
 */
export function sentences(text: string | null): string[] {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return [];
  // No lookbehind: this module runs in the browser too, and Safari before
  // 16.4 can't parse one, which would break the whole page.
  const pieces: string[] = [];
  let start = 0;
  for (const m of flat.matchAll(/[.!?]\s+(?=["“(]?[A-Z0-9])/g)) {
    pieces.push(flat.slice(start, m.index + 1));
    start = m.index + m[0].length;
  }
  pieces.push(flat.slice(start));
  const out: string[] = [];
  for (const piece of pieces) {
    if (out.length > 0 && ABBREVIATION.test(out[out.length - 1])) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  return out;
}

/** Words that stay in capitals when a notice written in capitals is turned into sentences. */
const KEEP_UPPER = new Set(["ABS", "ECM", "PCM", "BCM", "TPMS", "NHTSA", "VIN", "LED", "ESC", "AWD", "FWD", "RWD", "4WD", "2WD", "SUV", "USA", "U.S", "GM", "EV", "HVAC", "CNG", "LPG", "PCV", "OCS", "SRS", "TRW"]);

/**
 * Older notices are written in capitals: "THE FUEL PUMP MAY FAIL." becomes
 * "The fuel pump may fail." Text that already has lower case is left alone.
 */
export function sentenceCase(text: string): string {
  const letters = text.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "");
  if (letters.length < 8 || upper.length / letters.length < 0.8) return text;
  return text
    .toLowerCase()
    .replace(/[A-Za-z0-9.]+/g, (w) => (KEEP_UPPER.has(w.toUpperCase().replace(/\.$/, "")) ? w.toUpperCase() : w))
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, c: string) => lead + c.toUpperCase());
}

/** NHTSA's own words for a free repair, which is the only basis for saying so. */
export function freeFix(remedy: string | null): boolean {
  return /free of charge|at no (cost|charge)/i.test(remedy ?? "");
}

/* ── Parts of the car ───────────────────────────────────────────────────── */

/**
 * NHTSA's top-level component names for owner complaints, in plain words.
 * Several of NHTSA's names land in one group ("SERVICE BRAKES" and "SERVICE
 * BRAKES, HYDRAULIC" are both "Brakes"), so a complaint is counted once per
 * group, on the server (nhtsa.ts), never added up from the parts.
 */
const COMPLAINT_AREAS: Record<string, string> = {
  "POWER TRAIN": "Transmission and drivetrain",
  "ELECTRICAL SYSTEM": "Electrical",
  "SERVICE BRAKES": "Brakes",
  "SERVICE BRAKES, HYDRAULIC": "Brakes",
  "SERVICE BRAKES, AIR": "Brakes",
  "SERVICE BRAKES, ELECTRIC": "Brakes",
  "PARKING BRAKE": "Parking brake",
  STRUCTURE: "Body and frame",
  VISIBILITY: "Windows, wipers and mirrors",
  "VISIBILITY/WIPER": "Windows, wipers and mirrors",
  "UNKNOWN OR OTHER": "Other",
  ENGINE: "Engine",
  "ENGINE AND ENGINE COOLING": "Engine",
  "FUEL/PROPULSION SYSTEM": "Fuel system",
  "FUEL SYSTEM, GASOLINE": "Fuel system",
  "FUEL SYSTEM, DIESEL": "Fuel system",
  "FUEL SYSTEM, OTHER": "Fuel system",
  "HYBRID PROPULSION SYSTEM": "Hybrid system",
  "AIR BAGS": "Air bags",
  "SEAT BELTS": "Seat belts",
  SEATS: "Seats",
  "CHILD SEAT": "Child seat",
  STEERING: "Steering",
  SUSPENSION: "Suspension",
  WHEELS: "Wheels",
  TIRES: "Tires",
  "EXTERIOR LIGHTING": "Lights",
  "LATCHES/LOCKS/LINKAGES": "Door latches and locks",
  "VEHICLE SPEED CONTROL": "Gas pedal and cruise control",
  "FORWARD COLLISION AVOIDANCE": "Automatic emergency braking",
  "LANE DEPARTURE": "Lane keeping",
  "BACK OVER PREVENTION": "Backup camera",
  "ELECTRONIC STABILITY CONTROL (ESC)": "Stability control",
  "ELECTRONIC STABILITY CONTROL": "Stability control",
  "TRACTION CONTROL SYSTEM": "Traction control",
  EQUIPMENT: "Accessories",
  "EQUIPMENT ADAPTIVE/AUXILIARY": "Accessories",
  COMMUNICATION: "Emergency call system",
  "TRAILER HITCHES": "Trailer hitch",
};

/** A complaint's part as a group people recognize: "POWER TRAIN" -> "Transmission and drivetrain". */
export function complaintArea(part: string): string {
  const key = part.trim().toUpperCase();
  return COMPLAINT_AREAS[key] ?? COMPLAINT_AREAS[key.split(":")[0]] ?? titleCase(part.trim());
}

/** The part a recall's last component level names, when it is one people know. */
const RECALL_PARTS: [RegExp, string][] = [
  [/FUEL PUMP/, "Fuel pump"],
  [/SPARE TIRE/, "Spare tire"],
  [/INFLATOR/, "Air bag inflator"],
  [/CAMERA|REARVIEW|BACK ?UP/, "Backup camera"],
  [/ACCELERATOR/, "Gas pedal"],
  [/BATTERY/, "Battery"],
  [/FUEL TANK/, "Fuel tank"],
  [/FUEL INJECT/, "Fuel injectors"],
  [/FUEL (LINE|HOSE)/, "Fuel line"],
  [/SEAT ?BELT|BUCKLE|RETRACTOR|PRETENSIONER/, "Seat belts"],
  [/WIPER/, "Wipers"],
  [/HEADL(IGHT|AMP)/, "Headlights"],
  [/TAIL ?L(IGHT|AMP)|STOP ?L(IGHT|AMP)|BRAKE L(IGHT|AMP)/, "Brake lights"],
  [/WINDSHIELD/, "Windshield"],
  [/STEERING (COLUMN|WHEEL)/, "Steering"],
  [/TIE ROD/, "Steering"],
  [/BALL JOINT|CONTROL ARM/, "Suspension"],
  [/AXLE|DRIVE ?SHAFT|PROPELLER SHAFT/, "Axle"],
  [/PARKING BRAKE/, "Parking brake"],
  [/BRAKE/, "Brakes"],
  [/TRANSMISSION/, "Transmission"],
  [/SUNROOF|MOONROOF/, "Sunroof"],
  [/ROOF RAIL|ROOF RACK|CROSS ?BAR/, "Roof rack"],
  [/DOOR/, "Doors"],
  [/HOOD/, "Hood latch"],
  [/MIRROR/, "Mirrors"],
  [/WHEEL|LUG NUT/, "Wheels"],
  [/TIRE/, "Tires"],
];

/** A recall's whole component, in plain words: "SERVICE BRAKES" -> "Brakes". */
const RECALL_AREAS: Record<string, string> = {
  ...COMPLAINT_AREAS,
  "POWER TRAIN": "Transmission",
  "ELECTRICAL SYSTEM": "Electrical system",
  EQUIPMENT: "Accessory",
  "EQUIPMENT ADAPTIVE/AUXILIARY": "Accessory",
  STRUCTURE: "Body or frame",
  VISIBILITY: "Windows, wipers or mirrors",
  "VISIBILITY/WIPER": "Wipers",
  "UNKNOWN OR OTHER": "Other part",
  "VEHICLE SPEED CONTROL": "Gas pedal or cruise control",
  "LATCHES/LOCKS/LINKAGES": "Door latches or locks",
  WHEELS: "Wheels",
};

/**
 * What a recall is about, from its component: the last level when it names
 * a part people know ("FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP" -> "Fuel
 * pump", "TIRES:TEMPORARY/EMERGENCY SPARE TIRE" -> "Spare tire"), else the
 * whole component ("POWER TRAIN" -> "Transmission", "EQUIPMENT" ->
 * "Accessory"). Without AI, this is the recall's headline.
 */
export function recallPart(component: string | null): string {
  const levels = (component ?? "")
    .toUpperCase()
    .split(":")
    .map((l) => l.trim())
    .filter(Boolean);
  if (levels.length === 0) return "Recall";
  const last = levels[levels.length - 1];
  if (levels.length > 1) {
    const known = RECALL_PARTS.find(([re]) => re.test(last));
    if (known) return known[1];
  }
  const area = RECALL_AREAS[levels[0]];
  if (area) return area;
  const known = RECALL_PARTS.find(([re]) => re.test(levels[0]));
  if (known) return known[1];
  const first = titleCase(levels[0]);
  return first.charAt(0) + first.slice(1).toLowerCase();
}
