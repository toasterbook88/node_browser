// Sharing a trail as a file. Since B108 the file is node-trail v2 (doc 26):
// File → Share Trail… opens the sheet in Menu → Trail with a note, Start here
// (the open question chosen), what goes in (cards, groups and links always;
// the timeline on; open tabs off), a preview, and Save File. Private address
// parts, tracking codes and sign-in pages stay out; the file reads back as the
// same canvas. The per-page ticks now only apply to share links (B82), which
// are hidden without the share server. The trail has three pages recorded by
// hand (two put on the canvas) and the open tab's page.
const { _electron: electron } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
const T = require("../../core/trail-file");
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "node-e2e-"));
const BASE = "http://127.0.0.1:8765";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "✓" : "✗", name, detail ? `(${detail})` : "");
};
const userData = fs.mkdtempSync(path.join(OUT, "ud-"));
fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ firstRunDone: true, displayName: "Sven" }));
const saved = path.join(OUT, "Sourdough.trail.md");

(async () => {
  // No share server here (a closed port): Create Link stays hidden.
  const app = await electron.launch({ executablePath: require("electron"), args: ["--no-sandbox", `--user-data-dir=${userData}`, path.join(__dirname, "..", "..")], env: { ...process.env, NODE_SHARE_API: "http://127.0.0.1:9" } });
  await app.evaluate(() => {
    const o = globalThis.fetch;
    globalThis.fetch = async (u, opt) => (/wikipedia|duckduckgo|brave\.com/.test(String(u)) ? new Response("{}", { status: 200 }) : o(u, opt));
  });
  const ui = await app.firstWindow();
  await sleep(1800);
  await app.evaluate((_e, p) => global.nodeTest.setTrailSavePath(p), saved);
  await ui.evaluate(async () => {
    const s = window.scout;
    await s.researchRename("Sourdough");
    await s.researchVisit("https://example.com/starters?utm_source=x&page=2", "Why starters fail", ["hydration"]);
    await s.researchVisit("https://example.com/private?token=SECRET123&id=4", "Private one", []);
    await s.researchVisit("https://example.com/rye", "Rye and enzymes", ["hydration"]);
    let snap = await s.threadAdd({ title: "Why do starters fail in winter?", tags: ["temperature"], pages: ["https://example.com/rye", "https://example.com/starters?utm_source=x&page=2"] });
    const t = snap.threadList[0];
    snap = await s.threadReply(t.id, "", "Below 24 °C it goes dormant.");
    await s.threadReply(t.id, snap.threadList[0].replies[0].id, "Rye flour helps.");
    await s.noteAdd("https://example.com/rye", "Good on enzymes.");
  });
  await ui.evaluate((u) => window.scout.createTab(u), `${BASE}/other.html?n=open`);
  // Wait until the open tab's page is in the trail too (4 pages).
  for (let i = 0; i < 40 && (await ui.evaluate(async () => (await window.scout.researchGet()).trail.length)) < 4; i++) await sleep(250);

  // Two pages on the canvas, one with a token and tracking codes in its address.
  await ui.evaluate(async () => {
    await window.scout.trailPlace({ url: "https://example.com/starters?utm_source=x&page=2" });
    await window.scout.trailPlace({ url: "https://example.com/private?token=SECRET123&id=4" });
    await window.scout.trailPlace({ url: "http://127.0.0.1:8765/other.html?n=open" });
  });
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((m) => m.label === "File").submenu.items.find((i) => i.label === "Share Trail…").click());
  await sleep(1200);
  check("File → Share Trail… opens the sheet in Menu → Trail", (await ui.isVisible("#share-sheet")) && (await ui.isVisible("#trail-pane")));
  check("it says what always goes in: cards, groups and links", /^Always: 5 cards, 0 groups and \d+ links?\.$/.test(await ui.textContent("#share-always")), await ui.textContent("#share-always"));
  check("Start here: the open question is chosen", (await ui.$eval("#share-start", (s) => s.options[s.selectedIndex].textContent)) === "Why do starters fail in winter?");
  check("the timeline is on, with the pages not on the canvas counted", (await ui.isChecked("#share-timeline")) && /4 pages read, 1 of them not on the canvas/.test(await ui.textContent("#share-timeline-label")), await ui.textContent("#share-timeline-label"));
  check("open tabs are off by default", !(await ui.isChecked("#share-tabs")) && /\(1\)/.test(await ui.textContent("#share-tabs-label")), await ui.textContent("#share-tabs-label"));
  check("without the share server, the share link part is hidden", !(await ui.isVisible("#share-link-box")) && (await ui.isVisible("#share-save")));
  await ui.fill("#share-note", "Winter is solved. Still stuck on hydration.");
  await ui.click(".share-preview summary");
  await sleep(500);
  check("the preview shows the file with the note", /^Winter is solved\. Still stuck on hydration\.$/m.test(await ui.textContent("#share-preview-text")));
  await ui.click("#share-save");
  await sleep(800);
  check("Save File writes the file and says what is in it", fs.existsSync(saved) && /^Saved: Sourdough\.trail\.md · 5 cards, \d+ links?\./.test(await ui.textContent("#share-msg")), await ui.textContent("#share-msg"));

  const text = fs.readFileSync(saved, "utf8");
  const back = T.parseTrailMd(text);
  check("the file is node-trail v2 with the name, sender, note and Start here", /^node-trail: 2$/m.test(text) && back.trail.name === "Sourdough" && back.trail.by === "Sven" && /Winter is solved/.test(back.trail.note) && back.cards.find((c) => c.id === back.trail.startHere)?.kind === "question");
  check("tracking codes and private tokens are removed", !text.includes("utm_source") && !text.includes("SECRET123") && back.cards.some((c) => c.url === "https://example.com/private?id=4"));
  check("the question goes in with its latest reply", /^### \? Why do starters fail in winter\?$/m.test(text) && /^Status: open · 2 replies$/m.test(text) && /^- Sven: Rye flour helps\.$/m.test(text), text.match(/Status:.*\n.*/)?.[0]);
  check("the timeline lists the pages, the ones not on the canvas marked", /^## Timeline$/m.test(text) && /Rye and enzymes \(timeline only\)/.test(text));
  check("open tabs are left out unless ticked", !/^## Open tabs$/m.test(text));
  await ui.check("#share-tabs");
  await sleep(400);
  check("ticked, open tabs go in", /^## Open tabs$/m.test(await ui.textContent("#share-preview-text")) && /other\.html\?n=open/.test(await ui.textContent("#share-preview-text")));
  check("the file reads as plain Markdown", /^# Sourdough$/m.test(text) && /^## Not in a group$/m.test(text) && /^## Links$/m.test(text));
  check("the file reads back as the same canvas", T.toTrailMd(back, { by: back.trail.by, at: back.trail.at, note: back.trail.note, startHere: back.trail.startHere }) === text);

  await ui.click("#share-cancel");
  check("Cancel closes the sheet", !(await ui.isVisible("#share-sheet")));
  await app.close();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
