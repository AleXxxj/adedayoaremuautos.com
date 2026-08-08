# Adedayo Aremu Autos — Platform Architecture

Status: **draft for approval** · Last updated: 2026-08-07

This document defines what we are building and why. It exists so that decisions
are written down once and not re-litigated, and so a future developer can pick
this up without archaeology.

---

## 1. What we are replacing

The current site is 19 hand-authored HTML files served from GitHub Pages.

| Symptom | Root cause |
| --- | --- |
| 5 consecutive commits titled "Update footer links to point to correct pages" | Nav and footer are copy-pasted into every page. One change = 19 edits. |
| Finance and contact forms post to `formspree.io/f/your-form-id` | Placeholder never configured. **Every lead submitted to date was discarded.** |
| No search, filter, or sort on inventory | Cars are hardcoded `<div>` markup in `index.html` and `cars.html`. |
| Cannot list on Cars.com / CarGurus / Google Vehicle Ads | Syndication requires a structured feed. There is no structure. |
| Selling a car requires remembering which files mention it | No single source of truth. |

The site is a brochure. We are building a system that runs the business.

---

## 2. The core design decision: market is a dimension, not a dropdown

The business operates in **two real markets**: Greensboro, North Carolina (US)
and Nigeria. The existing site models this as a currency dropdown that converts
₦ to $ at a live FX rate.

**That is wrong, and it is the single most important thing to get right.**

A car physically sitting in Lagos is not purchasable by a buyer in Greensboro at
a converted price. Showing `$8,200` on a Lagos vehicle implies an offer that does
not exist. The markets differ in almost every dimension that matters:

| Dimension | US (Greensboro) | Nigeria |
| --- | --- | --- |
| Currency | USD, minor unit cents | NGN, minor unit kobo |
| Distance | miles | kilometres |
| Condition taxonomy | New / Used / Certified Pre-Owned | New / Nigerian Used / Foreign Used (Tokunbo) |
| Vehicle identity | 17-char VIN, decodable | Chassis number, no public decoder |
| Buyer expectation | Carfax/AutoCheck history report is non-negotiable | Customs papers and duty status matter more |
| Financing | APR, credit tiers, TILA disclosure obligations | In-house instalment plans, 6–24 months |
| Advertising law | Monthly payment is a TILA *triggering term* — requires APR, term, down payment disclosed alongside | Different regime |
| Fulfilment | Local pickup / regional delivery | Nationwide delivery, customs clearance |

So `market` is a first-class column on inventory, content, leads, pricing and
compliance — not a display preference.

**Rules that follow from this:**

1. Every vehicle belongs to exactly one market. Inventories are disjoint.
2. Prices are entered and stored per market in that market's real currency. **We
   never FX-convert a price for display.**
3. A currency switcher, if we keep one, is an *estimate* clearly labelled as such
   — never a purchasable price.
4. Compliance rules are resolved from the market, not hardcoded in templates.
5. URLs are market-scoped: `/us/...` and `/ng/...`, with `hreflang` linking
   equivalents so Google indexes both without duplicate-content penalty.

Geo-IP may *suggest* a market. It must never silently lock the user into one —
a Nigerian buyer researching from the US must be able to switch and stay switched.

---

## 3. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js (App Router) + TypeScript** | Needs server-rendered SEO pages *and* an authenticated admin app *and* API routes. One framework covers all three. |
| Styling | **Tailwind CSS** over design tokens | Tokens as CSS custom properties so the palette is themeable and auditable (see §6). |
| Database | **Postgres** (hosted — Supabase or Neon) | Needs relational integrity, and rental booking correctness depends on a Postgres-specific feature (§5.3). No local Docker on this machine, so hosted. |
| ORM / migrations | **Drizzle** | Typed schema, SQL-first migrations, no hidden magic. |
| Auth | Supabase Auth or Auth.js | Staff-only initially. Customer accounts are a later phase. |
| File storage | Supabase Storage / S3-compatible | Vehicle photography, many images per car. |
| Email / SMS | Resend + Twilio | Speed-to-lead alerting (§5.5). |
| Hosting | **Vercel** or Cloudflare | GitHub Pages cannot serve any of this — it is static-only. |

