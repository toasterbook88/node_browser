// NODE Chromium build: background service worker of the built-in extension.
// The 4-tab playback limit (core/playback.js) across the browser's tabs,
// opening the side panel from the toolbar button, and the trail (B112):
// pages read go into the current trail, and pages you engage with become
// cards (trail-service.js).
import { PlaybackLimiter } from "../../../core/playback.js";
import * as trail from "./trail-service.js";

const playback = new PlaybackLimiter();
let activeTab = null;

chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  activeTab = tabId;
  if (playback.activated(String(tabId))) chrome.tabs.sendMessage(tabId, { type: "resume" }).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => playback.closed(String(tabId)));

// ---- Trail (B112) ----
// Per tab: the page it shows and the page it came from (the page before it in
// the tab, or the page that opened the tab). Kept in session storage, so it
// survives the worker going to sleep. Incognito tabs are never recorded.
const tabPages = new Map();
const tabsReady = chrome.storage.session
  .get("tabPages")
  .then((r) => {
    for (const [k, v] of Object.entries(r.tabPages || {})) tabPages.set(Number(k), v);
  })
  .catch(() => {});
const saveTabPages = () => chrome.storage.session.set({ tabPages: Object.fromEntries(tabPages) }).catch(() => {});
chrome.tabs.onCreated.addListener(async (tab) => {
  await tabsReady;
  if (tab.incognito || tab.openerTabId == null) return;
  const opener = tabPages.get(tab.openerTabId);
  if (opener?.url) {
    tabPages.set(tab.id, { url: "", from: "", openedFrom: opener.url });
    saveTabPages();
  }
});
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || tab.incognito || !/^https?:/i.test(tab.url || "")) return;
  await tabsReady;
  const st = tabPages.get(tabId) || {};
  if (st.url === tab.url) return;
  const from = st.url || st.openedFrom || "";
  tabPages.set(tabId, { url: tab.url, from, openedFrom: "" });
  saveTabPages();
  trail.visited({ url: tab.url, title: tab.title || "", from }).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabPages.delete(tabId)) saveTabPages();
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab?.id;
  if (msg.type === "trail") {
    // From the canvas page: { op, args } as the Electron build's trail:* channels.
    trail
      .handle(msg.op, msg.args)
      .then((value) => reply({ ok: true, value }), (err) => reply({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if ((msg.type === "engaged" || msg.type === "bounced") && tabId != null && !sender.tab.incognito) {
    tabsReady.then(() => {
      const st = tabPages.get(tabId) || {};
      if (msg.type === "engaged") trail.engaged({ url: msg.url, title: msg.title || sender.tab.title || "", from: st.url === msg.url ? st.from : "", reason: msg.reason }).catch(() => {});
      else trail.bounced({ url: msg.url, dwell: msg.dwell }).catch(() => {});
    });
    reply({ ok: true });
    return false;
  }
  if (msg.type === "media-playing" && tabId != null) {
    for (const id of playback.started(String(tabId), String(activeTab ?? tabId))) chrome.tabs.sendMessage(Number(id), { type: "pause-for-limit" }).catch(() => {});
    reply({ ok: true });
  } else if (msg.type === "media-stopped" && tabId != null) {
    playback.stopped(String(tabId));
    reply({ ok: true });
  } else if (msg.type === "playback-state") {
    reply(playback.snapshot());
  } else if (msg.type === "page-settled" && tabId != null) {
    chrome.runtime.sendMessage({ type: "page-settled", tabId }).catch(() => {});
  }
  return false;
});
