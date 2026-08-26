/**
 * The canonical origin for every absolute URL the site emits.
 *
 * Resolution order matters:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — an explicit override, for local development or
 *    when the canonical domain differs from the deployment.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — set by Vercel to the project's
 *    production domain, and updated automatically when a custom domain is
 *    added. This means URLs start pointing at adedayoaremuautos.com the moment
 *    the domain is attached, with no redeploy and nothing to remember.
 * 3. localhost, for a bare local run.
 *
 * This exists because a hand-set value was wrong the first time: the deployment
 * landed on `adedayoaremuautos-com.vercel.app` while the variable said
 * `adedayoaremuautos.vercel.app`, so every URL in every feed pointed at a
 * domain that does not resolve.
 *
 * It lives in its own module, separate from the feeds that first needed it,
 * because the root layout needs it too — and the feed module imports
 * `server-only` and the database. Pulling a whole data layer into the root
 * layout to read one environment variable is a cost paid on every route.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