Verified on this machine: Node v24.17.0, npm 11.13.0. No Docker, no local
Postgres — hence hosted database.

---

## 4. Repository layout

```
/
├── *.html               # legacy site — LEFT IN PLACE, still served by GitHub Pages
├── theme.css, theme.js  # legacy
├── images/              # legacy assets (reused by the new app)
├── docs/                # this file and successors
└── web/                 # the new platform
    ├── src/
    │   ├── app/
    │   │   ├── [market]/    # public site, market-scoped
    │   │   ├── admin/       # authenticated staff app
    │   │   └── api/         # lead intake, feeds, webhooks
    │   ├── db/              # drizzle schema + migrations
    │   ├── lib/
    │   │   ├── money.ts     # minor-unit arithmetic, never floats
    │   │   ├── market.ts    # market resolution + config
    │   │   └── compliance/  # per-market disclosure rules
    │   └── components/
    └── public/
```

**Why the legacy files stay at the repo root:** GitHub Pages serves this repo
from the root of `main`. Moving those files into `legacy/` would 404 the live
site the moment it was pushed. So the new app is built in `web/` alongside it,
deployed separately (Vercel root directory = `web/`), and verified in production
*before* any cutover. At cutover we point the domain at the new deployment and
only then archive the legacy files. There is never a window where the business
has no website.

---

## 5. Data model

### 5.1 Money

Stored as **integer minor units + ISO currency code**. Never floating point.
`6_800_000` NGN is stored as `680000000` kobo with `currency = 'NGN'`.

Floats lose cents on arithmetic, and this system computes loan amortisation and
rental totals. That is not a place to be approximately correct.

### 5.2 Core tables

```
markets           code (us|ng) PK, currency, distance_unit, locale, timezone,
                  legal_entity, address, phone, compliance_profile

locations         id, market_code FK, name, address, geo, hours

vehicles          id, market_code FK, location_id FK,
                  vin (US) | chassis_no (NG), make, model, year, trim, body,
                  mileage, mileage_unit, transmission, fuel, drivetrain,
                  exterior_color, interior_color,
                  condition (market-specific enum),
                  price_minor, currency,
                  status (draft|available|pending|sold|unlisted),
                  is_rental_fleet, slug, description,
                  created_at, updated_at, sold_at

vehicle_media     id, vehicle_id FK, storage_key, alt, position, is_primary

rental_rates      vehicle_id FK, daily_minor, weekly_minor, monthly_minor,
                  deposit_minor, min_days, max_days

rental_bookings   id, vehicle_id FK, customer info, period tstzrange,
                  status, total_minor, deposit_minor, agreement_signed_at

leads             id, market_code, type (contact|test_drive|finance|trade_in|rental),
                  vehicle_id FK nullable, name, email, phone, message,
                  status (new|contacted|qualified|won|lost),
                  source, utm_*, ip_country, created_at, first_response_at

finance_apps      id, lead_id FK, vehicle_id FK, income, employment,
                  down_payment_minor, requested_term_months,
                  consent_credit_check_at, consent_ip, status

staff             id, email, role (owner|manager|sales), market_scope

audit_log         id, actor_id, entity, entity_id, action, diff, at
```

### 5.3 Rental double-booking is a database concern

Availability checked in application code is a race condition: two users booking
the same car for overlapping dates simultaneously will both pass a "is it free?"
query before either writes. Postgres solves this properly:

```sql
ALTER TABLE rental_bookings
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    vehicle_id WITH =,
    period     WITH &&
  ) WHERE (status IN ('confirmed', 'active'));
```

The database now makes overlapping confirmed bookings *impossible*, regardless of
application bugs or concurrency. This is why the stack is Postgres and not a
document store.

### 5.4 Compliance as configuration

Each market carries a compliance profile that the UI reads. For `us`:

> Advertising a monthly payment figure is a **triggering term** under Truth in
> Lending (Reg Z §226.24). Stating "$450/mo" legally obliges disclosing the
> down payment, repayment terms, and APR in the same context.

