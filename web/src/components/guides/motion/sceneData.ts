/**
 * What each guide's scene shows, worked out from today's stock.
 *
 * A scene is the moving picture at the top of a guide. It is decoration with
 * a rule: every figure in it is one the guide's own tool would show, from the
 * same functions (quoteRental through guideMath, threeWay, budgetBucket), and
 * every car in it is a real car in stock. The line under the scene says the
 * same thing in words, so nothing is told by motion alone.
 *
 * No React here: plain data for the client, small enough to send (names,
 * photos, prices, and a few positions), and checked by the build against
 * fixed stock (scripts/verify-guides.ts).
 */
import { STORY_STEPS, storyCars } from "@/content/guides/cheapCar";
import { CHECKLIST } from "@/content/guides/checklist";
import { cash, carsLabel, count } from "@/content/guides/format";
import { LIFE_QUESTIONS } from "@/content/guides/lifeQuiz";
import { RECALL_FACTS } from "@/content/guides/recallQuiz";
import { TRIP_PLACES } from "@/content/guides/roadTrip";
import type { GuideData, ToolKey } from "@/content/guides/types";
import { priceEligible } from "../gameMath";
import { BUDGETS_MAJOR, LENGTHS, budgetBucket, cheapestRental, costForDays, lowestOwnTier, type Way } from "../guideMath";
import { threeWay } from "../threeWay";
import { barScales, boundsOf, project, storyStops, type Point } from "./sceneMath";

export interface SceneCar {
  name: string;
  image: string;
}

/** A week, a day at a time, for the lowest-cost car that week. */
export interface WeekScene {
  tool: "weeks";
  car: SceneCar;
  /** What 1, 2 … 7 days cost; null where the car isn't rented that briefly. */
  days: (number | null)[];
  caption: string;
}

export interface LaneFigures {
  key: string;
  label: string;
  /** Rent, buy, rent to own: the tool's own three figures, in minor units. */
  values: Record<Way, number | null>;
  lowest: Way[];
}

export interface LanesScene {
  tool: "three-way";
  /** The length the tool opens on. */
  start: string;
  lengths: LaneFigures[];
  caption: string;
}

export interface BudgetScene {
  tool: "budget";
  /** The budget the tool opens on, in whole dollars. */
  start: number;
  budgets: { major: number; count: number }[];
  /** A row of cars from stock, lowest price first. */
  cars: (SceneCar & { priceMinor: number })[];
  caption: string;
}

export interface SpotsScene {
  tool: "checklist";
  photo: string | null;
  spots: { id: string; title: string; icon: string; checks: number }[];
  caption: string;
}

export interface DealScene {
  tool: "life-quiz";
  cards: { icon: string; ask: string; car: SceneCar | null }[];
  caption: string;
}

export interface TagScene {
  tool: "price-game";
  car: SceneCar & { priceMinor: number };
  caption: string;
}

export interface YearScene {
  tool: "cost-story";
  cheap: (SceneCar & { priceMinor: number }) | null;
  pricier: (SceneCar & { priceMinor: number }) | null;
  /** Each moment of the story and where it sits along the year, 0 to 1. */
  stops: { when: string; at: number }[];
  caption: string;
}

export interface StampScene {
  tool: "recall-quiz";
  caption: string;
}

export interface MapScene {
  tool: "road-trip";
  home: Point;
  places: { id: string; name: string; miles: number; at: Point }[];
  /** The place the scene opens on. */
  start: string;
  car: SceneCar | null;
  caption: string;
}

export type Scene =
  | WeekScene
  | LanesScene
  | BudgetScene
  | SpotsScene
  | DealScene
  | TagScene
  | YearScene
  | StampScene
  | MapScene;

/* ── Where the road trips are ──────────────────────────────────────────── */

/** Greensboro, NC. */
export const HOME_COORDS = { lat: 36.0726, lng: -79.792 };

/**
 * Where each destination is, for drawing only (the miles a visitor reads are
 * the routed road miles in content/guides/roadTrip.ts). The build checks
 * every place has a position, and that the straight line to it is shorter
 * than the road and not absurdly so.
 */
export const PLACE_COORDS: Record<string, { lat: number; lng: number }> = {
  "hanging-rock": { lat: 36.3916, lng: -80.2664 },
  raleigh: { lat: 35.7796, lng: -78.6382 },
  charlotte: { lat: 35.2271, lng: -80.8431 },
  boone: { lat: 36.2168, lng: -81.6746 },
  asheville: { lat: 35.5951, lng: -82.5515 },
  "myrtle-beach": { lat: 33.6891, lng: -78.8867 },
  wilmington: { lat: 34.2257, lng: -77.9447 },
  "washington-dc": { lat: 38.9072, lng: -77.0369 },
};

/* ── One scene per guide ───────────────────────────────────────────────── */

const withPhoto = <T extends { image: string | null }>(cars: T[]) =>
  cars.filter((c): c is T & { image: string } => c.image != null);

