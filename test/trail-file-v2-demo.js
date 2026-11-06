// node-trail v2 files (B108): core/trail-file.js toTrailMd / parseTrailMd.
// Run: npm run test:trailfile
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const T = require("../core/trail-file");

let n = 0;
const ok = (name) => console.log(`ok ${++n} - ${name}`);
const again = (text) => {
  const p = T.parseTrailMd(text);
  return T.toTrailMd(p, { by: p.trail.by, at: p.trail.at, note: p.trail.note, startHere: p.trail.startHere, openTabs: p.openTabs });
};

// The sample (docs/sourdough-starters.trail.md) and the prototype's sample trails.
{
  const files = [path.join(__dirname, "..", "docs", "sourdough-starters.trail.md"), ...fs.readdirSync(path.join(__dirname, "fixtures")).filter((f) => f.endsWith(".trail.md")).map((f) => path.join(__dirname, "fixtures", f))];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n"); // Windows checks the files out with CRLF
    const out = again(text);
    assert.strictEqual(out.trimEnd(), text.trimEnd(), `${path.basename(f)} changed on the way through`);
    assert.strictEqual(again(out), out, `${path.basename(f)}: a second round trip changed it`);
  }
  // An empty trail (the prototype's fourth, "New trail").
  const empty = T.toTrailMd({ trail: { id: "t-new", name: "New trail" }, cards: [], groups: [], lines: [], timeline: [] }, { by: "Sven", at: "2026-11-05T17:30:00Z" });
  assert.strictEqual(again(empty), empty);
  ok(`export → import → export is identical for the sample and the four sample trails (${files.length + 1} files)`);
}

// What the reader gets from the sample.
{
  const p = T.parseTrailMd(fs.readFileSync(path.join(__dirname, "..", "docs", "sourdough-starters.trail.md"), "utf8"));
  assert.strictEqual(p.trail.name, "Sourdough starters");
  assert.strictEqual(p.trail.by, "Sven");
  assert.strictEqual(p.trail.startHere, "q2");
  assert.match(p.trail.note, /Winter is solved/);
  assert.deepStrictEqual(p.groups.map((g) => [g.id, g.label, g.resolved]), [["f1", "Temperature", false], ["f2", "Hydration", false], ["f3", "Rye vs wheat", true]]);
  const q3 = p.cards.find((c) => c.id === "q3");
  assert.strictEqual(q3.status, "resolved");
  assert.strictEqual(q3.conclusion, "rye for the first week, then wheat.");
  const p1 = p.cards.find((c) => c.id === "p1");
  assert.deepStrictEqual([p1.kind, p1.x, p1.y, p1.w, p1.h, p1.keywords.length], ["page", 520, 60, 260, 250, 3]);
  assert.deepStrictEqual(p.lines.filter((l) => l.kind === "you").map((l) => l.label), ["supports", "raises", "", "", "answers"]);
  const only = p.timeline.flatMap((s) => s.items).filter((i) => i.timelineOnly).map((i) => i.title);
  assert.ok(only.includes("Sourdough") && only.length === 4, only.join());
  ok("cards, groups, links, Start here, the note and the timeline come back as written");
}

