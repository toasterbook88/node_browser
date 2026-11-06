// Replay (B110): core/replay.js. Run: npm run test:replay
// Steps in time order; link and group events at their own times; a caption
// per event type; opened files replay as their sender.
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { TrailStore } = require("../core/trail");
const { memoryStorage } = require("../core/storage");
const { replaySteps, stepCaption, shownAt, dwellText } = require("../core/replay");
const TF = require("../core/trail-file");

let n = 0;
const ok = (name) => console.log(`ok ${++n} - ${name}`);
let clock = Date.parse("2026-11-05T14:00:00Z");
const now = () => clock;
const tick = (ms) => (clock += ms);
const MIN = 60000;

// A trail built step by step, with events at known times.
const store = new TrailStore(memoryStorage(), { now });
const id = store.current().trail.id;
const A = "https://example.com/starters", B = "https://example.com/rye", Q = "https://example.com/quick";
store.visit(id, A, { title: "Why starters fail" });
tick(20000);
const a = store.placePage(id, A, { title: "Why starters fail", reason: "dwell", x: 0, y: 0 });
tick(MIN);
store.visit(id, B, { title: "Rye and enzymes", from: A });
tick(20000);
const b = store.placePage(id, B, { title: "Rye and enzymes", from: A, reason: "dwell", x: 300, y: 0 });
tick(MIN);
store.visit(id, Q, { title: "A quick look" });
tick(4000);
store.bounce(id, Q, 4000);
tick(MIN);
const note = store.freeNote(id, { x: 0, y: 300, text: "Rye helps in winter." });
tick(MIN);
const tLink = clock;
const line = store.link(id, note.id, b.id, { kind: "you", label: "supports" });
tick(MIN);
const tGroup = clock;
const g = store.group(id, { x: -20, y: -60, w: 620, h: 620, label: "Temperature" });
tick(MIN);
store.renameGroup(id, g.id, "Winter");
tick(MIN);
store.resolveGroup(id, g.id, true);
// Moves and removals are not steps.
tick(MIN);
store.moveCard(id, a.id, 10, 10);

