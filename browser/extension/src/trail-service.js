// NODE Chromium build (B112): the trail store in the built-in extension's
// service worker. The logic is the Electron build's: core/trail.js,
// core/placement.js, core/trail-file.js and core/replay.js. This file only
// wires them to chrome.storage and to messages from the canvas page and the
// content script.
//
// Storage: every file the trail store writes ("index.json",
// "<id>/trail.json", "<id>/events.jsonl", "<id>/view.json") is one key in
// chrome.storage.local, prefixed "trails/". They are read into memory when the
// worker starts (the store reads synchronously) and written back 300 ms after
// a change. Screenshots and audio are not recorded in this build yet.
import { TrailStore } from "../../../core/trail.js";
import { memoryStorage } from "../../../core/storage.js";
import { replaySteps } from "../../../core/replay.js";
import * as TrailFile from "../../../core/trail-file.js";
import { SEARCH_URL, isSensitiveUrl } from "../../../core/urls.js";

const PREFIX = "trails/";
const FILE_MAX = 5 * 1024 * 1024;

// ---- storage ----
const pending = new Map();
let flushTimer = null;
function flush() {
  flushTimer = null;
  if (!pending.size) return Promise.resolve();
  const batch = Object.fromEntries([...pending].map(([k, v]) => [PREFIX + k, v]));
  pending.clear();
  return chrome.storage.local.set(batch);
}
async function loadStorage() {
  const all = await chrome.storage.local.get(null);
  const files = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith(PREFIX) && typeof v === "string") files[k.slice(PREFIX.length)] = v;
  return memoryStorage(files, (name, text) => {
    pending.set(name, text);
    if (!flushTimer) flushTimer = setTimeout(flush, 300);
  });
}

let store = null;
const ready = loadStorage().then((s) => {
  store = new TrailStore(s, { device: "desktop" });
  store.current(); // a first start gets a trail
  return store;
});
export const whenReady = () => ready;
export const flushNow = () => {
  clearTimeout(flushTimer);
  return flush();
};

// ---- helpers ----
const cur = () => store.current().trail.id;
const snap = (id) => store.snapshot(id || cur());
const settings = async () => (await chrome.storage.local.get("settings")).settings || {};
function editable(fn) {
  const id = cur();
  if (!store.has(id) || store.get(id).trail.readonly) return null;
  const result = fn(id);
  return result ? { result, snap: snap(id) } : null;
}
// The middle of the canvas as last seen, in world units: where a card with
// no source goes. The page's size comes with the request when known.
function middle(id, size) {
  const v = store.view(id);
  const w = size?.w || 1140, h = size?.h || 860;
  return { x: Math.round((w / 2 - (v.x || 0)) / (v.z || 1)), y: Math.round((h / 2 - (v.y || 0)) / (v.z || 1)) };
}
let canvasSize = null;
const changed = (detail) => chrome.runtime.sendMessage({ type: "trail-changed", ...detail }).catch(() => {});

// A page became a card (20 s on screen, scrolled by hand) or was left early.
export async function engaged({ url, title, from, reason }) {
  await ready;
  const id = cur();
  const card = store.placePage(id, url, { title, from, reason, near: middle(id, canvasSize) });
  if (card) changed({ trail: id, card: card.id });
  return Boolean(card);
}
export async function bounced({ url, dwell }) {
  await ready;
  store.bounce(cur(), url, dwell);
}
export async function visited({ url, title, from }) {
  await ready;
  if (!/^https?:/i.test(url || "")) return;
  store.visit(cur(), url, { title, from });
  changed({ trail: cur() });
}

