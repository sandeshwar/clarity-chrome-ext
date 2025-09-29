// Simple undo stack stored in storage.local
// Supports: reopen tabs, update tab props, ungroup tabs

const KEY = 'undoStack';
const MAX = 25;

async function readStack() {
  const s = await chrome.storage.local.get({ [KEY]: [] });
  return Array.isArray(s[KEY]) ? s[KEY] : [];
}

async function writeStack(stack) {
  const trimmed = stack.slice(-MAX);
  await chrome.storage.local.set({ [KEY]: trimmed });
}

export async function pushUndo(entry) {
  const stack = await readStack();
  stack.push({ ...entry, ts: Date.now() });
  await writeStack(stack);
}

export async function popUndo() {
  const stack = await readStack();
  const last = stack.pop();
  await writeStack(stack);
  if (!last) return { ok: false };
  try {
    await performUndo(last);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function peekUndo() {
  const stack = await readStack();
  const last = stack[stack.length - 1];
  if (!last) return null;
  let count = 0;
  if (last.type === 'reopen-tabs') count = (last.tabs?.length) || 0;
  else count = 1;
  return { entry: last, count };
}

async function performUndo(entry) {
  switch (entry.type) {
    case 'reopen-tabs':
      await reopenTabs(entry.tabs);
      break;
    case 'update-tab':
      await updateTab(entry.tabId, entry.prev);
      break;
    case 'reload-tab':
      try { await chrome.tabs.reload(entry.tabId); } catch {}
      break;
    case 'ungroup-tabs':
      try { await chrome.tabs.ungroup(entry.tabIds); } catch {}
      break;
    default:
      break;
  }
}

async function windowExists(windowId) {
  try { await chrome.windows.get(windowId); return true; } catch { return false; }
}

async function reopenTabs(snapshots) {
  // Group by windowId to try restoring in place
  const byWin = new Map();
  for (const s of snapshots) {
    if (!byWin.has(s.windowId)) byWin.set(s.windowId, []);
    byWin.get(s.windowId).push(s);
  }
  for (const [winId, snaps] of byWin) {
    const exists = await windowExists(winId);
    if (!exists) {
      // Create a new window starting with first tab
      const first = snaps[0];
      const win = await chrome.windows.create({ url: first.url });
      // Create rest in that window
      for (let i = 1; i < snaps.length; i++) {
        const s = snaps[i];
        await chrome.tabs.create({ windowId: win.id, url: s.url, pinned: !!s.pinned, index: Math.max(0, s.index ?? 0), active: false });
      }
      continue;
    }
    // Existing window: recreate in roughly original positions
    // Create in ascending index to preserve order
    const ordered = snaps.slice().sort((a,b) => (a.index ?? 0) - (b.index ?? 0));
    for (const s of ordered) {
      await chrome.tabs.create({ windowId: winId, url: s.url, pinned: !!s.pinned, index: Math.max(0, s.index ?? 0), active: !!s.active });
    }
  }
}

async function updateTab(tabId, prev) {
  try {
    if (prev.pinned !== undefined) await chrome.tabs.update(tabId, { pinned: prev.pinned });
    if (prev.muted !== undefined) await chrome.tabs.update(tabId, { muted: prev.muted });
    if (prev.active) await chrome.tabs.update(tabId, { active: true });
  } catch {}
}

export function snapshotTab(t) {
  return {
    url: t.url,
    pinned: !!t.pinned,
    index: t.index,
    windowId: t.windowId,
    active: !!t.active
  };
}
