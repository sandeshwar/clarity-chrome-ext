export async function getAllTabs({ currentWindowOnly = false } = {}) {
  if (!currentWindowOnly) {
    return await chrome.tabs.query({});
  }

  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (win && typeof win.id === 'number') {
      const tabs = await chrome.tabs.query({ windowId: win.id });
      if (tabs.length) return tabs;
    }
  } catch {}

  const normalTabs = await chrome.tabs.query({ windowType: 'normal' });
  if (!normalTabs.length) return normalTabs;
  const [first] = normalTabs;
  return normalTabs.filter((tab) => tab.windowId === first.windowId);
}

export async function switchTo(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });
}

export async function closeTab(tabId) {
  try { await chrome.tabs.remove(tabId); } catch {}
}

export async function pinTab(tabId, pinned) {
  await chrome.tabs.update(tabId, { pinned });
}

export async function muteTab(tabId, muted) {
  await chrome.tabs.update(tabId, { muted });
}

export async function discardTab(tabId) {
  try { await chrome.tabs.discard(tabId); } catch {}
}

export async function groupTabsByDomain(tabIds) {
  if (!tabIds.length) return;
  const first = await chrome.tabs.get(tabIds[0]);
  const groups = new Map();
  for (const id of tabIds) {
    const t = await chrome.tabs.get(id);
    const key = domainOf(t.url) || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t.id);
  }
  for (const [domain, ids] of groups) {
    const groupId = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId: first.windowId } });
    try { await chrome.tabGroups.update(groupId, { title: domain, color: colorForDomain(domain) }); } catch {}
  }
}

export function domainOf(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname || "";
    return canonicalDomain(host);
  } catch { return ""; }
}

// Return eTLD+1 using a lightweight heuristic for common multi-part TLDs
function canonicalDomain(hostname) {
  if (!hostname) return "";
  if (hostname === 'localhost') return hostname;
  if (isIP(hostname)) return hostname;
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  const two = parts.slice(-2).join('.');
  const three = parts.slice(-3).join('.');
  const MULTI_PART_SUFFIX = new Set([
    'co.uk','org.uk','ac.uk','gov.uk','ltd.uk','plc.uk',
    'co.jp','ne.jp','or.jp','ac.jp','go.jp',
    'com.au','net.au','org.au','edu.au','gov.au',
    'com.br','net.br','org.br',
    'com.mx','org.mx','com.tr','com.pl','co.in','com.cn','com.sg','com.hk'
  ]);
  if (MULTI_PART_SUFFIX.has(two)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function isIP(host) {
  // IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  // IPv6
  if (host.includes(':')) return true;
  return false;
}

const GROUP_COLORS = ['blue','red','yellow','green','pink','purple','cyan','orange'];
function colorForDomain(domain) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) {
    h = ((h << 5) - h) + domain.charCodeAt(i);
    h |= 0;
  }
  const idx = Math.abs(h) % GROUP_COLORS.length;
  return GROUP_COLORS[idx];
}