// ---- the trail:* operations, as the Electron build's IPC channels ----
const ops = {
  get: ({ id } = {}) => snap(id),
  list: () => store.list(),
  timeline: ({ id } = {}) => store.timeline(id || cur()),
  replay: ({ id } = {}) => {
    const tid = id || cur();
    return replaySteps(store.snapshot(tid), store.events(tid));
  },
  new: ({ name } = {}) => {
    store.create(name || "New trail");
    return snap();
  },
  switch: ({ id }) => (store.has(String(id)) && store.switchTo(String(id)) ? snap() : null),
  rename: ({ name }) => {
    store.rename(cur(), name);
    return snap();
  },
  view: ({ patch, size }) => {
    if (size) canvasSize = size;
    return store.setView(cur(), patch || {});
  },
  // B104: Put on canvas and Remove from canvas.
  place: ({ url, card, x, y } = {}) => {
    const id = cur();
    const pos = typeof x === "number" && typeof y === "number" ? { x: Math.round(x), y: Math.round(y) } : {};
    let c = null;
    if (card) c = store.restoreCard(id, String(card), pos);
    else if (url) {
      const row = store.pageRows(id).find((r) => r.url === url);
      c = store.placePage(id, String(url), { title: row?.title || "", reason: "put", near: middle(id, canvasSize), ...pos });
    }
    return c ? snap(id) : null;
  },
  remove: ({ card }) => (store.removeCard(cur(), String(card)) ? snap() : null),
  // B105: canvas tools.
  move: ({ card, x, y }) => editable((id) => store.moveCard(id, String(card), Number(x), Number(y))),
  groupMove: ({ group, x, y }) => editable((id) => store.moveGroup(id, String(group), Number(x), Number(y))),
  link: ({ from, to, label = "" }) => editable((id) => store.link(id, String(from), String(to), { kind: "you", label: String(label || "") })),
  linkLabel: ({ line, label }) => editable((id) => store.labelLine(id, String(line), String(label || ""))),
  unlink: ({ line }) => editable((id) => store.unlink(id, String(line))),
  group: ({ rect }) => editable((id) => store.groupAround(id, rect)),
  groupRename: ({ group, label }) => editable((id) => store.renameGroup(id, String(group), String(label || ""))),
  question: async ({ x, y, title }) => {
    const by = (await settings()).displayName || "";
    return editable((id) => {
      const t = String(title || "").trim().slice(0, 200);
      if (!t) return null;
      return store.questionCard(id, { id: `t${Date.now().toString(36)}`, title: t, status: "open", by, at: Date.now(), replies: [] }, { place: { x: Math.round(Number(x)), y: Math.round(Number(y)) } });
    });
  },
  note: async ({ x, y, text }) => {
    const by = (await settings()).displayName || "";
    return editable((id) => store.freeNote(id, { x: Number(x), y: Number(y), text, by }));
  },
  // B106: a search card, and the results in a new tab.
  search: async ({ query }) => {
    const q = String(query || "").trim();
    if (!q) return null;
    const url = SEARCH_URL + encodeURIComponent(q);
    const id = cur();
    const card = store.searchCard(id, { query: q, url, near: middle(id, canvasSize) });
    await chrome.tabs.create({ url });
    return card ? snap(id) : null;
  },
  // B108: the file, written in the canvas page (a download).
  shareInfo: () => {
    const s = snap();
    const cards = s.cards.filter((c) => !(c.url && isSensitiveUrl(c.url)));
    const items = s.timeline.flatMap((x) => x.items).filter((i) => i.type === "opened" && !(i.url && isSensitiveUrl(i.url)));
    return {
      name: s.trail.name,
      cards: cards.length,
      groups: s.groups.filter((g) => !g.suggested).length,
      links: s.lines.filter((l) => l.kind !== "suggested").length,
      questions: cards.filter((c) => c.kind === "question").map((c) => ({ id: c.id, title: c.title, status: c.status })),
      timeline: items.length,
      timelineOnly: items.filter((i) => i.timelineOnly).length,
      readonly: Boolean(s.trail.readonly),
    };
  },
  shareText: async (opts = {}) =>
    TrailFile.toTrailMd(snap(), {
      by: (await settings()).displayName || "",
      note: String(opts.note || "").slice(0, 300),
      startHere: opts.startHere || "",
      timeline: opts.timeline !== false,
      openTabs: [],
    }),
  // B109: open a file read only; Save as new trail.
  openFile: ({ name, text }) => {
    if (String(text || "").length > FILE_MAX) return { ok: false, error: `${name}: the file is too large for a trail (over 5 MB).` };
    let data;
    try {
      data = TrailFile.parseTrailMd(String(text || ""));
    } catch (err) {
      return { ok: false, error: `${name}: ${err.message}` };
    }
    const t = store.importFile(data, { file: String(name || "") });
    return { ok: true, id: t.trail.id, snap: snap(t.trail.id) };
  },
  saveAsNew: () => {
    const id = cur();
    if (!store.has(id) || !store.get(id).trail.readonly) return null;
    const copy = store.saveAsNew(id);
    return snap(copy.trail.id);
  },
};

export async function handle(op, args) {
  await ready;
  const fn = ops[op];
  if (!fn) throw new Error(`Unknown trail operation: ${op}`);
  return fn(args || {});
}
