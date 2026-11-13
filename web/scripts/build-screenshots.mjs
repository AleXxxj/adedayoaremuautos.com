#!/usr/bin/env node
/**
 * Takes the pictures Chrome shows in its "Install app" sheet
 * (public/screenshots, listed in src/app/manifest.ts).
 *
 *   npm run screenshots                         # from the live site
 *   npm run screenshots -- http://localhost:3000
 *
 * They are pictures of the real site, taken with the Chrome already on this
 * computer, so they never show anything the site does not. A picture is a
 * moment in time: a car or a price in it will go out of date, so retake them
 * when the stock or the look has changed a lot. Not part of `npm run build`.
 *
 * Chrome is driven over its debugging connection so the page can be given a
 * real phone-sized screen: a headless window cannot be made narrower than
 * about 500 pixels, which is a tablet layout.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const base = (process.argv[2] ?? "https://www.adedayoaremuautos.com").replace(/\/$/, "");
const PORT = 9351;

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
if (!CHROME) {
  console.error("Chrome was not found. Set CHROME_PATH to its program file.");
  process.exit(1);
}

/** [file, page, width, height, scale]: width × scale is the picture's size. */
const SHOTS = [
  ["phone-home.png", "/us", 360, 640, 3],
  ["phone-check.png", "/us/check", 360, 640, 3],
  ["phone-guides.png", "/us/guides", 360, 640, 3],
  ["wide-home.png", "/us", 1280, 720, 1.5],
];

const out = join(root, "public/screenshots");
mkdirSync(out, { recursive: true });
// A throwaway profile: no cookies, no saved cars, nothing of the developer's.
const profile = mkdtempSync(join(tmpdir(), "aaa-shots-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = pages.find((p) => p.type === "page")?.webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  if (!target) throw new Error("Chrome did not start.");

  const socket = new WebSocket(target);
  await new Promise((resolve) => (socket.onopen = resolve));
  let id = 0;
  const waiting = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && waiting.has(data.id)) {
      waiting.get(data.id)(data.result);
      waiting.delete(data.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      waiting.set(++id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  // As a returning visitor sees it: the notification question and the country
  // notice already answered (their own "dismissed" marks, NotifyPrompt.tsx
  // and CountryNotice.tsx), so neither covers the page in the picture.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem("aaa.notify-prompt.dismissed",String(Date.now()));localStorage.setItem("aaa.market-notice.dismissed","1")}catch(e){}`,
  });
  for (const [file, path, width, height, scale] of SHOTS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: width < 700,
    });
    await send("Page.navigate", { url: base + path });
    // Long enough for the photos and fonts of the first screen.
    await sleep(7000);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(out, file), Buffer.from(data, "base64"));
    console.log(`  public/screenshots/${file}  (${width * scale}x${height * scale})  ${base}${path}`);
  }
  socket.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
