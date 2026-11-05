// Opening a trail file (B109, handoff step 3). A node-trail v2 file opens as
// a read-only trail on its canvas, with the sender's note and Start here in
// the sidebar. Moving, adding and removing cards say "Read only. Save as new
// trail to change it." Pages read while it is shown are not added to it.
// Opening the same file again goes back to it; a broken file opens nothing.
// Save as new trail makes an editable copy, and the sender's file on disk is
// never changed.
const { _electron: electron } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const path = require("path"), fs = require("fs"), os = require("os"), http = require("http");
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "node-e2e-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "✓" : "✗", name, detail ? `(${detail})` : "");
};
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(`<title>Page ${req.url}</title><body><h1>Page ${req.url}</h1></body>`);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(OUT, "ud-"));
  fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ firstRunDone: true, displayName: "Ada" }));
  // The sender's file, as it arrived.
  const file = path.join(OUT, "Sourdough starters.trail.md");
  fs.copyFileSync(path.join(__dirname, "..", "..", "docs", "sourdough-starters.trail.md"), file);
  const original = fs.readFileSync(file);
  const bad = path.join(OUT, "Broken.trail.md");
  fs.writeFileSync(bad, "---\nnode-trail: 3\nname: From the future\n---\n# From the future\n");

  const app = await electron.launch({ executablePath: require("electron"), args: ["--no-sandbox", `--user-data-dir=${userData}`, path.join(__dirname, "..", "..")] });
  await app.evaluate(() => {
    const o = globalThis.fetch;
    globalThis.fetch = async (u, opt) => (/wikipedia|duckduckgo|brave\.com/.test(String(u)) ? new Response("{}", { status: 200 }) : o(u, opt));
  });
  const ui = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await sleep(1500);
  const list = () => ui.evaluate(() => window.scout.trailList());
  const before = (await list()).length;

  await app.evaluate((_e, f) => global.nodeTest.openSharedTrail(f), file);
  await ui.waitForSelector("#canvas:not([hidden]) .cv-card", { timeout: 8000 });
  await sleep(800);
  let trails = await list();
  const opened = trails.find((t) => t.current);
  check("the file opens as a new trail, on its canvas", trails.length === before + 1 && opened?.name === "Sourdough starters" && (await ui.isVisible("#canvas")));
  check("it is read only, from the sender", opened?.readonly === true && opened?.from === "Sven");
  let snap = await ui.evaluate(() => window.scout.trailGet());
  check("all 12 cards, 3 groups and 8 links come in", snap.cards.filter((c) => !c.removed).length === 12 && snap.groups.length === 3 && snap.lines.length === 8, `${snap.cards.length}/${snap.groups.length}/${snap.lines.length}`);
  check("the sender's history comes in as events", JSON.stringify(await ui.evaluate(() => window.scout.trailTimeline())).includes("Why do starters fail in winter?"));
  await ui.evaluate(() => paintSide(true));
  await sleep(600);
  check("the sidebar says Read only, from Sven", (await ui.isVisible("#sb-opened")) && (await ui.textContent("#sb-opened-from")) === "from Sven");
  check("the sender's note is shown", /^Winter is solved\. Still stuck on hydration\./.test(await ui.textContent("#sb-opened-note")));
  check("Start here names the chosen card", (await ui.isVisible("#sb-opened-start")) && (await ui.textContent("#sb-opened-start-name")) === "Does 100% hydration matter?", await ui.textContent("#sb-opened-start-name"));
  await ui.click("#sb-opened-start");
  await sleep(500);
  check("Start here selects that card on the canvas", (await ui.evaluate(() => trailCanvas.selected)) === "q2");
  check("the canvas tools and Remove from canvas are hidden", (await ui.evaluate(() => trailCanvas.toolsEl.hidden && trailCanvas.selRemove.hidden)));

  // Trying to move a card: it stays, and the canvas says why.
  const id = snap.cards.find((c) => c.kind === "page").id;
  const at = snap.cards.find((c) => c.id === id);
  const r = await ui.evaluate((id) => document.querySelector(`#canvas .cv-card[data-id="${id}"]`).getBoundingClientRect().toJSON(), id);
  await ui.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await ui.mouse.down();
  await ui.mouse.move(r.x + r.width / 2 + 120, r.y + r.height / 2 + 80, { steps: 8 });
  const said = await ui.evaluate(() => document.querySelector(".cv-readonly-msg")?.classList.contains("on") && document.querySelector(".cv-readonly-msg").textContent);
  await ui.mouse.up();
  await sleep(500);
  snap = await ui.evaluate(() => window.scout.trailGet());
  const now = snap.cards.find((c) => c.id === id);
  check("dragging a card says Read only. Save as new trail to change it.", said === "Read only. Save as new trail to change it.", String(said));
  check("the card does not move", now.x === at.x && now.y === at.y);
  const blocked = await ui.evaluate(async (u) => {
    const s = window.scout;
    return [await s.trailMove(snap0(), 10, 10), await s.trailPlace({ url: u }), await s.trailRemove?.(snap0())];
    function snap0() {
      return trailCanvas.data.cards[0].id;
    }
  }, `${BASE}/new`);
  check("move, put on canvas and remove do nothing", blocked.every((x) => !x), JSON.stringify(blocked.map(Boolean)));

  // A page read while the file is shown is not added to it.
  await ui.evaluate((u) => window.scout.researchVisit(u, "Visited later", []), `${BASE}/visited`);
  await sleep(1200);
  const rows = await ui.evaluate(() => window.scout.trailTimeline());
  check("pages read are not recorded into it", !JSON.stringify(rows).includes("/visited"));

  // Opening it again goes back to the same trail. A broken file opens nothing.
  await app.evaluate((_e, f) => global.nodeTest.openSharedTrail(f), file);
  await sleep(800);
  check("opening the same file again does not add a trail", (await list()).length === before + 1);
  const res = await app.evaluate((_e, f) => global.nodeTest.openSharedTrail(f), bad);
  await sleep(800);
  check("a file that does not read opens nothing and says why", res.ok === false && (await list()).length === before + 1 && /could not be opened/.test(await ui.textContent("#shared-title")) && /Broken\.trail\.md: .*newer NODE/.test(await ui.textContent("#shared-summary")), await ui.textContent("#shared-summary"));
  await ui.keyboard.press("Escape");
  await sleep(300);

  // Save as new trail.
  await ui.evaluate(() => document.getElementById("sb-opened-save").click());
  await sleep(1500);
  trails = await list();
  const copy = trails.find((t) => t.current);
  check("Save as new trail makes an editable copy and switches to it", trails.length === before + 2 && copy?.name === "Sourdough starters · Sven" && !copy.readonly, copy?.name);
  snap = await ui.evaluate(() => window.scout.trailGet());
  check("the copy has the same cards, groups and links", snap.cards.filter((c) => !c.removed).length === 12 && snap.groups.length === 3 && snap.lines.length === 8);
  await ui.evaluate(() => paintSide(true));
  await sleep(600);
  check("the copy is not read only: tools show, the sidebar block goes", !(await ui.isVisible("#sb-opened")) && !(await ui.evaluate(() => trailCanvas.toolsEl.hidden)));
  const moved = await ui.evaluate(async (id) => (await window.scout.trailMove(id, 2000, 2000))?.snap?.cards.find((c) => c.id === id), id);
  check("cards in the copy move", moved?.x === 2000 && moved?.y === 2000);
  check("the opened file is still read only and unchanged", (await ui.evaluate(async (tid) => (await window.scout.trailGet(tid)).cards.find((c) => c.id === "c1").x, opened.id)) === 520 && trails.find((t) => t.id === opened.id)?.readonly);
  check("the sender's file on disk is unchanged", Buffer.compare(fs.readFileSync(file), original) === 0);

  await app.close();
  server.close();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
