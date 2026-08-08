# Legacy site — complete feature audit

Source: the 19 HTML files at the repo root, live at
`alexxxj.github.io/adedayoaremuautos.com`.

Purpose: enumerate **every** feature the old site presents to a visitor, judge
whether it is real or a façade, and define what "authentic" means for each in
the new platform. The brief is a dealership-grade operational system, not a
brochure with an inventory panel bolted on.

**Headline finding: of 12 forms on the site, 11 are dead. The twelfth lies.**

---

## 1. Critical — actively harmful, fix before anything else

### 1.1 The test-drive form fabricates a confirmation

`car-detail.html` — a submit handler that discards the data and tells the
customer they will be contacted:

```js
alert(`Thank you ${name}! We will contact you at ${phone} within 24 hours
       to schedule your test drive.`);
testDriveForm.reset();
```

No network request. No storage. The customer believes an appointment is coming
and waits. This is worse than a broken form, because a broken form at least
fails visibly.

### 1.2 SSN / BVN collected on a form that posts nowhere

`financing.html` collects, in a plain web form:

| Field | Sensitivity |
| --- | --- |
| `bvn_ssn` | **Bank Verification Number / Social Security Number** |
| `id_number` | National ID / Passport / Driver's Licence |
| `monthly_income` | Financial |
| `employment` | Financial |

…posting to `https://formspree.io/f/your-finance-form` — an unconfigured
placeholder.

Two separate problems:

1. Nothing is transmitted, so every application to date is lost.
2. **Had it worked, it would have been worse.** A US auto dealer that arranges
   financing is a "financial institution" under the Gramm-Leach-Bliley Act, and
   the FTC Safeguards Rule requires a written information-security programme,
   encryption of customer information, and access controls. Emailing an SSN to
   an inbox via a third-party form relay does not meet that bar.

**Do not reproduce this field.** See §5.2 for the correct pattern.

### 1.3 Every WhatsApp CTA points to a placeholder number

`wa.me/2348012345678` — hardcoded across the site and in `theme.js`. This is not
the business number. It powers:

- The floating "Chat Now" / "Chat with us" button on every page
- `bookRental()` — the **entire rental booking flow**
- `whatsappRental()` — rental enquiries

Rentals have no booking mechanism at all; the button opens a chat with a number
that is not yours.

### 1.4 Hardcoded exchange rates

```
NGN: 1        USD: 0.00065        GBP: 0.00052        EUR: 0.00060
```

`USD: 0.00065` implies ₦1,538 to the dollar, frozen in the markup. A Lagos
vehicle at ₦15,000,000 is presented to a US visitor as ~$9,750 — a price that is
neither current nor purchasable. This is the currency-switcher-as-fiction
problem, with the actual numbers attached.

### 1.5 Unsubstantiated claims

`50+ Vehicles Sold` · `100% Client Satisfaction` · `5+ Years Experience`

Owner has since confirmed the real figure is **15+**. In the US market,
advertising claims you cannot substantiate are a liability.

---

## 2. Complete feature inventory

Legend — **Real**: works as presented · **Façade**: looks functional, is not ·
**Static**: hardcoded content · **Done**: rebuilt authentically · **Todo**: not
yet built

### Global (theme.js + every page)

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 1 | Dark/light theme toggle | Real, localStorage | **Done** — token system, 50 contrast assertions gate the build |
| 2 | Currency switcher (NGN/USD/GBP/EUR) | **Façade** — frozen FX (§1.4) | **Replaced** — market switcher; disjoint inventories, no conversion |
| 3 | Geo-detection → country popup | Real (ipapi.co), with a blank-country bug `theme.js` patches | **Todo** — suggest a market, never force one; no third-party IP call |
| 4 | Floating WhatsApp button | **Façade** — fake number (§1.3) | **Todo** — real number, per-market, click tracked as a lead source |
| 5 | Mobile menu | Real | **Todo** — nav exists, mobile drawer not yet built |
| 6 | Footer: quick links, brands, currency | Real but duplicated ×19 | **Done** — one component, DB-driven locations |