// From a trail store snapshot: what goes in and what never does.
{
  const snap = {
    trail: { id: "s1", name: "Rye", note: "" },
    cards: [
      { id: "a", kind: "page", url: "https://example.com/rye?utm_source=x&token=SECRET", title: "Rye", keywords: ["rye"], x: 0, y: 0, w: 260, h: 200 },
      { id: "b", kind: "page", url: "https://accounts.example.com/login", title: "Sign in", x: 300, y: 0, w: 260, h: 200 },
      { id: "c", kind: "capture", quote: "Rye ferments fast", source: "example.com", shot: "shot-1.png", url: "https://example.com/rye", x: 0, y: 300, w: 260, h: 210 },
      { id: "d", kind: "page", url: "https://example.com/gone", title: "Gone", removed: true, x: 600, y: 0, w: 260, h: 200 },
      { id: "q", kind: "question", title: "Rye or wheat?", status: "open", replies: [{ by: "Sven", text: "Rye first.", at: 1, replies: [{ by: "Alex", text: "Agreed.", at: 2, replies: [] }] }], x: 600, y: 300, w: 260, h: 170 },
    ],
    groups: [{ id: "g", x: -24, y: -48, w: 308, h: 600, label: "Rye", resolved: false }, { id: "sg", x: 900, y: 0, w: 300, h: 300, label: "Maybe", suggested: true }],
    lines: [
      { id: "l1", from: "a", to: "c", kind: "auto", label: "captured from" },
      { id: "l2", from: "a", to: "b", kind: "nav", label: "" },
      { id: "l3", from: "c", to: "q", kind: "suggested", label: "" },
      { id: "l4", from: "c", to: "q", kind: "you", label: "answers" },
    ],
    timeline: [{ device: "desktop", startAt: Date.UTC(2026, 9, 27, 14), endAt: Date.UTC(2026, 9, 27, 15), items: [{ at: Date.UTC(2026, 9, 27, 14, 30), card: null, title: "Sourdough", timelineOnly: true }, { at: Date.UTC(2026, 9, 27, 14), card: "a", title: "Rye" }] }],
  };
  const text = T.toTrailMd(snap, { by: "Sven", at: Date.UTC(2026, 10, 5), note: "Rye first?", startHere: "q", openTabs: ["a"] });
  assert.ok(!text.includes("utm_source") && !text.includes("SECRET"), "tracking codes and tokens are removed");
  assert.ok(!text.includes("accounts.example.com") && !text.includes("Sign in"), "sign-in pages never go in");
  assert.ok(!text.includes("shot-1.png"), "screenshots stay on the computer");
  assert.ok(!text.includes("example.com/gone"), "removed cards are left out");
  assert.ok(!text.includes("Maybe") && !text.includes("kind:suggested"), "suggested groups and lines are left out");
  assert.ok(text.includes("kind:auto") && text.includes("· drawn · answers"), "links are in");
  assert.match(text, /\d\d:\d\d Sourdough \(timeline only\)/);
  assert.match(text, /^## Open tabs$/m);
  assert.match(text, /^Status: open · 2 replies$/m);
  assert.match(text, /^- Alex: Agreed\.$/m);
  assert.match(text, /^\*\*Start here:\*\* \[Rye or wheat\?\]\(#q\)$/m);
  const back = T.parseTrailMd(text);
  assert.deepStrictEqual(back.cards.map((c) => c.id), ["a", "c", "q"]);
  assert.strictEqual(back.cards[0].url, "https://example.com/rye");
  assert.strictEqual(T.toTrailMd({ ...snap, timeline: [] }, { by: "Sven", at: Date.UTC(2026, 10, 5), timeline: false }).includes("## Timeline"), false);
  ok("from a snapshot: cards, groups, links, timeline and open tabs go in; sign-in pages, removed cards, suggestions and screenshots never do");
}

// Files without layout comments still open.
{
  const text = ["---", "node-trail: 2", "name: By hand", "---", "# By hand", "", "## Ideas", "", "### [A page](https://example.com/a)", "Keywords: a", "", "### ? Why?", "Status: open", "", "### Note", "Remember this.", "", "## Not in a group", "", "### [B page](https://example.com/b)", ""].join("\n");
  const p = T.parseTrailMd(text);
  assert.strictEqual(p.cards.length, 4);
  assert.ok(p.cards.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)), "every card has a place");
  const g = p.groups[0];
  const inside = p.cards.filter((c) => c.x + c.w / 2 >= g.x && c.x + c.w / 2 <= g.x + g.w && c.y + c.h / 2 >= g.y && c.y + c.h / 2 <= g.y + g.h);
  assert.deepStrictEqual(inside.map((c) => c.kind), ["page", "question", "note"], "the group's cards are inside it, in file order");
  const loose = p.cards.find((c) => c.title === "B page");
  assert.ok(loose.y >= g.y + g.h, "loose cards go below the groups");
  ok("a file without layout comments still opens, laid out by group in file order");
}

// Bad files are refused with a message.
{
  const bad = [
    ["", /not a NODE trail file/],
    ["# Just notes\n", /not a NODE trail file/],
    ["---\nname: X\n---\n# X\n", /no "node-trail" line/],
    ["---\nnode-trail: 3\nname: X\n---\n", /newer NODE \(format 3\)/],
    ["---\nnode-trail: 2\n---\n# X\n", /no trail name/],
    ["---\nnode-trail: 2\nname: X\n", /cut short/],
  ];
  for (const [text, msg] of bad) assert.throws(() => T.parseTrailMd(text), msg, JSON.stringify(text));
  ok("bad files are refused with a message");
}

console.log(`\n${n} checks passed`);
