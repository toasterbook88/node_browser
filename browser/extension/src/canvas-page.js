// The trail canvas as a NODE page in the Chromium build (B112). Every new tab
// opens it. The canvas is the Electron build's renderer/canvas.js
// (window.TrailCanvas); the trail store runs in the service worker
// (trail-service.js). This page wires the two: each canvas action sends a
// { type: "trail", op, args } message and draws the snapshot that comes back.
import { normalizeUrl } from "../../../core/urls.js";

const $ = (id) => document.getElementById(id);
const call = async (op, args) => {
  const r = await chrome.runtime.sendMessage({ type: "trail", op, args });
  if (!r?.ok) throw new Error(r?.error || "No answer from NODE");
  return r.value;
};
const canvasEl = $("canvas");
let trails = [];

// ---- tabs ----
async function openUrl(url) {
  const [have] = await chrome.tabs.query({ url: url.replace(/#.*$/, "") }).catch(() => []);
  if (have) {
    await chrome.tabs.update(have.id, { active: true });
    await chrome.windows.update(have.windowId, { focused: true }).catch(() => {});
  } else await chrome.tabs.create({ url });
}

// ---- the canvas ----
const canvas = new window.TrailCanvas(
  canvasEl,
  { trailView: (patch) => call("view", { patch, size: { w: canvasEl.clientWidth, h: canvasEl.clientHeight } }).catch(() => {}) },
  {
    open: (card) => card.url && openUrl(card.url),
    search: (text) => chrome.tabs.create({ url: normalizeUrl(text) }),
    pickTrail: (id) => goTrail(id),
    put: async (o) => (await call("place", o)) && refresh(),
    remove: async (id) => (await call("remove", { card: id })) && refresh(),
    move: (card, x, y) => call("move", { card, x, y }),
    groupMove: (group, x, y) => call("groupMove", { group, x, y }),
    link: (from, to) => call("link", { from, to }),
    linkLabel: (line, label) => call("linkLabel", { line, label }),
    unlink: (line) => call("unlink", { line }).then((r) => (refresh(), r)),
    group: (rect) => call("group", { rect }),
    groupRename: (group, label) => call("groupRename", { group, label }),
    question: (o) => call("question", o),
    note: (o) => call("note", o),
    // Mosaic and the Gallery need the C++ patch (N05); until then a group's
    // pages open as tabs.
    mosaic: async (ids) => {
      const urls = (canvas.data?.cards || []).filter((c) => ids.includes(c.id) && c.url).map((c) => c.url);
      for (const u of urls) await chrome.tabs.create({ url: u, active: false });
      canvas.say(`Opened ${urls.length} ${urls.length === 1 ? "page" : "pages"} in tabs. Mosaic comes with a later build.`);
    },
    webSearch: async (q) => (await call("search", { query: q })) && refresh(),
    privateSearch: (q) => chrome.windows.create({ url: normalizeUrl(q), incognito: true }).catch(() => canvas.say("Private windows are off for NODE in this browser.")),
    ask: () => canvas.say("Ask about this trail comes with the side panel (N02)."),
    replay: () => startReplay(0),
    share: () => openShare(),
    replayChanged: (state) => paintReplayList(state),
  },
);
window.trailCanvas = canvas; // for the tests

let refreshTimer = null;
async function refresh() {
  const [snap, list, timeline] = await Promise.all([call("get"), call("list"), call("timeline")]);
  trails = list;
  if (canvas.replay && snap.trail.id !== canvas.data?.trail?.id) canvas.endReplay();
  const keep = canvas.data?.trail?.id === snap.trail.id ? { ...canvas.v } : null;
  canvas.show(snap, {});
  if (keep) canvas.setView(keep, { save: false });
  paintSwitch();
  paintOpened();
  paintTimeline(timeline);
  return snap;
}
const refreshSoon = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 150);
};
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "trail-changed" && !canvas.replay) refreshSoon();
});
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && !canvas.replay && refreshSoon());