### Homepage

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 7 | Hero + 3 CTAs | Static | **Done** — 3 directions built |
| 8 | Services: Buy / Rent / Finance | Static | **Done** |
| 9 | Featured vehicles (4) | Static array in markup | **Done** — DB-driven, `is_featured` flag exists |
| 10 | CEO section: photo, bio, stats | Static, unverified stats | **Partly** — stats now live (15+ plus recorded sales); bio/photo Todo |
| 11 | Referral programme, 1.5% | Static text only — **no tracking** | **Todo** — real referral codes, attribution, payout ledger (§5.4) |
| 12 | Automotive Insights (4 previews) | Static | **Todo** — needs a content model |
| 13 | Why Choose Us (6 items) | Static | **Done** — per-market, factual |
| 14 | Contact form | **Façade** — no action, no handler | **Done** — validated, persisted, alerting |

### Inventory (`cars.html`)

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 15 | Filters: brand, year, price, transmission, fuel | Real, client-side over 8 hardcoded cars | **Partly** — condition/make/price live and URL-driven; year/transmission/fuel Todo |
| 16 | Sort | Real, client-side | **Done** — 5 orders, server-side |
| 17 | Active filter chips + reset | Real | **Partly** — chips yes, "clear all" only in empty state |
| 18 | Pagination | Real | **Todo** — repository supports limit/offset, UI not built |
| 19 | Empty state | Real | **Done** — differentiates "no stock" from "no matches" |
| 20 | 8 vehicles | **Static** array in markup | **Done** — Postgres, admin CRUD, photo upload, audit log |

### Vehicle detail (`car-detail.html`)

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 21 | Image gallery: slides, prev/next, thumbnails | Real | **Partly** — thumbnails render; slider/keyboard Todo |
| 22 | Gallery autoplay + pause toggle | Real | **Todo** (low value; consider dropping) |
| 23 | Lightbox / modal | Real | **Todo** |
| 24 | Vehicle Overview | Static | **Done** |
| 25 | Technical Specifications | Static | **Done** — 11 fields, market-aware ID label |
| 26 | Features & Functions | Static | **Partly** — `features` jsonb column exists, no UI |
| 27 | Finance calculator (price/down/rate/term) | Real, client-side | **Done** — shared amortisation, per-market, TILA disclosure |
| 28 | Request Test Drive | **Façade — fabricates success (§1.1)** | **Done** — real lead, typed `test_drive` |
| 29 | "You May Also Like" | Static | **Todo** — needs a similarity query |
| 30 | Contact modal | Real (UI only) | **Todo** |

### Rentals (`rentals.html`)

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 31 | Daily / weekly / monthly rates + deposit | Static, 6 vehicles | **Schema done** (`rental_rates`), UI Todo |
| 32 | Filters: type, duration, price, transmission, sort | Real, client-side | **Todo** |
| 33 | "Book Rental" | **Façade** — WhatsApp to a fake number | **Todo** — real booking: availability calendar, DB-enforced no double-booking (already proven), deposit, agreement |
| 34 | Rental Policy section | Static | **Todo** — legal page exists, needs porting |

### Financing (`financing.html`)

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 35 | How It Works (Apply / Approved / Drive) | Static | **Todo** |
| 36 | Eligibility: 6 requirements | Static | **Todo** — should be per-market |
| 37 | Available plans | Static | **Todo** — needs real products from the business |
| 38 | Payment calculator | Real | **Done** |
| 39 | Application form incl. **SSN/BVN** | **Façade + unsafe (§1.2)** | **Partly** — `finance_applications` table with consent tracking and income *bands*; secure prequal flow Todo |

### About / Contact

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 40 | Founder's story, Mission, Vision, Values, Goals | Static | **Todo** |
| 41 | Contact cards: phone, WhatsApp, email, address, hours | Static, placeholder Lagos data | **Done** — real Greensboro data from DB |
| 42 | "Visit Our Showroom" | Static | **Partly** — Google Maps directions link live; embedded map Todo |
| 43 | "Connect With Us" social | **Empty** — heading with no links | **Todo** — needs real handles |