The current site advertises `₦212,500/mo` style figures with no disclosures on
any page. In the US market that is exposure. So: a `<PaymentDisplay>` component
that *cannot* render a monthly figure without resolving and rendering the
market's required disclosure block. Compliance enforced by the component API,
not by remembering.

Also flagged for the US market: the FTC Used Car Rule requires a Buyers Guide on
used vehicles offered for sale, and NC has dealer licensing requirements.
**Confirm the specifics with counsel** — I am flagging risk, not giving legal
advice.

### 5.5 Speed-to-lead

A lead that sits unseen for an hour is usually dead. The pipeline is:

```
form → server-side validation → persist to DB → immediate SMS + email to staff
     → admin inbox with status pipeline → first_response_at recorded
```

`first_response_at` is stored because response time is the metric that predicts
close rate, and an asset should measure the thing that makes it money.

---

## 6. Design system

The current palette is why the site reads as dead. Five greens — `#0F3B2A`,
`#1A4D35`, `#2C5E42`, `#3F7352` — all dark *and* desaturated, on a `#0A0A0A`
background, with neutral-grey text (`#F0F0F0`, `#CCCCCC`, `#A0A0A0`). There is
effectively **no chroma anywhere on the page**. The intended gold accent
`#C4A962` is a muted tan; it is referenced 191 times and still fails to register.

The hero demonstrates the failure directly: grey car, grey sky, grey-white
headline — the words "Finance Cars" are illegible against the clouds.

Direction:

- **Keep green as the brand.** It is genuinely ownable in automotive, where
  nearly everyone defaults to blue or red.
- Build a real **luminance ladder** — surfaces must step apart measurably rather
  than sit in one tonal band.
- Promote one **saturated accent** reserved for calls to action. A CTA should be
  the loudest element on screen; currently it recedes.
- Enforce contrast targets in both themes as a build check, not a hope.
- Fix the hero with a treatment layer so headline legibility never depends on
  what happens to be in the photograph.

Full token set lands with Phase 1.

---

## 7. Phases

| Phase | Delivers | Business outcome |
| --- | --- | --- |
| **0 — Triage** | Working forms, correct locations, hero legibility | Stop losing leads today |
| **1 — Foundation** | Next.js scaffold, design system, schema | Ground to build on |
| **2 — Inventory + Admin** | DB-backed inventory, staff CRUD, photos | Staff manage cars without a developer |
| **3 — Public rebuild** | Both markets on real data, search, SEO, structured data | Findable, credible, converts |
| **4 — Leads + Financing** | Real pipeline, alerts, prequal, disclosures | Revenue capture, reduced legal exposure |
| **5 — Rentals** | Availability calendar, bookings, agreements | Rental run as a system, not a spreadsheet |
| **6 — Distribution** | Syndication feeds, analytics, attribution | Inventory reaches buyers where they already shop |

Phase 0 is deliberately first and deliberately small: the dead forms are an
active, ongoing loss and should not wait for an architecture.

---

## 8. Open items — needed from the business

These block content and go-live, not architecture. Building continues without them.

1. **Real Greensboro address, phone, and business hours.** Current site shows
   `123 Auto Avenue, Victoria Island, Lagos` and `+234 801 234 5678` — both
   placeholders.
2. **Real Nigeria address and phone**, if the Lagos operation is live.
3. **Actual current inventory** for each market, with photos, VINs (US), and
   real prices.
4. **Legal entity name** per market, for footers and agreements.
5. **Domain** — confirm `adedayoaremuautos.com` is registered and who controls DNS.
6. **Accounts** for hosting, database, email/SMS. These have costs; see §9.
7. **Which claims are true.** The site currently states "50+ Vehicles Sold",
   "100% Client Satisfaction", "5+ Years Experience", and a 1.5% referral
   commission. Unverifiable marketing claims are a liability in the US market.

## 9. Cost shape

Rough monthly, at low volume: hosting ~$20, database $0–25, email/SMS ~$10–20,
domain ~$15/yr. Vehicle history reports (Carfax/AutoCheck dealer accounts) are
the significant line item and are priced per dealer agreement — that is a
business decision for the US market, not a technical one.
