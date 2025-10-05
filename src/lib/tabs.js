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
    const title = stripTLD(domain);
    try { await chrome.tabGroups.update(groupId, { title, color: colorForDomain(domain) }); } catch {}
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

function stripTLD(domain) {
  if (!domain) return domain;
  if (domain === 'localhost') return domain;
  if (isIP(domain)) return domain;
  const parts = domain.split('.').filter(Boolean);
  if (parts.length <= 1) return domain;
  return parts[0];
}

function isSameDay(ts, nowTs) {
  if (!ts) return false;
  const a = new Date(ts);
  const b = new Date(nowTs);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export async function groupTabsByDomainSection(tabIds) {
  if (!tabIds.length) return;
  const first = await chrome.tabs.get(tabIds[0]);
  const groups = new Map();
  
  for (const id of tabIds) {
    const t = await chrome.tabs.get(id);
    const domain = domainOf(t.url) || "unknown";
    let pathSeg = "";
    try {
      const url = new URL(t.url);
      pathSeg = url.pathname.split('/').filter(Boolean)[0] || "";
    } catch {}
    
    const key = `${domain}|${pathSeg}`;
    if (!groups.has(key)) {
      groups.set(key, { domain, pathSeg, ids: [] });
    }
    groups.get(key).ids.push(t.id);
  }
  
  for (const [key, { domain, pathSeg, ids }] of groups) {
    const groupId = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId: first.windowId } });
    const strippedDomain = stripTLD(domain);
    const title = pathSeg ? `${strippedDomain}/${pathSeg}` : strippedDomain;
    try { 
      await chrome.tabGroups.update(groupId, { title, color: colorForDomain(domain) }); 
    } catch {}
  }
}

const STATUS_GROUP_COLOR = {
  pinned: 'yellow',
  muted: 'purple',
  discarded: 'orange',
  normal: 'blue'
};

const ACTIVITY_GROUP_COLOR = {
  recent: 'green',
  hour: 'blue',
  today: 'cyan',
  week: 'yellow',
  older: 'orange'
};

export async function groupTabsByActivity(tabIds) {
  if (!tabIds.length) return;
  const first = await chrome.tabs.get(tabIds[0]);

  const now = Date.now();
  const buckets = [
    { key: 'recent', label: 'Last 15 minutes', match: (diff) => diff <= 15 * 60 * 1000 },
    { key: 'hour', label: 'Last hour', match: (diff) => diff <= 60 * 60 * 1000 },
    { key: 'today', label: 'Earlier today', match: (diff, tab) => isSameDay(tab.lastAccessed, now) },
    { key: 'week', label: 'This week', match: (diff) => diff <= 7 * 24 * 60 * 60 * 1000 },
    { key: 'older', label: 'Older', match: () => true }
  ].map((def) => ({ ...def, ids: [] }));

  for (const id of tabIds) {
    const t = await chrome.tabs.get(id);
    const diff = t.lastAccessed ? now - t.lastAccessed : Number.POSITIVE_INFINITY;
    for (const bucket of buckets) {
      if (bucket.match(diff, t)) {
        bucket.ids.push(t.id);
        break;
      }
    }
  }

  for (const bucket of buckets) {
    if (!bucket.ids.length) continue;
    const groupId = await chrome.tabs.group({ tabIds: bucket.ids, createProperties: { windowId: first.windowId } });
    const color = ACTIVITY_GROUP_COLOR[bucket.key] || 'blue';
    try { await chrome.tabGroups.update(groupId, { title: bucket.label, color }); } catch {}
  }
}

export async function groupTabsByStatus(tabIds) {
  if (!tabIds.length) return;
  const first = await chrome.tabs.get(tabIds[0]);

  const statuses = [
    { key: 'pinned', label: 'Pinned', test: (tab) => !!tab.pinned },
    { key: 'muted', label: 'Muted', test: (tab) => !!(tab.mutedInfo?.muted) },
    { key: 'discarded', label: 'Discarded', test: (tab) => !!tab.discarded },
    { key: 'normal', label: 'Normal', test: () => true }
  ].map((def) => ({ ...def, ids: [] }));

  for (const id of tabIds) {
    const t = await chrome.tabs.get(id);
    for (const bucket of statuses) {
      if (bucket.test(t)) {
        bucket.ids.push(t.id);
        break;
      }
    }
  }

  for (const bucket of statuses) {
    if (!bucket.ids.length) continue;
    const groupId = await chrome.tabs.group({ tabIds: bucket.ids, createProperties: { windowId: first.windowId } });
    const color = STATUS_GROUP_COLOR[bucket.key] || 'blue';
    try { await chrome.tabGroups.update(groupId, { title: bucket.label, color }); } catch {}
  }
}

export async function reapplyChromeGroupTitlesAndColors(tabIds) {
  if (!tabIds.length) return;
  const groups = new Map();
  for (const id of tabIds) {
    const t = await chrome.tabs.get(id);
    const gid = typeof t.groupId === 'number' ? t.groupId : -1;
    if (gid === -1) continue;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(t);
  }
  const ids = Array.from(groups.keys());
  if (!ids.length) return;
  for (const gid of ids) {
    let info = null;
    try { info = await chrome.tabGroups.get(gid); } catch { info = null; }
    const tabs = groups.get(gid) || [];
    let dominantDomain = '';
    const counts = new Map();
    for (const t of tabs) {
      const d = domainOf(t.url) || '';
      if (!d) continue;
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    if (counts.size) {
      dominantDomain = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1])[0][0];
    }
    const computedTitle = dominantDomain ? stripTLD(dominantDomain) : `Group ${gid}`;
    const title = (info && typeof info.title === 'string' && info.title.trim()) ? info.title.trim() : computedTitle;
    const color = dominantDomain ? colorForDomain(dominantDomain) : 'blue';
    try { await chrome.tabGroups.update(gid, { title, color }); } catch {}
  }
}

export async function setCurrentWindowTabGroupsCollapsed(collapsed) {
  let tabs = [];
  try { tabs = await getAllTabs({ currentWindowOnly: true }); } catch { tabs = []; }
  const NONE = chrome?.tabGroups && typeof chrome.tabGroups.TAB_GROUP_ID_NONE !== 'undefined' ? chrome.tabGroups.TAB_GROUP_ID_NONE : -1;
  const ids = new Set();
  for (const t of tabs) {
    const gid = typeof t.groupId === 'number' ? t.groupId : NONE;
    if (gid !== NONE) ids.add(gid);
  }
  for (const gid of ids) {
    try { await chrome.tabGroups.update(gid, { collapsed }); } catch {}
  }
}