const snap = store.snapshot(id);
const steps = replaySteps(snap, store.events(id));
const kinds = steps.map((s) => s.kind);
assert.deepStrictEqual(kinds, ["card", "card", "visit", "card", "link", "group", "rename", "resolve"], kinds.join(" "));
assert.ok(steps.every((s, i) => i === 0 || steps[i - 1].at <= s.at), "time order");
assert.deepStrictEqual(steps.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
ok("steps in time order: cards, a timeline-only visit, a drawn link, a group, its rename, its resolve; moves are not steps");

assert.strictEqual(steps[4].at, tLink);
assert.strictEqual(steps[5].at, tGroup);
assert.strictEqual(steps[0].at, a.placedAt, "a page's step is when it became a card, not the first visit");
ok("link and group events are steps at their own times");

const cap = steps.map((s) => s.caption);
assert.strictEqual(cap[0], "You opened “Why starters fail” on example.com.");
assert.strictEqual(cap[1], "You opened “Rye and enzymes” on example.com, from “Why starters fail”.");
assert.strictEqual(cap[2], "You visited “A quick look” for 4 s. It stayed in the timeline only.");
assert.strictEqual(cap[3], "You wrote a note: “Rye helps in winter.”");
assert.strictEqual(cap[4], "You linked “Rye helps in winter.” to “Rye and enzymes” as “supports”.");
assert.strictEqual(cap[5], "You grouped 3 cards as “Winter”.");
assert.strictEqual(cap[6], "You renamed a group to “Winter”.");
assert.strictEqual(cap[7], "You marked “Winter” resolved.");
ok("a caption per event type (opened, opened from, timeline only, note, link, group, rename, resolve)");

{
  const byId = new Map([
    ["c", { id: "c", kind: "capture", quote: "Below 24 °C activity slows by half", source: "reddit.com/r/Sourdough" }],
    ["r", { id: "r", kind: "report", title: "Rye vs wheat" }],
    ["q", { id: "q", kind: "question", title: "Why do starters fail?", status: "resolved" }],
    ["s", { id: "s", kind: "search", title: "Search: starter temperature" }],
    ["v", { id: "v", kind: "voice", title: "Voice note" }],
    ["p", { id: "p", kind: "page", title: "Levain basics", url: "https://www.kingarthur.com/levain" }],
  ]);
  const lines = [{ id: "l1", from: "p", to: "c", kind: "auto", label: "captured from" }];
  const say = (card, actor = "Sven", seen = ["p", card]) => stepCaption({ kind: "card", card, actor }, { byId, lines, seen: new Set(seen) });
  assert.strictEqual(say("c"), "Sven captured a line from reddit.com/r/Sourdough: “Below 24 °C activity slows by half”. NODE linked it to “Levain basics” (captured from).");
  assert.strictEqual(say("c", "Sven", ["c"]), "Sven captured a line from reddit.com/r/Sourdough: “Below 24 °C activity slows by half”.");
  assert.strictEqual(say("r"), "Sven asked NODE for a report: “Rye vs wheat”.");
  assert.strictEqual(say("q", "me"), "You asked: “Why do starters fail?” (later resolved).");
  assert.strictEqual(say("s"), "Sven searched: “starter temperature”.");
  assert.strictEqual(say("v"), "Sven recorded a voice note.");
  assert.strictEqual(say("p"), "Sven opened “Levain basics” on kingarthur.com.");
  assert.strictEqual(stepCaption({ kind: "resolve", card: "q", actor: "me", conclusion: "Keep it above 24 °C." }, { byId }), "You resolved “Why do starters fail?”: Keep it above 24 °C.");
  assert.strictEqual(stepCaption({ kind: "resolve", card: "q", actor: "me", reopened: true }, { byId }), "You reopened “Why do starters fail?”.".replace("?”.", "?”"));
  assert.strictEqual(stepCaption({ kind: "visit", actor: "Sven", visitTitle: "Sourdough" }, {}), "Sven visited “Sourdough”. It stayed in the timeline only.");
  const media = new Map([
    ["i", { id: "i", kind: "media", media: "image", title: "Crumb", url: "https://www.example.com/bread" }],
    ["s", { id: "s", kind: "media", media: "screenshot", title: "Bread page" }],
    ["v", { id: "v", kind: "media", media: "video", title: "Fold" }],
    ["a", { id: "a", kind: "media", media: "audio", title: "Mic test" }],
  ]);
  const sayM = (card) => stepCaption({ kind: "card", card, actor: "me" }, { byId: media, lines: [], seen: new Set([card]) });
  assert.deepStrictEqual(["i", "s", "v", "a"].map(sayM), ["You saved an image from example.com: “Crumb”.", "You took a screenshot: “Bread page”.", "You saved a video clip: “Fold”.", "You saved audio: “Mic test”."]);
  ok("captions for captures (with NODE's line once both ends show), reports, questions, searches, voice notes, resolves, and media cards (B114)");
}

{
  const at4 = shownAt(steps, 3);
  assert.ok(at4.cards.has(a.id) && at4.cards.has(b.id) && at4.cards.has(note.id));
  assert.ok(!at4.lines.has(line.id), "a drawn line shows from its own step");
  assert.ok(!at4.groups.has(g.id) && at4.stepGroups.has(g.id));
  const at5 = shownAt(steps, 4);
  assert.ok(at5.lines.has(line.id));
  ok("what shows at a step: cards reached, drawn lines once drawn, groups once made");
}

{
  // Sessions: another device or a 30-minute gap starts one.
  tick(45 * MIN);
  store.visit(id, "https://example.com/later", { title: "Later" });
  const s2 = replaySteps(store.snapshot(id), store.events(id));
  const last = s2.at(-1);
  assert.ok(last.kind === "visit" && last.first && last.session === 1 && s2[0].first && s2[0].session === 0);
  assert.ok(s2.slice(1, -1).every((s) => !s.first));
  ok("a new session after a 30-minute gap; each session's first step is marked");
}

{
  // An opened file replays as its sender, from Step 1, in time order.
  const text = fs.readFileSync(path.join(__dirname, "..", "docs", "sourdough-starters.trail.md"), "utf8").replace(/\r\n/g, "\n"); // Windows checks it out with CRLF
  const st = new TrailStore(memoryStorage(), { now });
  const d = st.importFile(TF.parseTrailMd(text), { file: "/x/s.trail.md" });
  const rs = replaySteps(st.snapshot(d.trail.id), st.events(d.trail.id));
  const cardSteps = rs.filter((s) => s.kind === "card");
  assert.strictEqual(cardSteps.length, d.cards.length, "every card is a step");
  assert.ok(rs.every((s, i) => i === 0 || rs[i - 1].at <= s.at));
  assert.ok(rs.every((s) => s.who === "Sven"), "the sender's steps say Sven");
  assert.deepStrictEqual(rs.filter((s) => s.kind === "visit").map((s) => s.caption), [
    "Sven recorded a voice note. It is not on the canvas.",
    "Sven visited “Baker’s percentage calculator”. It stayed in the timeline only.",
    "Sven visited “Sourdough”. It stayed in the timeline only.",
    "Sven visited “Starter smells like nail polish”. It stayed in the timeline only.",
  ]);
  assert.ok(rs.some((s) => s.kind === "link" && /^Sven linked “.+” to “.+”/.test(s.caption)));
  assert.ok(rs.some((s) => s.kind === "group"));
  assert.strictEqual(rs[0].n, 1);
  ok(`the sample file replays as Sven: ${rs.length} steps, every card, its visits, links and groups`);
}

assert.deepStrictEqual([dwellText(4000), dwellText(125000), dwellText(3900000), dwellText(null)], ["4 s", "2 min", "1 h 5 min", ""]);
ok("time on page reads 4 s, 2 min, 1 h 5 min");

{
  // 2,000 events stay quick.
  const big = new TrailStore(memoryStorage(), { now });
  const bid = big.current().trail.id;
  for (let i = 0; i < 400; i++) {
    tick(1000);
    big.visit(bid, `https://example.com/p${i}`, { title: `Page ${i}` });
    if (i % 2) big.placePage(bid, `https://example.com/p${i}`, { title: `Page ${i}`, x: (i % 20) * 300, y: Math.floor(i / 20) * 260 });
  }
  const t0 = Date.now();
  const r = replaySteps(big.snapshot(bid), big.events(bid));
  const ms = Date.now() - t0;
  assert.ok(ms < 500, `${ms} ms`);
  ok(`${r.length} steps from ${big.events(bid).length} events in ${ms} ms`);
}

console.log(`\n${n} checks passed`);
