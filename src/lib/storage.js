// Lightweight storage helpers with sane defaults

const DEFAULT_SETTINGS = {
  autoDiscardAfterMinutes: 0, // 0 = disabled
  consolidateDuplicates: true,
  groupingMode: 'none'
};

export async function getSettings() {
  const store = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
  const raw = { ...DEFAULT_SETTINGS, ...(store.settings || {}) };

  // Migration: legacy boolean flag -> new grouping mode
  if (!raw.groupingMode) {
    raw.groupingMode = raw.groupByDomain ? 'domain' : 'none';
  }

  delete raw.groupByDomain;
  delete raw.showOnlyCurrentWindow;
  return raw;
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  delete next.groupByDomain;
  await chrome.storage.sync.set({ settings: next });
  return next;
}

export async function getSessions() {
  const store = await chrome.storage.local.get({ sessions: [] });
  return store.sessions || [];
}

export async function saveSessions(sessions) {
  await chrome.storage.local.set({ sessions });
}
