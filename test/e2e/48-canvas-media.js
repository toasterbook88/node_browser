// Library media on the canvas (B114). Image, video and audio files dropped
// from the computer go into the Library and become media cards where they
// were dropped, side by side; other files are skipped. Images show, video
// and audio play on the card (one at a time), double-click opens the viewer.
// Put on canvas and dragging a Library item onto the canvas place it. Media
// saved from a page (Capture → media) comes in next to the page with a
// captured-from line. In a shared file a media card links to where it came
// from, and the reader's card previews it from there; files from the
// computer stay behind. Read-only trails take no new media.
const { _electron: electron } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
const T = require("../../core/trail-file");
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "node-e2e-"));
const BASE = "http://127.0.0.1:8765";
const SITE = path.join(__dirname, "site");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(ok ? "✓" : "✗", name, detail ? `(${detail})` : "");
};
const userData = fs.mkdtempSync(path.join(OUT, "ud-"));
fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ firstRunDone: true, displayName: "Sven" }));
// Files on "the computer": a 32×32 PNG, the test video and tone, and a text file.
const desk = fs.mkdtempSync(path.join(OUT, "desk-"));
fs.copyFileSync(path.join(__dirname, "..", "..", "browser", "extension", "src", "ui", "icons", "png", "suggest-on-dark-32.png"), path.join(desk, "Crumb shot.png"));
fs.copyFileSync(path.join(SITE, "clip.webm"), path.join(desk, "Fold.webm"));
fs.copyFileSync(path.join(SITE, "tone.wav"), path.join(desk, "Mic test.wav"));
fs.writeFileSync(path.join(desk, "notes.txt"), "hello");
const saved = path.join(OUT, "Media.trail.md");