### Blog (`blog.html` + 7 articles)

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 44 | Blog index: categories, dates, read time | Static | **Todo** |
| 45 | 7 articles (SUV, finance, foreign-used, inspection, luxury, maintenance, rental) | Static, **Nigeria-only content** | **Todo** — needs per-market variants |
| 46 | Pagination | Real | **Todo** |
| 47 | Newsletter subscribe | **Façade** — no action, no handler | **Todo** — real list with confirmed opt-in |
| 48 | Comments (×7 articles) | **Façade** — no action, no handler | **Todo** — or drop; unmoderated comments are a liability |

### Legal

| # | Feature | Legacy state | New platform |
| --- | --- | --- | --- |
| 49 | Privacy Policy | Static, Nigeria-framed | **Todo** — must cover US data handling |
| 50 | Terms of Service | Static, Nigeria-framed | **Todo** — per market |
| 51 | Rental Policy | Static | **Todo** |

---

## 3. What the old site never had

Absent entirely, and expected of a dealership operating at scale:

| Capability | Why it matters |
| --- | --- |
| Inventory syndication feeds | Buyers shop on Cars.com, CarGurus, Facebook, Google Vehicle Ads. Without a structured feed you are invisible where demand actually is. |
| VIN decode | Typing 30 spec fields by hand per car does not scale and produces errors. One VIN lookup fills them. |
| Vehicle history integration | US buyers will not enquire on a used car without Carfax/AutoCheck. |
| Trade-in valuation | Half of retail buyers have a car to dispose of. No trade-in path = half the market ignored. |
| Saved vehicles / price alerts | A car purchase takes weeks. Nothing brought a visitor back. |
| Sold-vehicle archive | Sold listings retain SEO value and prove trading volume. |
| Analytics & attribution | No way to know which channel produced which sale. |
| Sitemap / robots / canonical | Basic discoverability. |
| Buyers Guide tracking | FTC requirement on used vehicles in the US. |
| Rental fleet operations | Availability, handover condition, damage records, insurance verification. |
| Staff accounts & audit trail | Who changed a price, and when. |

---

## 4. Scoreboard

| | Count |
| --- | --- |
| Features catalogued | 51 |
| Genuinely working in legacy | 18 |
| Façades (look functional, are not) | 12 |
| Static content presented as dynamic | 21 |
| **Forms that reach a human** | **0 of 12** |
| Rebuilt authentically so far | 17 |

---

## 5. What "authentic" requires — the non-obvious ones

### 5.1 Rental booking

A WhatsApp deeplink is not a booking system. Real means: live availability per
vehicle, overlap prevention **in the database** (built and proven — see
`0001_constraints.sql`), rate calculation across daily/weekly/monthly bands,
deposit handling, a signed rental agreement, handover condition record, and
insurance verification before keys change hands.

### 5.2 Financing prequal without holding an SSN

The safe pattern is to **never store the SSN in our database**:

1. Collect non-sensitive affordability data (income band, employment, deposit,
   desired term) and compute an indicative payment locally.
2. For a real credit decision, hand off to the lender or bureau over a server-side
   integration — their form, their compliance perimeter, or a tokenised
   soft-pull. The SSN passes through, is never persisted by us.
3. Record only the decision, the consent timestamp, the consent IP, and the
   disclosure version the applicant saw.

`finance_applications` is already shaped for this: it stores `income_band`
rather than an exact figure, and has `consent_credit_check_at`, `consent_ip` and
`disclosure_version` columns. There is no SSN column, deliberately.

### 5.3 Geo-detection

The old site called `ipapi.co` from the browser on every page load — a
third-party request carrying the visitor's IP, on a site whose privacy policy
does not mention it. Replace with an edge geo header from the CDN (no third
party), used only to *suggest* a market via a dismissible banner, with the
choice persisted.

### 5.4 Referral programme

Currently a paragraph claiming 1.5% commission with no mechanism. Real means: a
referral code per partner, attribution captured on the lead, the link surviving
to the sale, a commission ledger, and a payout status. Otherwise it is a promise
with no way to honour or audit it.

### 5.5 Blog

Seven articles written entirely for a Nigerian audience ("Top 5 SUVs for
Nigerian Roads", "customs clearance", "Tokunbo"). For the US market these are
not merely irrelevant, they are actively confusing. Content must be per-market,
which means the blog needs the same market dimension as inventory.
