// Trail canvas in the Chromium build (B112). The built-in extension in
// Chromium 152 (loaded unpacked with its fixed ID, as in 46-chromium-build):
// every new tab is the canvas; pages read go into the trail; a page becomes a
// card after 20 s on screen or when scrolled by hand, next to the page it
// came from; quick visits stay in the timeline; the trail is kept in
// chrome.storage across restarts; tools, the search card, Share (a
// download), opening a file read only on Replay, and Save as new trail.
// Mosaic and the Gallery wait for the C++ patch (N05).
//
//   NODE_CHROMIUM=/path/to/chrome node test/e2e/47-chromium-canvas.js
// Build the extension first: npm run build:browser-extension
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
const BASE = "http://127.0.0.1:8765";
const ROOT = path.join(__dirname, "..", "..");
const EXT = path.join(ROOT, "browser", "extension", "dist");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "✓" : "✗", name, detail ? `(${detail})` : "");
};
const launch = (profile) =>
  chromium.launchPersistentContext(profile, {
    executablePath: process.env.NODE_CHROMIUM,
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--disable-features=DisableLoadExtensionCommandLineSwitch", "--no-sandbox"],
    viewport: { width: 1400, height: 860 },
    acceptDownloads: true,
  });

(async () => {
  if (!process.env.NODE_CHROMIUM) throw new Error("Set NODE_CHROMIUM to a Chromium 152 binary");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "node-chromium-canvas-"));
  let ctx = await launch(profile);
  await ctx.route(/search\.brave\.com/, (r) => r.fulfill({ contentType: "text/html", body: "<title>Brave results</title><p>results</p>" }));
  let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  const extId = new URL(sw.url()).host;
  const call = (page, op, args) => page.evaluate(async ([op, args]) => (await chrome.runtime.sendMessage({ type: "trail", op, args })).value, [op, args]);

  // Every new tab is the canvas.
  const canvasPage = async () => {
    const p = await ctx.newPage();
    await p.goto("chrome://newtab/");
    await p.waitForSelector("#canvas .cv-vp", { timeout: 10000 });
    await sleep(500);
    return p;
  };
  let cv = await canvasPage();
  check("a new tab is the trail canvas", (await cv.evaluate(() => location.href)).startsWith(`chrome-extension://${extId}/canvas.html`) || (await cv.isVisible("#canvas .cv-vp")), await cv.evaluate(() => location.href));
  check("an empty trail asks what you are looking into", /What are you looking into\?/.test(await cv.textContent("#canvas")) && (await cv.isVisible("#cp-timeline")));

  // Pages read go into the trail. Scrolling by hand by more than half a
  // screen makes a card; the next page in the same tab goes next to it with
  // an "opened from" line.
  const page = await ctx.newPage();
  await page.goto(`${BASE}/big.html`);
  await page.bringToFront();
  await sleep(800);
  await page.mouse.move(400, 400);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 200);
    await sleep(80);
  }
  await sleep(1200);
  let snap = await call(cv, "get");
  const big = snap.cards.find((c) => c.url === `${BASE}/big.html`);
  check("scrolling a page by hand makes it a card", Boolean(big), snap.cards.map((c) => c.url).join(" "));
  await page.goto(`${BASE}/other.html?dwell=1`);
  await page.bringToFront();
  await sleep(21500);
  snap = await call(cv, "get");
  const art = snap.cards.find((c) => c.url === `${BASE}/other.html?dwell=1`);
  check("20 s on screen makes a page a card", Boolean(art));
  check("it comes with an opened-from line to the page before it", snap.lines.some((l) => l.kind === "nav" && l.from === big?.id && l.to === art?.id));
  // A quick visit stays in the timeline with its time on page.
  await page.goto(`${BASE}/other.html?quick=1`);
  await sleep(3000);
  await page.goto(`${BASE}/login.html`);
  await sleep(1500);
  await page.close();
  const tl = (await call(cv, "timeline")).flatMap((s) => s.items);
  const quick = tl.find((i) => i.url === `${BASE}/other.html?quick=1`);
  check("a quick visit stays in the timeline only, with its time on page", quick?.timelineOnly && quick.dwell >= 2000 && quick.dwell <= 4000, JSON.stringify(quick && { only: quick.timelineOnly, dwell: quick.dwell }));
  snap = await call(cv, "get");
  check("sign-in pages never become cards", !snap.cards.some((c) => /login/.test(c.url || "")));

  // The canvas page shows them.
  await cv.bringToFront();
  await sleep(800);
  check("the canvas shows the new cards", (await cv.$$("#canvas .cv-card")).length === (await call(cv, "get")).cards.length && (await cv.$$("#canvas .cv-card")).length === 2, (await call(cv, "get")).cards.map((c) => c.url).join(" "));
  check("the timeline lists the visits, the quick one marked with Put on canvas", (await cv.$$("#cp-timeline .cp-tl-row")).length >= 3 && (await cv.$$("#cp-timeline .cp-tl-row.only .put")).length >= 1);
  await cv.click("#cp-timeline .cp-tl-row.only .put");
  await sleep(800);
  snap = await call(cv, "get");
  check("Put on canvas adds the quick visit as a card", snap.cards.some((c) => c.url === `${BASE}/other.html?quick=1`));

  // Tools: a note, then a link and a group from the store's channels.
  await cv.evaluate(() => trailCanvas.setView({ x: -4000, y: -4000, z: 1 }));
  await cv.evaluate(() => trailCanvas.vp.focus());
  await cv.keyboard.press("n");
  const vpBox = await cv.$eval("#canvas .cv-vp", (e) => e.getBoundingClientRect().toJSON());
  await cv.mouse.click(vpBox.x + vpBox.width / 2, vpBox.y + vpBox.height / 2);
  await cv.keyboard.type("Big pages scroll fast.");
  await cv.keyboard.press("Enter");
  await sleep(800);
  snap = await call(cv, "get");
  const note = snap.cards.find((c) => c.kind === "note");
  check("the Note tool adds a note card", note?.text === "Big pages scroll fast.", JSON.stringify({ tool: await cv.evaluate(() => trailCanvas.tool), kinds: snap.cards.map((c) => c.kind), edit: await cv.evaluate(() => Boolean(document.querySelector("#canvas .cv-edit"))) }));
  if (!note) throw new Error("no note");
  const linked = await call(cv, "link", { from: note.id, to: art.id });
  const grouped = await call(cv, "group", { rect: { x: big.x - 10, y: big.y - 10, w: 700, h: 400 } });
  check("Link and Group write to the trail", linked?.result?.kind === "you" && grouped?.result?.id && grouped.snap.groups.length === 1);

  // Search card (B106).
  await cv.click("#canvas .cv-search input");
  await cv.keyboard.type("starter hydration");
  await cv.keyboard.press("ArrowDown"); // "Search the web" after "Open"? the list decides; pick the search row
  const rows = await cv.$$eval("#canvas .cv-drop-row", (r) => r.map((x) => x.textContent));
  const si = rows.findIndex((t) => /search/i.test(t) && !/private/i.test(t));
  await cv.evaluate((i) => trailCanvas.runDrop(i), si);
  await sleep(1200);
  snap = await call(cv, "get");
  const tabs = await cv.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.url));
  check("a web search adds a search card and opens the results", snap.cards.some((c) => c.kind === "search" && /starter hydration/.test(c.title)) && tabs.some((u) => /search\.brave\.com.*starter/.test(u)), rows.join(" | "));

  // The trail is kept across a restart (chrome.storage).
  const before = (await call(cv, "get")).cards.length;
  await sleep(600);
  await ctx.close();
  ctx = await launch(profile);
  sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  cv = await canvasPage();
  snap = await call(cv, "get");
  check("the trail is still there after a restart", snap.cards.length === before && snap.groups.length === 1 && snap.lines.some((l) => l.kind === "you"), `${snap.cards.length}/${before}`);

  // Share (B108): the file is a download.
  await cv.click("#canvas .cv-act:not([aria-pressed])");
  await cv.waitForSelector("#cp-share[open]", { timeout: 5000 });
  check("Share (top right) opens the sheet with what goes in", /^Always: \d+ cards, 1 group and \d+ links?\.$/.test(await cv.textContent("#cp-share-always")), await cv.textContent("#cp-share-always"));
  await cv.fill("#cp-share-note", "Scroll test trail.");
  await sleep(400);
  check("the preview is the node-trail v2 file with the note", /^node-trail: 2$/m.test(await cv.textContent("#cp-share-preview")) && /^Scroll test trail\.$/m.test(await cv.textContent("#cp-share-preview")));
  const [dl] = await Promise.all([cv.waitForEvent("download"), cv.click("#cp-share-save")]);
  const saved = await dl.path();
  const text = fs.readFileSync(saved, "utf8");
  check("Save file downloads <name>.trail.md", /\.trail\.md$/.test(dl.suggestedFilename()) && /^node-trail: 2$/m.test(text) && !/login/.test(text), dl.suggestedFilename());
  await cv.click("#cp-share-cancel");

  // Open a file read only (B109), on Replay step 1 (B110).
  const sample = fs.readFileSync(path.join(ROOT, "docs", "sourdough-starters.trail.md"), "utf8");
  await cv.evaluate(([n, t]) => window.nodeOpenTrailText(n, t), ["Sourdough starters.trail.md", sample]);
  await sleep(1500);
  let list = await call(cv, "list");
  const opened = list.find((t) => t.current);
  check("an opened file is a read-only trail from its sender", opened?.readonly && opened.from === "Sven" && opened.name === "Sourdough starters");
  check("the sidebar shows Read only, the note and Start here", (await cv.isVisible("#sb-opened")) && (await cv.textContent("#sb-opened-from")) === "from Sven" && /Winter is solved/.test(await cv.textContent("#sb-opened-note")) && (await cv.textContent("#sb-opened-start-name")) === "Does 100% hydration matter?");
  const rp = await cv.evaluate(() => trailCanvas.replay && { i: trailCanvas.replay.i, n: trailCanvas.replay.steps.length, cap: document.querySelector("#canvas .cv-rp-text").textContent });
  check("it starts on Replay step 1 with Sven's caption", rp?.i === 0 && rp.n > 12 && /^Sven /.test(rp.cap), JSON.stringify(rp));
  check("the Replay list takes the timeline's place", (await cv.isVisible("#sb-replay")) && !(await cv.isVisible("#sb-timeline")) && (await cv.textContent("#sb-replay-count")) === `1 / ${rp?.n}`);
  await cv.evaluate(() => trailCanvas.vp.focus());
  await cv.keyboard.press("ArrowRight");
  await sleep(400);
  check("→ steps", (await cv.evaluate(() => trailCanvas.replay?.i)) === 1);
  await cv.keyboard.press("Escape");
  await sleep(300);
  check("Esc ends Replay", (await cv.evaluate(() => trailCanvas.replay)) === null && (await cv.isVisible("#sb-timeline")));
  const moved = await call(cv, "move", { card: "c1", x: 1, y: 1 });
  check("cards in an opened file do not move", moved === null);
  const bad = await cv.evaluate(() => window.nodeOpenTrailText("Bad.trail.md", "---\nnode-trail: 9\nname: X\n---\n"));
  await sleep(300);
  check("a file that does not read opens nothing and says why", /could not be opened\. Bad\.trail\.md: .*newer NODE/.test(await cv.textContent("#cp-msg")) && (await call(cv, "list")).length === list.length);
  await cv.click("#sb-opened-save");
  await sleep(800);
  list = await call(cv, "list");
  const copy = list.find((t) => t.current);
  check("Save as new trail makes an editable copy", copy?.name === "Sourdough starters · Sven" && !copy.readonly && !(await cv.isVisible("#sb-opened")));

  // Mosaic waits for N05: a group's pages open as tabs instead.
  check("the canvas tools are on for your own trails", !(await cv.evaluate(() => trailCanvas.toolsEl.hidden)));

  await ctx.close();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("TEST ERROR", e);
  process.exit(1);
});
