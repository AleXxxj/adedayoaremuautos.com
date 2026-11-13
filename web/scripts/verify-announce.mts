#!/usr/bin/env node
/**
 * Announcing a guide or an article to subscribers.
 *
 * Runs the real announce(), the real campaign sender and the real push sender
 * against the real migrations in an in-memory Postgres (PGlite). Nothing
 * leaves this process: `fetch` and web-push's sendNotification are replaced
 * with recorders, and any other network call fails the run.
 *
 * What is proven:
 *   - the draft is the guide's own words, and the email has one button, the
 *     postal address and the unsubscribe link
 *   - the audience is the right market and only people still subscribed
 *   - an announced item cannot be sent again without "send again", even when
 *     two people press Send at once
 *   - before migration 0036 is applied, everything answers "feature off"
 *
 * Run: npm run test:announce
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SITE = "https://www.example.test";
process.env.DATABASE_URL ??= "postgres://unused@localhost:5432/unused";
process.env.NEXT_PUBLIC_SITE_URL = SITE;
process.env.RESEND_API_KEY = "test-key-not-real";
process.env.MAILING_ADDRESS = "Test Autos, 1 Test St, Greensboro, NC 27401, USA";

/* ── Recorders: nothing is sent ────────────────────────────────────────── */

interface Mail {
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}
const mails: Mail[] = [];
globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
  const url = String(input);
  if (url !== "https://api.resend.com/emails/batch") {
    throw new Error(`Unexpected network call in a test: ${url}`);
  }
  mails.push(...(JSON.parse(String(init?.body)) as Mail[]));
  return new Response("{}", { status: 200 });
}) as typeof fetch;

const webpush = (await import("web-push")).default;
const keys = webpush.generateVAPIDKeys();
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
const pushes: { endpoint: string; payload: { title: string; body: string; url: string; tag?: string } }[] = [];
webpush.sendNotification = (async (sub: { endpoint: string }, payload: string) => {
  pushes.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  return { statusCode: 201, body: "", headers: {} };
}) as never;

