import { getSettings } from './lib/storage.js';

chrome.runtime.onInstalled.addListener(async () => {
  // Ensure defaults exist
  await getSettings();
  // Create periodic alarm for auto-discard
  try {
    await chrome.alarms.create('clarity-auto-discard', { periodInMinutes: 5 });
  } catch {}
  // Ensure side panel is enabled for all open tabs
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      await chrome.sidePanel.setOptions({ tabId: t.id, path: 'src/panel.html', enabled: true });
    }
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {}
});

// No commands; side panel is the only entry point

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'clarity-auto-discard') return;
  const settings = await getSettings();
  const minutes = Number(settings.autoDiscardAfterMinutes) || 0;
  if (!minutes) return;

  const threshold = minutes * 60 * 1000;
  const tabs = await chrome.tabs.query({});
  const now = Date.now();

  for (const t of tabs) {
    if (t.active) continue;
    if (t.pinned) continue;
    if (t.audible) continue;
    const last = t.lastAccessed || now;
    if (now - last >= threshold) {
      try { await chrome.tabs.discard(t.id); } catch {}
    }
  }
});

// Keep side panel available on newly created tabs
chrome.tabs.onCreated.addListener(async (tab) => {
  try { await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'src/panel.html', enabled: true }); } catch {}
});
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === 'complete') {
    try { await chrome.sidePanel.setOptions({ tabId, path: 'src/panel.html', enabled: true }); } catch {}
  }
});

// Ensure behavior on browser startup as well
chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      await chrome.sidePanel.setOptions({ tabId: t.id, path: 'src/panel.html', enabled: true });
    }
  } catch {}
});

// Fallback: explicitly open side panel when the action icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {}
});
