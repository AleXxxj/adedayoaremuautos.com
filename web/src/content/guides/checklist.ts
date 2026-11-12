/**
 * The used-car checklist: five parts of a car, a handful of checks in each.
 *
 * Every check is written so that "Good" is the answer you hope for, and its
 * hint says what a problem looks like. Only checks that are true of cars in
 * general and safe to do in a parking lot: nothing that needs a tool, a jack
 * or a hot engine opened.
 *
 * Nothing here is legal advice, and nothing is about North Carolina law,
 * titles or inspections, beyond asking to see the title and matching its VIN
 * to the car. Where a fact is an agency's, the check names the agency:
 *
 *   NHTSA  a tire is worn out at 2/32 of an inch of tread, and the penny
 *          test for it; the VIN is at the lower left of the windshield;
 *          safety recalls are listed by VIN.
 *   FTC    dealers must post a Buyers Guide on used cars (the Used Car Rule).
 *
 * The ids are stored in the visitor's browser with their answers, so a check
 * can be reworded freely but its id should stay.
 */

export interface Check {
  id: string;
  /** What you hope to find. */
  label: string;
  /** How to look, and what a problem looks like. */
  hint: string;
  /** The agency a fact in the hint comes from. */
  source?: "NHTSA" | "FTC";
  link?: { href: string; label: string };
}

export interface CheckGroup {
  id: string;
  title: string;
  icon: string;
  checks: Check[];
}

export const CHECKLIST: CheckGroup[] = [
  {
    id: "outside",
    title: "Outside",
    icon: "fa-car-side",
    checks: [
      {
        id: "out-panels",
        label: "Panels line up and the paint matches",
        hint: "Uneven gaps, or a door in a slightly different shade, can mean body repair. Ask what was fixed.",
      },
      {
        id: "out-rust",
        label: "No rust bubbles",
        hint: "Look at the wheel arches, the bottoms of the doors and under the trunk lid.",
      },
      {
        id: "out-tires",
        label: "Tires have tread and wear evenly",
        hint: "NHTSA says a tire is worn out at 2/32 of an inch of tread. Put a penny in the tread with Lincoln's head down. If you can see the top of his head, the tire needs replacing.",
        source: "NHTSA",
      },
      {
        id: "out-glass",
        label: "No cracks in the windshield",
        hint: "A chip can spread. Look from inside and from outside.",
      },
      {
        id: "out-lights",
        label: "Every light works",
        hint: "Headlights, brake lights, turn signals and reverse lights. Ask someone to stand behind the car.",
      },
    ],
  },
  {
    id: "inside",
    title: "Inside",
    icon: "fa-couch",
    checks: [
      {
        id: "in-warning",
        label: "Warning lights go out after the engine starts",
        hint: "They light up with the key, then go out. A check-engine, airbag or ABS light that stays on needs an answer.",
      },
      {
        id: "in-climate",
        label: "The A/C blows cold and the heat blows hot",
        hint: "Run each one for a few minutes.",
      },
      {
        id: "in-electrics",
        label: "Windows, locks, wipers and horn work",
        hint: "Try every window and every door lock.",
      },
      {
        id: "in-belts",
        label: "Every seat belt latches and pulls back",
        hint: "Pull each one all the way out and let it go.",
      },
      {
        id: "in-damp",
        label: "No damp carpet or musty smell",
        hint: "Press on the carpet and look in the trunk. Damp can mean a leak.",
      },
      {
        id: "in-odometer",
        label: "The miles match the listing",
        hint: "Read the odometer and compare it with the ad.",
      },
    ],
  },
  {
    id: "hood",
    title: "Under the hood",
    icon: "fa-gears",
    checks: [
      {
        id: "hood-oil",
        label: "Oil is between the marks on the dipstick",
        hint: "Pull the dipstick, wipe it, dip it again and read it. Milky or gritty oil is a problem.",
      },
      {
        id: "hood-coolant",
        label: "Coolant is between the marks on the tank",
        hint: "Read the level through the side of the plastic tank. Never open the cap on a hot engine.",
      },
      {
        id: "hood-belts",
        label: "Belts and hoses have no cracks",
        hint: "Look for cracks, fraying or bulges.",
      },
      {
        id: "hood-battery",
        label: "Battery terminals are clean",
        hint: "A heavy white or green crust is corrosion.",
      },
      {
        id: "hood-leaks",
        label: "No fresh drips under the car",
        hint: "Look at the ground where it was parked, and at the bottom of the engine.",
      },
    ],
  },
  {
    id: "paperwork",
    title: "Paperwork",
    icon: "fa-file-lines",
    checks: [
      {
        id: "paper-title",
        label: "The VIN on the title matches the car",
        hint: "Ask to see the title and match the VIN on it to the car.",
      },
      {
        id: "paper-vin",
        label: "The VIN is the same everywhere on the car",
        hint: "NHTSA says to look for the 17-character VIN at the lower left of the windshield. Compare it with the sticker in the driver's door opening.",
        source: "NHTSA",
      },
      {
        id: "paper-recalls",
        label: "You checked the VIN for recalls",
        hint: "NHTSA lists safety recalls by VIN. Our free car check shows the recalls for the car's model. Ask the seller for proof they were fixed.",
        source: "NHTSA",
        link: { href: "/us/check", label: "Check a VIN free" },
      },
      {
        id: "paper-records",
        label: "There are service records",
        hint: "Oil changes and repairs, with dates and miles.",
      },
      {
        id: "paper-buyers-guide",
        label: "You read the Buyers Guide on the window",
        hint: "At a dealer, the FTC requires a Buyers Guide on every used car. It says whether the car is sold as is or with a warranty.",
        source: "FTC",
      },
    ],
  },
  {
    id: "drive",
    title: "Test drive",
    icon: "fa-road",
    checks: [
      {
        id: "drive-start",
        label: "Starts right away and idles smoothly",
        hint: "A cold start tells you the most. Ask the seller not to warm the car up first.",
      },
      {
        id: "drive-brakes",
        label: "Brakes stop the car straight and quietly",
        hint: "No grinding, no pulling to one side, and a firm pedal.",
      },
      {
        id: "drive-steering",
        label: "Drives straight with no shaking",
        hint: "On a flat, straight road the car should not pull, and the wheel should not shake.",
      },
      {
        id: "drive-shifts",
        label: "Shifts smoothly",
        hint: "No slipping and no hard clunks between gears.",
      },
      {
        id: "drive-noises",
        label: "No knocks, squeals or rattles",
        hint: "Turn the radio off and drive over a few bumps.",
      },
    ],
  },
];

/** Every check, in order. */
export const ALL_CHECKS = CHECKLIST.flatMap((g) => g.checks);

/** The checks done standing still: everything but the test drive. */
export const WALK_AROUND_CHECKS = CHECKLIST.filter((g) => g.id !== "drive").flatMap((g) => g.checks);
