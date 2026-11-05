// Opens NODE on a trail with 200 page cards and 20 questions, to try the
// canvas by hand (pan, zoom, Fit) and check it runs at 60 fps. Uses its own
// data folder in the system temp folder, so your own trails are not touched.
// Run: npm run try:canvas
// Add --fps to show Chromium's frame counter in the top corner.
const { spawn } = require("child_process");
const path = require("path"), fs = require("fs"), os = require("os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "node-canvas-"));
fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ firstRunDone: true }));
fs.mkdirSync(path.join(dir, "sessions"));
const t0 = Date.parse("2026-10-27T14:00:00Z");
// Read twice each, so the migration makes every page a card.
const pages = Array.from({ length: 200 }, (_, i) => ({
  url: `https://example.com/p${i + 1}`,
  title: `Page ${i + 1} about sourdough starters and how they behave`,
  firstAt: t0 + i * 60000,
  lastAt: t0 + i * 60000 + 30000,
  visits: 2,
  keywords: ["starter", "levain", "hydration"],
}));
const threads = Array.from({ length: 20 }, (_, i) => ({
  id: `t${i}`,
  title: `Question ${i + 1}`,
  status: i % 4 ? "open" : "resolved",
  conclusion: "",
  tags: [],
  pages: pages.slice(i * 9, i * 9 + 3).map((p) => p.url),
  by: "Sven",
  at: t0,
  replies: [{ by: "Sven", text: "Still reading.", at: t0 + 3600000 }],
}));
fs.writeFileSync(path.join(dir, "sessions", "s-big.json"), JSON.stringify({ id: "s-big", name: "200 cards", started: t0, updated: t0 + 86400000, pins: [], trail: pages, opened: [], dismissed: [], threadList: threads }));
fs.writeFileSync(path.join(dir, "sessions", "current.txt"), "s-big");

console.log(`Data folder: ${dir}`);
const args = [path.join(__dirname, ".."), `--user-data-dir=${dir}`];
if (process.getuid?.() === 0) args.unshift("--no-sandbox"); // Linux containers only
if (process.argv.includes("--fps")) args.push("--show-fps-counter");
spawn(require("electron"), args, { stdio: "inherit" }).on("exit", (code) => process.exit(code || 0));