/** The scene for a guide's tool, or null where stock has nothing to show in it. */
export function sceneFor(tool: ToolKey, data: GuideData, photo: string | null): Scene | null {
  switch (tool) {
    case "weeks": {
      // The car with the lowest week, as long as it has a photo to show.
      const pick = cheapestRental(withPhoto(data.rent), 7);
      if (!pick) return null;
      const days = Array.from({ length: 7 }, (_, i) => costForDays(pick.car.tariff, i + 1)?.rentMinor ?? null);
      const first = days.findIndex((d) => d != null);
      return {
        tool,
        car: { name: pick.car.name, image: pick.car.image },
        days,
        caption:
          first >= 0 && first < 6
            ? `${pick.car.name}: ${cash(data, days[first]!)} for ${first + 1} ${first === 0 ? "day" : "days"}, ${cash(data, pick.cost.rentMinor)} for 7 days.`
            : `${pick.car.name}: ${cash(data, pick.cost.rentMinor)} for 7 days.`,
      };
    }

    case "three-way": {
      const input = {
        rent: data.rent,
        buyLowestMinor: data.sale.length ? Math.min(...data.sale.map((c) => c.priceMinor)) : null,
        tier: lowestOwnTier(data.tiers),
      };
      const lengths = LENGTHS.map((l) => {
        const f = threeWay(input, l.days);
        return {
          key: l.key,
          label: l.label,
          values: { rent: f.rent?.cost.rentMinor ?? null, buy: f.buyMinor, own: f.own?.paidMinor ?? null },
          lowest: f.lowest,
        };
      });
      if (lengths.every((l) => Object.values(l.values).every((v) => v == null))) return null;
      return {
        tool,
        // The tool opens on 3 months.
        start: "3m",
        lengths,
        caption: "Rent, buy, rent to own: today's totals for the length you pick below.",
      };
    }

    case "budget": {
      const budgets = BUDGETS_MAJOR.map((major) => ({ major, count: budgetBucket(data.sale, major * 100).count }));
      const cars = withPhoto(data.sale)
        .slice(0, 6)
        .map((c) => ({ name: c.name, image: c.image, priceMinor: c.priceMinor }));
      if (cars.length === 0) return null;
      const start = (budgets.find((b) => b.count > 0) ?? budgets[0]).major;
      return {
        tool,
        start,
        budgets,
        cars,
        caption: budgets.map((b) => `${cash(data, b.major * 100)}: ${carsLabel(b.count)}`).join(" · ") + " in our stock today.",
      };
    }

    case "checklist": {
      const spots = CHECKLIST.map((g) => ({ id: g.id, title: g.title, icon: g.icon, checks: g.checks.length }));
      const total = spots.reduce((n, s) => n + s.checks, 0);
      return {
        tool,
        photo,
        spots,
        caption: `${total} checks in ${spots.length} parts: ${spots.map((s) => s.title.toLowerCase()).join(", ")}.`,
      };
    }

    case "life-quiz": {
      // Three cars of different kinds where stock has them, so the cards differ.
      const pool = withPhoto([...data.sale, ...data.rent]);
      const picked: typeof pool = [];
      for (const c of pool) if (picked.length < 3 && !picked.some((p) => p.body === c.body)) picked.push(c);
      for (const c of pool) if (picked.length < 3 && !picked.includes(c)) picked.push(c);
      return {
        tool,
        cards: LIFE_QUESTIONS.slice(0, 3).map((q, i) => ({
          icon: q.options[0].icon,
          ask: q.ask,
          car: picked[i] ? { name: picked[i].name, image: picked[i].image } : null,
        })),
        caption: `${LIFE_QUESTIONS.length} taps, then real cars from our stock that fit.`,
      };
    }

    case "price-game": {
      const cars = withPhoto(priceEligible(data.sale));
      // The middle car: neither the bargain nor the showpiece.
      const car = cars[Math.floor(cars.length / 2)];
      if (!car) return null;
      return {
        tool,
        car: { name: car.name, image: car.image, priceMinor: car.priceMinor },
        caption: `${car.name}: listed at ${cash(data, car.priceMinor)} today. Guess the rest below.`,
      };
    }

    case "cost-story": {
      const pair = storyCars(data.sale);
      const slim = (c: (typeof data.sale)[number]) =>
        c.image ? { name: c.name, image: c.image, priceMinor: c.priceMinor } : null;
      const at = storyStops(STORY_STEPS.map((s) => s.when));
      return {
        tool,
        cheap: pair ? slim(pair.cheap) : null,
        pricier: pair ? slim(pair.pricier) : null,
        stops: STORY_STEPS.map((s, i) => ({ when: s.when, at: at[i] })),
        caption: `${STORY_STEPS.length} choices across 12 months. The car moves as you make them.`,
      };
    }

    case "recall-quiz": {
      const free = RECALL_FACTS.find((f) => f.id === "free");
      return { tool, caption: free ? free.why : "Safety recalls, card by card." };
    }

    case "road-trip": {
      const known = TRIP_PLACES.filter((p) => PLACE_COORDS[p.id]);
      if (known.length === 0) return null;
      const bounds = boundsOf([HOME_COORDS, ...known.map((p) => PLACE_COORDS[p.id])]);
      const car = withPhoto(data.rent)[0] ?? null;
      const far = known[known.length - 1];
      return {
        tool,
        home: project(HOME_COORDS, bounds),
        places: known.map((p) => ({ id: p.id, name: p.name, miles: p.miles, at: project(PLACE_COORDS[p.id], bounds) })),
        // A middle-distance trip: long enough to watch, short enough to be a day out.
        start: known[Math.floor(known.length / 2)].id,
        car: car ? { name: car.name, image: car.image } : null,
        caption: `${known.length} trips from Greensboro, from about ${count(data, known[0].miles)} to about ${count(data, far.miles)} miles one way.`,
      };
    }
  }
}

/**
 * The three bars on a guide's card: how the three ways compare at the length
 * the tool opens on. Real proportions, or null with nothing to compare.
 */
export function cardBars(scene: Scene | null): number[] | null {
  if (scene?.tool !== "three-way") return null;
  const l = scene.lengths.find((x) => x.key === scene.start) ?? scene.lengths[0];
  const bars = barScales([l.values.rent, l.values.buy, l.values.own]);
  return bars.some((b) => b > 0) ? bars : null;
}
