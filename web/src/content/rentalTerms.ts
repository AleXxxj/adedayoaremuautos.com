/**
 * The rental terms, as written by the business.
 *
 * Lifted from the agreement the founder drew up, not composed here. This file
 * is the only copy: the booking form shows these clauses and asks the customer
 * to accept them, and the agreement printed at handover renders the same list.
 * Two copies of a contract in two files is how a business ends up enforcing
 * wording its customer never saw.
 *
 * VERSION is stamped onto every booking at the moment of acceptance. Terms
 * change; the question months later is never "what do the terms say" but "what
 * did this customer agree to", and only a recorded version can answer it. Bump
 * it whenever a clause below changes in substance.
 */
export const RENTAL_TERMS_VERSION = "2026-10-v5";

export interface RentalClause {
  heading: string;
  /** Written with {vehicle} and {use} where the booking supplies the detail. */
  body: string;
}

export const RENTAL_CLAUSES: RentalClause[] = [
  {
    heading: "Authorized Use",
    body:
      "Renter may operate {vehicle} only for lawful purposes during the rental period. Authorized use: {use}. If used for DoorDash or other delivery work, Renter is responsible for maintaining all insurance, platform approvals, permits, and coverage required for that activity. No racing, towing, off-road use, illegal activity, or prohibited use.",
  },
  {
    heading: "Authorized Driver",
    body:
      "Only the Renter and any additional driver approved in writing by Owner may operate the vehicle. Renter may not lend, sub-rent, or transfer possession.",
  },
  {
    heading: "Payment",
    body:
      "Rental charges and the security deposit are due as agreed before or at pickup unless Owner gives written approval otherwise. The deposit may be applied to unpaid charges, cleaning, fuel, tolls, tickets, damage, or other amounts for which Renter is responsible.",
  },
  {
    heading: "Insurance and Licensing",
    body:
      "Renter must provide, before the vehicle is released, a valid driver’s license and proof of insurance that covers Renter to operate the vehicle for the intended use. Renter understands that personal auto insurance may exclude delivery, rideshare, commercial, rental, or business use and must confirm coverage before operating the vehicle. Owner will verify both documents and may refuse release if they are missing, expired, or do not match the person picking up the vehicle.",
  },
  {
    heading: "Injury to the Renter — Important",
    body:
      "THE VEHICLE IS INSURED. THE RENTER IS NOT. Owner maintains insurance on the vehicle itself, which covers the vehicle if it is involved in an accident. That insurance does NOT cover bodily injury to Renter or to Renter’s passengers. If Renter is injured while driving or riding in the vehicle, Renter’s own insurance, health insurance, or personal funds are responsible for their medical bills, and Owner’s policy will not pay them. Renter confirms this has been disclosed before booking and accepts it. Owner is not an insurance company and does not sell insurance. Where Owner offers it, and Renter has elected and paid for it, Owner will arrange through its licensed insurance company for Renter to be added as a driver on Owner's policy for the rental period; that coverage is provided by the insurer on the terms of its policy. The fee is set by the insurer, charged per day, quoted before booking, and not refundable once the rental has begun.",
  },
  {
    heading: "Vehicle Condition",
    body:
      "Renter accepts the vehicle in its condition at pickup, subject to the inspection record and photographs. Renter must return it in substantially the same condition, ordinary wear and tear excepted.",
  },
  {
    heading: "Mileage, Fuel, Tolls and Tickets",
    body:
      "Renter receives the mileage allowance stated on the agreement. Additional mileage is charged at the excess rate stated on the agreement. Renter is responsible for fuel, parking, tolls, citations, towing, impound fees, and other charges arising from Renter’s use.",
  },
  {
    heading: "Maintenance and Mechanical Problems",
    body:
      "Renter must promptly notify Owner of warning lights, mechanical problems, accidents, or unsafe conditions. Major repairs require Owner’s prior approval except in an immediate safety emergency.",
  },
  {
    heading: "Accidents and Damage",
    body:
      "Renter must immediately report accidents, theft, vandalism, or significant damage to Owner and law enforcement when required, cooperate with insurance claims, and provide truthful information. Renter is responsible for loss or damage caused by negligence, misuse, unauthorized drivers, prohibited use, or breach of this Agreement, subject to applicable law and insurance.",
  },
  {
    heading: "Return of Vehicle",
    body:
      "The vehicle must be returned by the agreed date and time with the agreed fuel level and all keys, documents, and equipment. Unauthorized late return may result in additional charges.",
  },
  {
    heading: "No Guarantee of Earnings",
    body:
      "Owner makes no guarantee regarding earnings from DoorDash, delivery services, rideshare, or other gig work.",
  },
  {
    heading: "Termination",
    body:
      "Owner may terminate the rental and require return of the vehicle for material breach, nonpayment, loss of required licensing or insurance, false information, unlawful use, or unreasonable risk of loss or damage, subject to applicable law.",
  },
  {
    heading: "Governing Law",
    body:
      "This Agreement is intended to be governed by applicable {law} law, except where another rule is required by law. Unenforceable provisions will be limited or severed as necessary.",
  },
];

/**
 * Fills the placeholders.
 *
 * On the booking form the vehicle and use are not settled yet, so the generic
 * wording stands in — the customer is accepting the terms, not signing for a
 * particular car. On the printed agreement the real values are supplied.
 */
export function fillClause(
  body: string,
  values: { vehicle?: string; use?: string; law?: string },
): string {
  return body
    .replace("{vehicle}", values.vehicle ?? "the vehicle")
    .replace("{use}", values.use ?? "as agreed with Owner")
    .replace("{law}", values.law ?? "the applicable");
}

/** Numbered, as they appear on the agreement. */
export function numberedClauses(values: {
  vehicle?: string;
  use?: string;
  law?: string;
}): { n: number; heading: string; body: string }[] {
  return RENTAL_CLAUSES.map((c, i) => ({
    n: i + 1,
    heading: c.heading,
    body: fillClause(c.body, values),
  }));
}