(async () => {
  const app = await electron.launch({ executablePath: require("electron"), args: ["--no-sandbox", `--user-data-dir=${userData}`, path.join(__dirname, "..", "..")] });
  await app.evaluate(() => {
    const o = globalThis.fetch;
    globalThis.fetch = async (u, opt) => (/wikipedia|duckduckgo|brave\.com/.test(String(u)) ? new Response("{}", { status: 200 }) : o(u, opt));
  });
  const ui = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await sleep(1800);
  await app.evaluate((_e, p) => global.nodeTest.setTrailSavePath(p), saved);
  await ui.evaluate(() => window.scout.researchRename("Media"));
  await ui.evaluate(() => window.scout.canvasShow?.());
  await sleep(800);
  const snap = () => ui.evaluate(() => window.scout.trailGet());
  const media = async () => (await snap()).cards.filter((c) => c.kind === "media" && !c.removed);

  // Drop from the computer.
  const files = ["Crumb shot.png", "Fold.webm", "Mic test.wav", "notes.txt"].map((f) => path.join(desk, f));
  const res = await ui.evaluate((paths) => window.scout.libraryImportPaths(paths, { x: 100, y: 100 }), files);
  await ui.evaluate(() => refreshCanvasData());
  await sleep(1200);
  let m = await media();
  const img = m.find((c) => c.media === "image"), vid = m.find((c) => c.media === "video"), aud = m.find((c) => c.media === "audio");
  check("dropped image, video and audio become media cards; the text file is skipped", m.length === 3 && img && vid && aud && res.skipped.join() === "notes.txt", JSON.stringify(res.skipped));
  check("they go where they were dropped, side by side", img.x === 100 && img.y === 100 && vid.x === img.x + img.w + 24 && aud.x === vid.x + vid.w + 24, JSON.stringify(m.map((c) => [c.x, c.y])));
  check("they keep the file's name and are in the Library", img.title === "Crumb shot" && (await ui.evaluate(() => window.scout.libraryList())).filter((r) => r.media).length === 3);
  await ui.evaluate(() => trailCanvas.fit(false));
  await sleep(700);
  const shown = await ui.evaluate(() => {
    const q = (id, s) => document.querySelector(`#canvas .cv-card[data-id="${id}"] ${s}`);
    return { ids: [...document.querySelectorAll("#canvas .cv-card.media")].map((e) => e.dataset.id) };
  });
  const imgOk = await ui.waitForFunction((id) => document.querySelector(`#canvas .cv-card[data-id="${id}"] .cv-media-img`)?.naturalWidth === 32, img.id, { timeout: 8000 }).then(() => true, () => false);
  check("the image shows on its card", imgOk && shown.ids.length === 3);
  const vidOk = await ui.waitForFunction((id) => document.querySelector(`#canvas .cv-card[data-id="${id}"] video`)?.readyState >= 1, vid.id, { timeout: 8000 }).then(() => true, () => false);
  const audText = await ui.waitForFunction((id) => /^0:00 \/ 0:0\d$/.test(document.querySelector(`#canvas .cv-card[data-id="${id}"] .cv-audio-time`)?.textContent || "") && document.querySelector(`#canvas .cv-card[data-id="${id}"] .cv-audio-time`).textContent, aud.id, { timeout: 8000 }).then((h) => h.jsonValue(), () => "");
  check("the video card shows its first frame with Play; the audio card a player with its length", vidOk && (await ui.isVisible(`#canvas .cv-card[data-id="${vid.id}"] .cv-media-play`)) && Boolean(audText), audText);

  // Play on the card, one at a time.
  await ui.click(`#canvas .cv-card[data-id="${vid.id}"] .cv-media-play`);
  await sleep(700);
  const vPlaying = await ui.evaluate((id) => !document.querySelector(`#canvas .cv-card[data-id="${id}"] video`).paused, vid.id);
  await ui.click(`#canvas .cv-card[data-id="${aud.id}"] .cv-audio-btn`);
  await sleep(700);
  const after = await ui.evaluate(([v, a]) => ({ v: document.querySelector(`#canvas .cv-card[data-id="${v}"] video`).paused, a: !document.querySelector(`#canvas .cv-card[data-id="${a}"] audio`).paused, btn: document.querySelector(`#canvas .cv-card[data-id="${a}"] .cv-audio-btn`).textContent }), [vid.id, aud.id]);
  check("video plays on its card; starting the audio pauses it (one at a time)", vPlaying && after.v && after.a && after.btn === "Pause", JSON.stringify({ vPlaying, ...after }));
  // A redraw (another card arrives) does not stop it.
  await ui.evaluate(() => window.scout.trailNote?.({ x: 100, y: 600, text: "Fold at 24 °C." }));
  await ui.evaluate(() => refreshCanvasData());
  await sleep(600);
  check("a redraw of the canvas keeps it playing", await ui.evaluate((a) => !document.querySelector(`#canvas .cv-card[data-id="${a}"] audio`).paused, aud.id));
  await ui.click(`#canvas .cv-card[data-id="${aud.id}"] .cv-audio-btn`);

  // Viewer.
  await ui.dblclick(`#canvas .cv-card[data-id="${img.id}"] .cv-card-title`);
  await sleep(500);
  const vw = await ui.evaluate(() => document.querySelector("#canvas .cv-viewer img")?.getBoundingClientRect().width || 0);
  check("double-click opens the viewer with the image large", (await ui.isVisible("#canvas .cv-viewer")) && vw > 300, `${vw} px wide`);
  await ui.keyboard.press("Escape");
  await sleep(300);
  check("Esc closes the viewer", !(await ui.isVisible("#canvas .cv-viewer")));

  // Put on canvas from the Library, and dragging from the Library.
  await ui.evaluate((id) => window.scout.trailRemove(id), img.id);
  await ui.evaluate((id) => window.scout.trailRemove(id), vid.id);
  await ui.evaluate(() => refreshCanvasData());
  await sleep(500);
  await ui.evaluate(() => openLibrary());
  await sleep(800);
  const putBtn = ui.locator("#library-list .poster", { hasText: "Crumb shot" }).locator("button", { hasText: "Put on canvas" });
  check("Library items show Put on canvas", (await putBtn.count()) === 1);
  await putBtn.click();
  await sleep(1200);
  m = await media();
  check("Put on canvas brings the image back as the same card", m.some((c) => c.id === img.id) && !(await ui.isVisible("#menu-overlay.open")));
  // Pan first, so where it lands differs from where it was.
  await ui.evaluate(() => trailCanvas.setView({ x: trailCanvas.v.x + 137, y: trailCanvas.v.y + 59, z: trailCanvas.v.z }));
  await ui.evaluate(() => openLibrary());
  await sleep(800);
  const vb = await ui.locator("#canvas .cv-vp").boundingBox();
  // Drag with the mouse: the Menu covers the canvas until the drag starts.
  const src = await ui.locator("#library-list .poster", { hasText: "Fold" }).locator(".meta strong").boundingBox();
  await ui.mouse.move(src.x + 10, src.y + 5);
  await ui.mouse.down();
  await ui.mouse.move(src.x + 40, src.y + 40, { steps: 4 });
  await sleep(300);
  await ui.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2, { steps: 10 });
  await sleep(200);
  await ui.mouse.up();
  await sleep(1200);
  m = await media();
  const v2 = m.find((c) => c.id === vid.id);
  const want = await ui.evaluate(() => {
    const r = trailCanvas.vp.getBoundingClientRect();
    return { x: Math.round((r.width / 2 - trailCanvas.v.x) / trailCanvas.v.z - 150), y: Math.round((r.height / 2 - trailCanvas.v.y) / trailCanvas.v.z - 120) };
  });
  check("dragging a Library item onto the canvas places it there", v2 && Math.abs(v2.x - want.x) < 4 && Math.abs(v2.y - want.y) < 4, JSON.stringify({ at: v2 && [v2.x, v2.y], want }));
  check("the Menu gets out of the way for the drop and closes", !(await ui.isVisible("#menu-overlay.open")));

  // Media saved from a page: next to the page, with a captured-from line.
  await ui.evaluate((u) => window.scout.createTab(u), `${BASE}/other.html?n=media`);
  await sleep(1500);
  const tabId = await ui.evaluate(() => activeId);
  await ui.evaluate(([id, u]) => window.scout.grabMedia(id, u), [tabId, `${BASE}/clip.webm`]);
  await sleep(1500);
  let s = await snap();
  const grabbed = s.cards.find((c) => c.kind === "media" && c.src === `${BASE}/clip.webm`);
  const pageCard = s.cards.find((c) => c.kind === "page" && /other\.html\?n=media/.test(c.url));
  check("media saved from a page is a video card with where it came from", grabbed?.media === "video" && /^Video from 127\.0\.0\.1/.test(grabbed.title), JSON.stringify(grabbed && { t: grabbed.title, src: grabbed.src }));
  check("it is linked to the page it was saved from", pageCard && s.lines.some((l) => l.from === pageCard.id && l.to === grabbed?.id && l.kind === "auto"));
  const steps = await ui.evaluate(() => window.scout.trailReplay());
  check("Replay says what was saved", steps.some((x) => /^Sven saved a video clip from 127\.0\.0\.1/.test(x.caption) || /^You saved a video clip from 127\.0\.0\.1/.test(x.caption)), steps.map((x) => x.caption).filter((c) => /saved/.test(c)).join(" | "));

  // Share as a file: links to the origin; files from the computer stay behind.
  const text = await ui.evaluate(() => window.scout.trailShareText({ timeline: true }));
  check("in the file, saved media links to where it came from", new RegExp(`^### \\[Video from 127\\.0\\.0\\.1[^\\]]*\\]\\(${BASE.replace(/[.]/g, "\\.")}/clip\\.webm\\) · video clip$`, "m").test(text) && /^From \[127\.0\.0\.1\]/m.test(text));
  check("files from the computer stay behind, and the file says so", /^### Image: Crumb shot$/m.test(text) && /^### Audio: Mic test$/m.test(text) && /The file stayed on the sender's computer\./.test(text) && !/scoutlib|media-\d{8}|Crumb shot\.png|"lib"/.test(text));
  fs.writeFileSync(saved, text);

  // The reader: the video previews from where it came from.
  await app.evaluate((_e, f) => global.nodeTest.openSharedTrail(f), saved);
  await sleep(2500);
  await ui.keyboard.press("Escape"); // leave Replay
  await sleep(400);
  s = await snap();
  const rv = s.cards.find((c) => c.kind === "media" && c.src === `${BASE}/clip.webm`);
  check("an opened file has the media cards, read only", s.trail.readonly && s.cards.filter((c) => c.kind === "media").length === 4 && rv && !rv.lib);
  const remoteOk = await ui.waitForFunction((id) => document.querySelector(`#canvas .cv-card[data-id="${id}"] video`)?.readyState >= 1, rv?.id, { timeout: 8000 }).then(() => true, () => false);
  check("the reader's video card previews it from where it came from", remoteOk && (await ui.evaluate((id) => document.querySelector(`#canvas .cv-card[data-id="${id}"] video`).src, rv?.id)) === `${BASE}/clip.webm`);
  const stayed = s.cards.find((c) => c.kind === "media" && c.media === "image");
  check("a file from the sender's computer shows that it stayed with them", /stayed with the sender/.test(await ui.textContent(`#canvas .cv-card[data-id="${stayed?.id}"] .cv-media`)));
  const ro = await ui.evaluate((paths) => window.scout.libraryImportPaths(paths, { x: 0, y: 0 }), [path.join(desk, "Crumb shot.png")]);
  await sleep(500);
  check("a read-only trail takes no new media", ro.placed.length === 0 && (await snap()).cards.filter((c) => c.kind === "media").length === 4);

  await app.close();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