// ---- trail switcher ----
function paintSwitch() {
  const sel = $("cp-trail");
  sel.textContent = "";
  for (const t of trails) {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = t.readonly ? `${t.name} (read only)` : t.name;
    o.selected = Boolean(t.current);
    sel.append(o);
  }
}
async function goTrail(id) {
  canvas.endReplay();
  await call("switch", { id });
  return refresh();
}
$("cp-trail").addEventListener("change", (e) => goTrail(e.target.value));
$("cp-new").addEventListener("click", async () => {
  canvas.endReplay();
  await call("new", { name: "New trail" });
  await refresh();
  canvas.focusSearch();
});

// ---- opened files (B109) ----
function say(text) {
  const m = $("cp-msg");
  m.textContent = text;
  m.hidden = !text;
}
function paintOpened() {
  const t = trails.find((x) => x.current);
  const box = $("sb-opened");
  box.hidden = !t?.readonly;
  if (box.hidden) return;
  $("sb-opened-from").textContent = t.from ? `from ${t.from}` : "";
  $("sb-opened-note").textContent = t.note || "";
  $("sb-opened-note").hidden = !t.note;
  $("sb-opened-start").hidden = !t.startTitle;
  $("sb-opened-start-name").textContent = t.startTitle || "";
}
async function openText(name, text) {
  say("");
  const r = await call("openFile", { name, text });
  if (!r.ok) return say(`This file could not be opened. ${r.error}`);
  await refresh();
  startReplay(0);
}
async function openFile(file) {
  if (!file) return;
  openText(file.name, await file.text());
}
$("cp-open").addEventListener("click", () => $("cp-file").click());
$("cp-file").addEventListener("change", (e) => {
  openFile(e.target.files[0]);
  e.target.value = "";
});
document.addEventListener("dragover", (e) => {
  if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
});
document.addEventListener("drop", (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  e.preventDefault();
  openFile(f);
});
$("sb-opened-start").addEventListener("click", () => {
  const t = trails.find((x) => x.current);
  if (!t?.startHere) return;
  canvas.endReplay();
  canvas.select(t.startHere, { reveal: true });
});
$("sb-opened-save").addEventListener("click", async () => {
  canvas.endReplay();
  if (await call("saveAsNew")) await refresh();
});

// ---- timeline ----
const hm = (at) => new Date(at).toTimeString().slice(0, 5);
function paintTimeline(sessions) {
  const box = $("cp-timeline");
  box.textContent = "";
  let n = 0;
  for (const s of sessions || []) {
    const head = document.createElement("div");
    head.className = "cp-tl-head";
    head.textContent = canvas.stepWhen({ at: s.startAt, device: s.device }).replace(/ \d{2}:\d{2} · /, " · ");
    box.append(head);
    for (const it of s.items) {
      n++;
      const row = document.createElement("div");
      row.className = "cp-tl-row" + (it.timelineOnly ? " only" : "");
      row.innerHTML = `<span class="t"></span><span class="nm"></span>`;
      row.querySelector(".t").textContent = hm(it.at);
      row.querySelector(".nm").textContent = it.title;
      row.title = it.timelineOnly ? `${it.title} · timeline only` : it.title;
      if (it.timelineOnly && it.url) {
        // Put on canvas: the + button, or drag the row onto the canvas.
        row.draggable = true;
        row.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/node-url", it.url));
        const put = document.createElement("button");
        put.type = "button";
        put.className = "put";
        put.textContent = "+";
        put.title = "Put on canvas";
        put.setAttribute("aria-label", `Put ${it.title} on canvas`);
        put.addEventListener("click", async () => (await call("place", { url: it.url })) && refresh());
        row.append(put);
      } else if (it.card) row.addEventListener("click", () => canvas.select(it.card, { reveal: true }));
      box.append(row);
    }
  }
  $("sb-timeline-count").textContent = n ? String(n) : "";
}

