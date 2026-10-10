/**
 * The referral partner agreement.
 *
 * One source of truth, read by the partner before they accept and shown
 * unchanged in the admin afterwards. Two copies in two files is how a
 * business ends up enforcing wording its partner never saw — the same reason
 * the rental terms live in one place.
 *
 * Deliberately short and in plain words. A finder's fee arrangement does not
 * need the register of a mortgage, and a partner who cannot follow what they
 * are agreeing to is a dispute waiting to happen.
 *
 * NOT LEGAL ADVICE, and it says so to the business rather than to the
 * partner: before this is used for vehicle sales in the United States it
 * needs a North Carolina attorney's eye, because paying an unlicensed person
 * for soliciting vehicle sales is restricted in several states. Rentals are
 * where the programme starts for exactly that reason.
 */

export const PARTNER_TERMS_VERSION = "2026-10-v1";

export interface PartnerClause {
  heading: string;
  body: string;
}

export const PARTNER_CLAUSES: PartnerClause[] = [
  {
    heading: "What you do",
    body: "You introduce people to Adedayo Aremu Autos — for vehicle hire, and for buying a vehicle where we have told you in writing that sales are included. You do this as an independent person or business, not as our employee or agent. You cannot agree a price, accept money, or make a promise on our behalf.",
  },
  {
    heading: "How a referral is recorded",
    body: "A referral counts when the customer reaches us through your link or gives your code, and we can see it on our records. Your link records a customer for 90 days from the first time they use it. If two partners could claim the same customer, the earlier record stands.",
  },
  {
    heading: "What you are paid",
    body: "Commission is the percentage shown on your partner account, calculated on the amount the customer actually pays us, excluding taxes, refundable deposits and any third-party charges. It is earned only when that money has cleared and the hire or sale has completed.",
  },
  {
    heading: "When you are paid",
    body: "Earnings appear on your account as they are confirmed. You may request a payout at any time once you have earnings available, and we pay it on our next payment run. We do not hold your money as a balance on your behalf — the figure on your account is a record of what we owe you.",
  },
  {
    heading: "When commission is not due",
    body: "No commission is due on a booking or sale that is cancelled, refunded or charged back, on a customer who was already in discussion with us before your introduction, or on a transaction involving yourself, your household, or a business you control. If commission has already been paid on something that is later refunded, we may set it against future earnings.",
  },
  {
    heading: "How you may promote us",
    body: "Be truthful. Do not quote prices, availability or finance terms we have not published, do not describe yourself as our employee, branch or agent, and do not advertise using our name in paid search. No unsolicited bulk messaging of any kind — if a complaint is made about how you obtained a contact, we will suspend your account while we look into it.",
  },
  {
    heading: "Customer information",
    body: "Anything you learn about a customer through us is theirs, not yours. Do not sell it, publish it, or use it for anything other than the introduction. Tell people plainly that you are referring them to us.",
  },
  {
    heading: "Tax and your own affairs",
    body: "You are responsible for your own taxes on what you earn. Where the law requires it we will ask you for tax details before paying you, and may be obliged to report what we pay you to the tax authority.",
  },
  {
    heading: "Ending the arrangement",
    body: "Either of us may end this at any time, in writing, for any reason. Commission already earned on completed transactions is still paid. We may suspend an account immediately where we reasonably suspect misrepresentation or fraud.",
  },
  {
    heading: "Changes",
    body: "If we change these terms we will tell you and ask you to accept the new version. Until you do, the version you accepted continues to apply to referrals you have already made.",
  },
  {
    heading: "Governing law",
    body: "This agreement is governed by the law of {{law}}, and is subject to the courts there.",
  },
];

/** Fills the one placeholder, so a market's own law is named. */
export function fillPartnerClause(body: string, law: string): string {
  return body.replace(/\{\{law\}\}/g, law);
}

export function numberedPartnerClauses(law: string): {
  n: number;
  heading: string;
  body: string;
}[] {
  return PARTNER_CLAUSES.map((c, i) => ({
    n: i + 1,
    heading: c.heading,
    body: fillPartnerClause(c.body, law),
  }));
}
