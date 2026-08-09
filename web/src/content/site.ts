import type { MarketCode } from "@/lib/market";

/**
 * Editorial content, per market.
 *
 * Everything here is either the owner's own words carried over from the legacy
 * site, or plainly factual. Nothing is invented — in particular there are no
 * advertised rates or approval odds anywhere in this file, because the business
 * has not supplied its finance products and inventing them would be both
 * dishonest and, in the US market, a regulatory problem.
 */

export interface Step {
  title: string;
  body: string;
}

export interface Requirement {
  title: string;
  body: string;
}

/* ── About ─────────────────────────────────────────────────────────────── */

/** The founder's own story, carried over verbatim from the legacy about page. */
export const FOUNDER_STORY: string[] = [
  "Adedayo Aremu is an entrepreneur driven by vision, discipline, and an unwavering commitment to excellence. With a strong foundation in business development and a passion for the automotive industry, he has built his professional identity around integrity, strategic growth, and customer-centered service.",
  "From an early stage, Adedayo demonstrated a natural inclination toward commerce and enterprise. His understanding of value creation, branding, and market positioning shaped his entrepreneurial journey and laid the groundwork for his ventures. Over time, he refined his focus toward the automotive sector, recognising both its economic potential and its role in empowering mobility, independence, and opportunity.",
  "As the founder of Adedayo Aremu Autos, he has positioned his brand to reflect professionalism, reliability, and premium service standards. His business philosophy emphasises transparency, quality assurance, and long-term client relationships. Rather than simply facilitating vehicle transactions, he prioritises delivering tailored automotive solutions that align with customer needs and financial goals.",
  "Adedayo's leadership style is strategic and growth-oriented. He believes in continuous improvement, leveraging digital platforms, market analytics, and customer insights to enhance operational efficiency and brand visibility. His approach integrates traditional business principles with modern innovation, ensuring adaptability in an evolving marketplace.",
  "Beyond business, Adedayo values personal development, financial literacy, and community impact. He views entrepreneurship not merely as a means of income generation, but as a platform for influence, mentorship, and sustainable wealth creation.",
  "Grounded in discipline and guided by ambition, Adedayo Aremu continues to build a legacy defined by professionalism, resilience, and purposeful leadership.",
];

export const MISSION =
  "To deliver reliable and premium automotive solutions through transparent business practices, quality vehicle sourcing, competitive pricing, and exceptional customer service. Guided by integrity, operational excellence, and faith-driven values, Adedayo Aremu Autos is committed to creating lasting value for customers while building a high-performance automotive enterprise.";

export const VISION =
  "To establish Adedayo Aremu Autos as a trusted and distinguished automotive brand recognised for integrity, professionalism, and customer satisfaction, while expanding into a scalable multi-location dealership known for quality inventory, strong market presence, and positive community impact.";

export const VALUES: { title: string; body: string }[] = [
  { title: "Integrity", body: "Honest dealings and transparent communication, on every vehicle and every figure." },
  { title: "Excellence", body: "Premium quality in every vehicle we put our name to." },
  { title: "Trust", body: "Long-term client relationships rather than one-off transactions." },
  { title: "Innovation", body: "Modern systems that make buying, hiring and financing straightforward." },
];

/* ── Financing ─────────────────────────────────────────────────────────── */

export const FINANCE_STEPS: Step[] = [
  {
    title: "Apply",
    body: "Send us your details and the vehicle you have in mind. It takes a couple of minutes and costs nothing.",
  },
  {
    title: "Get a decision",
    body: "We review your application and come back to you — usually within one working day — with what we can offer.",
  },
  {
    title: "Drive",
    body: "Agree the figures, complete the paperwork, and collect the vehicle.",
  },
];

/**
 * Eligibility differs genuinely by market.
 *
 * The Nigerian list is the owner's own, carried over from the legacy site
 * including the 30% deposit policy. The US list deliberately states no deposit
 * percentage and no credit threshold, because the business has not given us
 * those figures and publishing a number we invented would be a claim we cannot
 * stand behind.
 */
export const ELIGIBILITY: Record<MarketCode, Requirement[]> = {
  us: [
    { title: "Valid driver's licence", body: "A current, unexpired US driver's licence." },
    { title: "Proof of income", body: "Recent pay stubs or bank statements covering the last three months." },
    { title: "Proof of address", body: "A utility bill or lease agreement in your name." },
    { title: "Down payment", body: "Discussed with you on application and based on the vehicle and terms agreed." },
    { title: "Contact details", body: "A working phone number and email address." },
  ],
  ng: [
    { title: "Valid ID", body: "Driver's licence, international passport, or national ID." },
    { title: "Proof of income", body: "Last three months of payslips or bank statements." },
    { title: "Bank verification", body: "A valid BVN (Bank Verification Number)." },
    { title: "Down payment", body: "Minimum 30% of the vehicle value." },
    { title: "Proof of residence", body: "A utility bill or tenancy agreement." },
    { title: "Contact details", body: "An active phone number and email address." },
  ],
};

/** Shown wherever financing is discussed. Not legal advice; reviewed content. */
export const FINANCE_NOTE: Record<MarketCode, string> = {
  us: "Figures produced by the calculator are estimates for your own planning. They are not an offer of credit, a pre-approval, or a commitment to lend. Actual terms depend on your circumstances and are confirmed in writing before anything is signed.",
  ng: "Figures produced by the calculator are estimates for your own planning. Final terms, deposit and instalment amounts are confirmed in writing before anything is signed.",
};

export const WHY_US: Record<MarketCode, { title: string; body: string }[]> = {
  us: [
    { title: "Inspected before listing", body: "Every vehicle is checked over before it goes on the site." },
    { title: "Transparent history", body: "We provide the vehicle history report so you can see what we see." },
    { title: "Financing decided in-house", body: "You deal with us directly rather than being passed around." },
    { title: "Serving the Triad", body: "Based in Greensboro and dealing locally, face to face." },
    { title: "Clear figures", body: "Price, fees, tax and monthly payment set out in full before you commit." },
    { title: "After the sale", body: "We stay reachable once you have driven away." },
  ],
  ng: [
    { title: "Verified vehicles", body: "Every vehicle is inspected before it is listed." },
    { title: "Documentation handled", body: "Customs papers and transfer of ownership sorted for you." },
    { title: "Flexible instalments", body: "Payment plans arranged in-house over terms that suit you." },
    { title: "Nationwide delivery", body: "We arrange delivery anywhere in the country." },
    { title: "Clear figures", body: "Price, deposit and instalments set out in full before you commit." },
    { title: "After the sale", body: "We stay reachable once you have driven away." },
  ],
};
