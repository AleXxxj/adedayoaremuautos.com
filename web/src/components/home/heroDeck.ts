/**
 * The order of the home hero's slides.
 *
 * Pure, with no React and no database: the server page builds the list and
 * the client slideshow (HeroSlides.tsx) plays it; scripts/verify-home.ts
 * checks it.
 */

export interface HeroSlide {
  /**
   * "car": a car for sale, behind the hero's standing words.
   * "own": the rent-to-own message, over a photo of a car from the rental
   * fleet.
   */
  kind: "car" | "own";
  src: string;
  /** The car in the photo: "2016 Hyundai Elantra SE". */
  name: string;
  /**
   * Said after the name: the price of a car for sale ("$9,500"), "for rent"
   * for a rental car, or null when there is nothing to add. A rental car on
   * a rent-to-own slide carries no price: rent to own is priced by category,
   * not by the car in the photo.
   */
  note: string | null;
  /** The car's own page. */
  href: string;
}

/** After how many cars for sale a rent-to-own slide is shown. */
export const OWN_AFTER = 2;

/**
 * The cars for sale in their order, with one rent-to-own slide after every
 * second car: car, car, own, car, car, own…
 *
 * The rent-to-own photos are used in turn and start again when they run
 * out. With no such photo, or fewer cars than a pair, it is the cars alone.
 */
export function heroDeck(cars: HeroSlide[], own: HeroSlide[], after = OWN_AFTER): HeroSlide[] {
  if (own.length === 0 || after < 1) return cars;
  const deck: HeroSlide[] = [];
  let used = 0;
  cars.forEach((car, i) => {
    deck.push(car);
    if ((i + 1) % after === 0) deck.push(own[used++ % own.length]);
  });
  return deck;
}