// ---- Replay (B110) ----
async function startReplay(i = 0) {
  const steps = await call("replay");
  if (!canvas.startReplay(steps, i)) canvas.say("Nothing to replay yet.");
}
let replayListSteps = null;
function paintReplayList(state) {
  document.body.classList.toggle("sb-replaying", Boolean(state));
  $("sb-replay").hidden = !state;
  if (!state) return void (replayListSteps = null);
  const list = $("sb-replay-list");
  const { steps, i, playing } = state;
  if (replayListSteps !== steps) {
    replayListSteps = steps;
    list.textContent = "";
    for (const st of steps) {
      if (st.first) {
        const head = document.createElement("div");
        head.className = "sb-replay-head";
        head.textContent = canvas.stepWhen(st).replace(/ \d{2}:\d{2} · /, " · ");
        list.append(head);
      }
      const row = document.createElement("button");
      row.type = "button";
      row.className = "sb-replay-row";
      row.setAttribute("role", "listitem");
      row.dataset.i = String(st.n - 1);
      const kind = { card: "", visit: "Not kept", link: "Link", group: "Group", rename: "Rename", resolve: "Resolved" }[st.kind];
      row.innerHTML = `<span class="n"></span><span class="nm"></span><span class="k"></span>`;
      row.querySelector(".n").textContent = String(st.n);
      row.querySelector(".nm").textContent = st.title;
      row.querySelector(".k").textContent = kind || (st.at === null ? "" : hm(st.at));
      row.title = st.caption;
      if (st.kind === "visit") row.classList.add("off");
      row.addEventListener("click", () => canvas.replayGo(st.n - 1));
      list.append(row);
    }
  }
  for (const row of list.querySelectorAll(".sb-replay-row")) {
    const k = Number(row.dataset.i);
    row.classList.toggle("future", k > i);
    if (k === i) {
      row.setAttribute("aria-current", "step");
      row.scrollIntoView?.({ block: "nearest" });
    } else row.removeAttribute("aria-current");
  }
  $("sb-replay-progress").style.transform = `scaleX(${(i + 1) / steps.length})`;
  $("sb-replay-count").textContent = `${i + 1} / ${steps.length}`;
  $("sb-replay-play").textContent = playing ? "Pause" : "Play";
  $("sb-replay-play").setAttribute("aria-label", playing ? "Pause" : "Play");
  $("sb-replay-prev").disabled = i === 0;
  $("sb-replay-next").disabled = i === steps.length - 1;
}
$("sb-replay-prev").addEventListener("click", () => canvas.replay && canvas.replayGo(canvas.replay.i - 1));
$("sb-replay-next").addEventListener("click", () => canvas.replay && canvas.replayGo(canvas.replay.i + 1));
$("sb-replay-play").addEventListener("click", () => canvas.replayToggle());
$("sb-replay-end").addEventListener("click", () => canvas.endReplay());

// ---- Share (B108): the file is saved as a download ----
let shareInfo = null;
const shareOpts = () => ({ note: $("cp-share-note").value, startHere: $("cp-share-start").value, timeline: $("cp-share-timeline").checked });
async function paintSharePreview() {
  $("cp-share-preview").textContent = await call("shareText", shareOpts());
}
async function openShare() {
  shareInfo = await call("shareInfo");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  $("cp-share-always").textContent = `Always: ${plural(shareInfo.cards, "card", "cards")}, ${plural(shareInfo.groups, "group", "groups")} and ${plural(shareInfo.links, "link", "links")}.`;
  const sel = $("cp-share-start");
  sel.textContent = "";
  const none = new Option("Nothing chosen", "");
  sel.append(none);
  for (const q of shareInfo.questions) sel.append(new Option(q.title, q.id, false, q.status !== "resolved" && !sel.value));
  $("cp-share-timeline-label").textContent = `Timeline: ${plural(shareInfo.timeline, "page read", "pages read")}${shareInfo.timelineOnly ? `, ${shareInfo.timelineOnly} of them not on the canvas` : ""}`;
  $("cp-share-msg").textContent = "";
  await paintSharePreview();
  $("cp-share").showModal();
}
for (const id of ["cp-share-note", "cp-share-start", "cp-share-timeline"]) $(id).addEventListener("input", paintSharePreview);
const fileName = (name) => `${String(name || "Trail").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Trail"}.trail.md`;
$("cp-share-save").addEventListener("click", async () => {
  const text = await call("shareText", shareOpts());
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  a.download = fileName(shareInfo?.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  $("cp-share-msg").textContent = `Saved: ${a.download} · ${shareInfo.cards} cards, ${shareInfo.links} links.`;
});

// ---- start ----
refresh().then(() => {
  if (!canvas.data?.cards?.length) canvas.focusSearch();
});
// Tests open a file without the file picker.
window.nodeOpenTrailText = openText;
