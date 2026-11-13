# Adedayo Aremu Autos: the website

The site for a used-car business in Greensboro, North Carolina: cars for sale, rentals by the week, rent to own, financing, a free car check, and a referral program. A second market, Nigeria (`/ng`), shares the code.

This is the Next.js app. The HTML files one folder up are the original site and are still served from there; don't move them.

## Read this before you run anything

- **Local development uses the live database.** `.env.local` points at production. Reading is fine. Never submit a form, send a chat message, book a car, or run a car check on `localhost`, and never run a migration or seed script without a decision to do so.
- **This is Next.js 16.** Some APIs differ from older versions. Read the guide in `node_modules/next/dist/docs/` before writing framework code (see `AGENTS.md`).
- **All visible text is plain American English.** `npm run check:copy` fails the build on British spellings.
- **A VIN never goes in a URL or a log line.**

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Everything that must pass before a push: design tokens, contrast check, copy check, every test suite, then the production build |
| `npm run lint` | ESLint |
| `npm run check:copy` | The American English check on its own |
| `npm run test:<name>` | One suite: `schema`, `deal`, `amort`, `ledger`, `rental`, `payout`, `holds`, `referrals`, `vin`, `sell`, `home`, `cars`, `value`, `guides` |

The test suites are scripts in `scripts/verify-*`. They run pure logic, or the real migrations in an in-memory Postgres; none touches the live database.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in. Never commit `.env.local`, and never paste a key into a chat or an issue.
3. `npm run dev`

Optional settings and what they switch on:

| Setting | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | The chat assistant and plain-English recall summaries. Without it the assistant is hidden and recalls show NHTSA's own words. |
| `ASSISTANT_MODEL`, `RECALL_SUMMARY_MODEL` | Override the default models. |
| `MARKETCHECK_API_KEY` | The price estimate at `/us/value`, for signed-in staff only. |
| `VALUE_CHECK_PUBLIC=1` | Opens the price estimate to everyone. `VALUE_CHECK_MONTHLY_CAP` limits calls per month. |

## Where things are

```
src/app/[market]/     Public pages for /us and /ng (home, inventory, rentals, sell,
                      check, value, compare, guides, referral, rent-to-own, financing)
src/app/admin/        Staff pages (sign-in required)
src/app/partner/      Referral partners' pages (sign-in required)
src/app/api/          Route handlers (assistant, saved cars, partner session)
src/components/       React components; cars/, guides/, compare/, home/, partner/, admin/
src/content/          Words kept in code: legal pages, rental policy, partner terms, guides
src/db/               Database schema and migrations (Drizzle, Postgres)
src/lib/              Business logic: pricing, bookings, referrals, payments, the car
                      check (vin/), the assistant (ai/), server actions (actions/)
src/styles/           Stylesheets; tokens.css is generated from palette.json
scripts/              Checks, test suites, and database scripts
```

A page's server component loads data through `src/lib/repositories/*`. Forms post to server actions in `src/lib/actions/*`, which validate with Zod and write through Drizzle. Money is stored in minor units (cents) and formatted with `src/lib/money.ts`. Market differences (currency, locale, time zone) come from `src/lib/market.ts`, never from a setting the visitor picks.

## Outside services

Supabase (database, sign-in, file storage), Vercel (hosting), Stripe (hosted checkout), Resend and Twilio (staff alerts), Anthropic (assistant and recall summaries), NHTSA (VIN decoding, recalls, complaints, crash ratings), Wikimedia Commons (model photos for the car check), MarketCheck (price estimate).

## Shipping a change

1. `npm run build` must pass.
2. Push to `main`; Vercel deploys it.
3. Check the live site at `https://www.adedayoaremuautos.com` (the bare domain redirects).

See `../docs/ARCHITECTURE.md` for the original design decisions.