const { announce, ANNOUNCE_NOT_READY } = await import("../src/lib/campaign/announce");
const { announceables, findAnnounceable, firstSentence } = await import(
  "../src/lib/campaign/announceContent"
);
const { draftFor, cleanIntro, defaultIntro, INTRO_MAX } = await import(
  "../src/lib/campaign/announceDraft"
);
const { renderAnnouncementHtml, renderAnnouncementText } = await import(
  "../src/lib/campaign/announceMail"
);
const { renderHtml, escapeHtml } = await import("../src/lib/campaign/render");
const { listAnnounced, announcementForCampaign } = await import(
  "../src/lib/campaign/announceRecord"
);
const { GUIDES, guideHref } = await import("../src/content/guides");
const { articlesFor } = await import("../src/content/articles");
const schema = await import("../src/db/schema");

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m ${detail}`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../src/db/migrations");
const OURS = "0036_content_announcements.sql";

async function database(withOurs: boolean) {
  const pg = await PGlite.create({ extensions: { btree_gist } });
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (!withOurs && file === OURS) continue;
    const statements = readFileSync(join(migrationsDir, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) await pg.exec(stmt);
  }
  await pg.exec(`
    INSERT INTO markets (code, name, currency, locale, timezone, distance_unit) VALUES
      ('us','United States','USD','en-US','America/New_York','mi'),
      ('ng','Nigeria','NGN','en-NG','Africa/Lagos','km');
    INSERT INTO staff (id, email, role) VALUES
      ('99999999-9999-9999-9999-999999999999','owner@example.test','owner');
    INSERT INTO newsletter_subscribers (email, market_code, unsubscribe_token, unsubscribed_at) VALUES
      ('us1@example.test','us','tok-us1',NULL),
      ('us2@example.test','us','tok-us2',NULL),
      ('us3@example.test','us','tok-us3',NULL),
      ('gone@example.test','us','tok-gone',now()),
      ('ng1@example.test','ng','tok-ng1',NULL),
      ('ng2@example.test','ng','tok-ng2',NULL);
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, market_code) VALUES
      ('https://push.example.test/us-a','k','a','us'),
      ('https://push.example.test/us-b','k','a','us'),
      ('https://push.example.test/ng-a','k','a','ng');
  `);
  return { pg, db: drizzle(pg, { schema }) as never };
}

const count = async (pg: PGlite, sql: string) =>
  Number((await pg.query<{ n: number }>(sql)).rows[0].n);

const staff = { id: "99999999-9999-9999-9999-999999999999", email: "owner@example.test" };

/* ── 1. The draft is the guide's own words ─────────────────────────────── */
console.log("\nThe draft");

const us = announceables("us");
const ng = announceables("ng");

check("every US guide is announceable", GUIDES.every((g) => us.some((i) => i.kind === "guide" && i.slug === g.meta.slug)));
check("every Nigerian article is announceable", articlesFor("ng").every((a) => ng.some((i) => i.kind === "article" && i.slug === a.slug)));
check("no US guide is offered to Nigeria", ng.every((i) => i.kind === "article" && i.market === "ng"));
check(
  "newest first",
  [us, ng].every((list) => list.every((i, n) => n === 0 || (list[n - 1].published ?? "") >= (i.published ?? ""))),
);

let wordsOk = true;
let mailOk = true;
let detail = "";
for (const g of GUIDES) {
  const item = findAnnounceable("us", "guide", g.meta.slug)!;
  const d = draftFor(item, SITE);
  if (
    d.title !== g.meta.title ||
    d.promise !== g.meta.promise ||
    d.url !== `${SITE}${guideHref(g.meta.slug)}` ||
    d.subject !== `New guide: ${g.meta.title}` ||
    d.intro !== defaultIntro("guide") ||
    d.push.title !== g.meta.title ||
    d.push.body !== g.meta.promise ||
    d.push.url !== guideHref(g.meta.slug) ||
    !d.body.includes(d.url)
  ) {
    wordsOk = false;
    detail = g.meta.slug;
  }

  const opts = {
    draft: d,
    unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    address: process.env.MAILING_ADDRESS!,
    siteBase: SITE,
  };
  const html = renderAnnouncementHtml(opts);
  const text = renderAnnouncementText(opts);
  const links = [...html.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  if (
    !html.includes(escapeHtml(g.meta.title)) ||
    !html.includes(escapeHtml(g.meta.promise)) ||
    // One button to the guide, the unsubscribe link, and nothing else.
    links.length !== 2 ||
    links[0] !== escapeHtml(d.url) ||
    links[1] !== opts.unsubscribeUrl ||
    !html.includes(escapeHtml(opts.address)) ||
    !text.includes(g.meta.title) ||
    !text.includes(d.url) ||
    !text.includes(opts.address) ||
    !text.includes(`Unsubscribe: ${opts.unsubscribeUrl}`)
  ) {
    mailOk = false;
    detail = g.meta.slug;
  }
}
check("title, promise, address, subject and notification are each guide's own", wordsOk, detail);
check("the email has one button to the guide, the postal address and the unsubscribe link", mailOk, detail);

{
  // The footer is the campaign footer, not a copy of it.
  const o = { unsubscribeUrl: `${SITE}/unsubscribe?token=abc`, address: "A & B, 1 St", siteBase: SITE };
  const ordinary = renderHtml({ ...o, body: "Hello there, this is a message." });
  const ours = renderAnnouncementHtml({ ...o, draft: draftFor(us[0], SITE) });
  const foot = (h: string) => h.slice(h.lastIndexOf('<tr><td style="background:#fafafa'));
  const head = (h: string) => h.slice(0, h.indexOf("</td></tr>"));
  check("same footer as every other campaign email, byte for byte", foot(ours) === foot(ordinary) && foot(ours).includes("Unsubscribe"));
  check("same header band as every other campaign email", head(ours) === head(ordinary));
}

check(
  "an article's one line is the first sentence of its own excerpt",
  articlesFor("ng").every((a) => {
    const p = findAnnounceable("ng", "article", a.slug)!.promise;
    return a.excerpt.startsWith(p) && /[.?!]$/.test(p);
  }),
);
check("a cut-off excerpt ends at a whole word", firstSentence("Buying a car is a big decisi") === "Buying a car is a big...");

check("an empty intro falls back to the default", cleanIntro("   \n ", "article") === defaultIntro("article"));
check("the intro is one line", cleanIntro("Hello\n\nthere\tfriend", "guide") === "Hello there friend");
check("the intro is capped", cleanIntro("x".repeat(500), "guide").length === INTRO_MAX);
{
  const d = draftFor(us[0], SITE, '<script>alert(1)</script> "quoted"');
  const html = renderAnnouncementHtml({ draft: d, unsubscribeUrl: "u", address: "a", siteBase: SITE });
  check("an edited intro is escaped in the email", !html.includes("<script>") && html.includes("&lt;script&gt;"));
}

/* ── 2. Sending: right people, captured, once ──────────────────────────── */
console.log("\nSending");

const { pg, db } = await database(true);
const guide = us[0];
const guide2 = us[1];

check("nothing is sent by loading the code", mails.length === 0 && pushes.length === 0);

const r1 = await announce(
  { item: guide, intro: "Fresh this week.", email: true, push: true, user: staff },
  { database: db },
);
check("the first announcement goes out", r1.ok && r1.progress?.finished === true, JSON.stringify(r1));
check(
  "email goes to the 3 US subscribers and nobody else",
  mails.length === 3 &&
    ["us1", "us2", "us3"].every((n) => mails.some((m) => m.to.length === 1 && m.to[0] === `${n}@example.test`)),
  JSON.stringify(mails.map((m) => m.to)),
);
check("the unsubscribed address is not emailed", !mails.some((m) => m.to.includes("gone@example.test")));
check("Nigerian subscribers are not emailed a US guide", !mails.some((m) => m.to[0].startsWith("ng")));
check(
  "each email carries that person's own unsubscribe link and one-click header",
  mails.every((m) => {
    const tok = `tok-${m.to[0].split("@")[0]}`;
    const url = `${SITE}/unsubscribe?token=${tok}`;
    return (
      m.html.includes(`href="${url}"`) &&
      m.text.includes(url) &&
      m.headers["List-Unsubscribe"] === `<${url}>` &&
      m.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click"
    );
  }),
);
check(
  "the email is the announcement: guide's words, staff's intro, no vehicle button",
  mails.every(
    (m) =>
      m.subject === `New guide: ${guide.title}` &&
      m.html.includes(escapeHtml(guide.title)) &&
      m.html.includes(escapeHtml(guide.promise)) &&
      m.html.includes("Fresh this week.") &&
      m.html.includes(`href="${SITE}${guide.path}"`) &&
      !m.html.includes("Browse all vehicles") &&
      m.html.includes(escapeHtml(process.env.MAILING_ADDRESS!)),
  ),
);
check(
  "the notification goes to the 2 US devices only, with the guide's words",
  pushes.length === 2 &&
    pushes.every(
      (p) =>
        p.endpoint.includes("/us-") &&
        p.payload.title === guide.title &&
        p.payload.body === guide.promise &&
        p.payload.url === `${SITE}${guide.path}`,
    ),
  JSON.stringify(pushes.map((p) => p.endpoint)),
);
check(
  "it is recorded: one announcement, linked to a finished campaign with 3 recipients",
  (await count(
    pg,
    `SELECT count(*) AS n FROM content_announcements a JOIN campaigns c ON c.id = a.campaign_id
     WHERE a.slug = '${guide.slug}' AND a.market_code = 'us' AND NOT a.send_again
       AND c.status = 'sent' AND c.recipient_count = 3 AND c.sent_count = 3
       AND a.push_sent = 2 AND a.announced_by_email = 'owner@example.test'`,
  )) === 1,
);
check(
  "every recipient is in the campaign ledger as sent",
  (await count(pg, `SELECT count(*) AS n FROM campaign_recipients WHERE status = 'sent'`)) === 3,
);
{
  const listed = await listAnnounced(["us"], db);
  const linked = await announcementForCampaign(r1.campaignId!, db);
  check("the Broadcasts screen can see it is announced", listed.ready && listed.rows.length === 1 && listed.rows[0].slug === guide.slug);
  check("the sender can tell the campaign is an announcement", linked?.slug === guide.slug && linked.intro === "Fresh this week.");
}

// Again, without asking for it.
let before = { m: mails.length, p: pushes.length };
const r2 = await announce({ item: guide, email: true, push: true, user: staff }, { database: db });
check("a second press is refused", !r2.ok && r2.already === true, JSON.stringify(r2));
check("and sends nothing", mails.length === before.m && pushes.length === before.p);
check("and records nothing", (await count(pg, `SELECT count(*) AS n FROM content_announcements`)) === 1 && (await count(pg, `SELECT count(*) AS n FROM campaigns`)) === 1);

// Two people at once, on a guide nobody has announced.
before = { m: mails.length, p: pushes.length };
const both = await Promise.all([
  announce({ item: guide2, email: true, push: false, user: staff }, { database: db }),
  announce({ item: guide2, email: true, push: false, user: { email: "manager@example.test" } }, { database: db }),
]);
check("two people pressing Send at once: one goes out", both.filter((r) => r.ok).length === 1 && both.filter((r) => r.already).length === 1, JSON.stringify(both));
check("and each subscriber gets one email, not two", mails.length === before.m + 3, String(mails.length - before.m));
check("no stray campaign is left behind", (await count(pg, `SELECT count(*) AS n FROM campaigns`)) === 2);

// The database itself refuses a second first-announcement.
let refused = false;
try {
  await pg.exec(`INSERT INTO content_announcements (market_code, content_type, slug, title, intro)
                 VALUES ('us','guide','${guide.slug}','t','i')`);
} catch {
  refused = true;
}
check("the database refuses a second first-announcement by itself", refused);
let badType = false;
try {
  await pg.exec(`INSERT INTO content_announcements (market_code, content_type, slug, title, intro)
                 VALUES ('us','vehicle','x','t','i')`);
} catch {
  badType = true;
}
check("the database refuses an unknown kind of content", badType);

// Send again, on purpose.
before = { m: mails.length, p: pushes.length };
const r3 = await announce({ item: guide, email: true, push: true, again: true, user: staff }, { database: db });
check("\"send again\" does send", r3.ok && mails.length === before.m + 3 && pushes.length === before.p + 2, JSON.stringify(r3));
check(
  "and is recorded as a repeat, leaving the first record alone",
  (await count(pg, `SELECT count(*) AS n FROM content_announcements WHERE slug = '${guide.slug}' AND send_again`)) === 1 &&
    (await count(pg, `SELECT count(*) AS n FROM content_announcements WHERE slug = '${guide.slug}' AND NOT send_again`)) === 1,
);

// Somebody unsubscribes; the next announcement leaves them out.
await pg.exec(`UPDATE newsletter_subscribers SET unsubscribed_at = now() WHERE email = 'us3@example.test'`);
before = { m: mails.length, p: pushes.length };
const r4 = await announce({ item: us[2], email: true, push: false, user: staff }, { database: db });
check(
  "someone who unsubscribed since is left out of the next one",
  r4.ok && mails.length === before.m + 2 && !mails.slice(before.m).some((m) => m.to.includes("us3@example.test")),
);
check("email only: no notification is sent", pushes.length === before.p);

// Nigeria: an article, to Nigerian subscribers only.
before = { m: mails.length, p: pushes.length };
const article = ng[0];
const r5 = await announce({ item: article, email: true, push: true, user: staff }, { database: db });
const ngMails = mails.slice(before.m);
check(
  "a Nigerian article goes to the 2 Nigerian subscribers only",
  r5.ok && ngMails.length === 2 && ngMails.every((m) => m.to[0].startsWith("ng")),
  JSON.stringify(ngMails.map((m) => m.to)),
);
check(
  "with the article's own title and a link to /ng/blog",
  ngMails.every(
    (m) =>
      m.subject === `New article: ${article.title}` &&
      m.html.includes(`href="${SITE}/ng/blog/${article.slug}"`) &&
      m.html.includes("Read the article"),
  ),
);
check("and to the 1 Nigerian device only", pushes.length === before.p + 1 && pushes[pushes.length - 1].endpoint.includes("/ng-"));

// Notification only: no campaign is made.
before = { m: mails.length, p: pushes.length };
const campaignsBefore = await count(pg, `SELECT count(*) AS n FROM campaigns`);
const r6 = await announce({ item: ng[1], email: false, push: true, user: staff }, { database: db });
check(
  "notification only: no email, no campaign, still recorded",
  r6.ok &&
    mails.length === before.m &&
    pushes.length === before.p + 1 &&
    (await count(pg, `SELECT count(*) AS n FROM campaigns`)) === campaignsBefore &&
    (await count(pg, `SELECT count(*) AS n FROM content_announcements WHERE slug = '${ng[1].slug}' AND campaign_id IS NULL AND push_sent = 1`)) === 1,
);

/* ── 3. Refusals record nothing ────────────────────────────────────────── */
console.log("\nRefusals");

async function refusedCleanly(label: string, run: () => Promise<{ ok: boolean; error?: string }>, expect?: string) {
  const m = mails.length;
  const p = pushes.length;
  const rows = await count(pg, `SELECT count(*) AS n FROM content_announcements`);
  const camps = await count(pg, `SELECT count(*) AS n FROM campaigns`);
  const r = await run();
  check(
    label,
    !r.ok &&
      (!expect || r.error === expect) &&
      mails.length === m &&
      pushes.length === p &&
      (await count(pg, `SELECT count(*) AS n FROM content_announcements`)) === rows &&
      (await count(pg, `SELECT count(*) AS n FROM campaigns`)) === camps,
    JSON.stringify(r),
  );
}

await refusedCleanly("neither email nor notification chosen", () =>
  announce({ item: us[3], email: false, push: false, user: staff }, { database: db }),
);

const savedKey = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
await refusedCleanly("email not set up: refused before anything is recorded", () =>
  announce({ item: us[3], email: true, push: true, user: staff }, { database: db }),
);
process.env.RESEND_API_KEY = savedKey;

await pg.exec(`UPDATE newsletter_subscribers SET unsubscribed_at = now() WHERE market_code = 'ng';
               DELETE FROM push_subscriptions WHERE market_code = 'ng';`);
await refusedCleanly("nobody to send to: refused, and the article stays unannounced", () =>
  announce({ item: ng[2], email: true, push: true, user: staff }, { database: db }),
);

/* ── 4. Before the migration is applied ────────────────────────────────── */
console.log("\nBefore migration 0036 is applied");

const old = await database(false);
{
  const listed = await listAnnounced(["us", "ng"], old.db);
  check("the list reads as \"not switched on\" instead of failing", listed.ready === false && listed.rows.length === 0);
  check(
    "an ordinary campaign is still an ordinary campaign",
    (await announcementForCampaign("11111111-1111-1111-1111-111111111111", old.db)) === null,
  );
  const m = mails.length;
  const p = pushes.length;
  const r = await announce({ item: guide, email: true, push: true, user: staff }, { database: old.db });
  check("Send is refused with a plain reason", !r.ok && r.error === ANNOUNCE_NOT_READY, JSON.stringify(r));
  check("and nothing is sent", mails.length === m && pushes.length === p);
  check("and no campaign is created", (await count(old.pg, `SELECT count(*) AS n FROM campaigns`)) === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
