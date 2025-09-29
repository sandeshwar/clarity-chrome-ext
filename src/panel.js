import { getSettings, saveSettings } from './lib/storage.js';
import { getAllTabs, switchTo, closeTab, pinTab, muteTab, discardTab, groupTabsByDomain, domainOf } from './lib/tabs.js';
import { filterAndSortTabs } from './lib/search.js';
import { pushUndo, popUndo, peekUndo, snapshotTab } from './lib/undo.js';

const $ = (s) => document.querySelector(s);

const search = $('#search');
const groupingMode = $('#grouping-mode');
const tabsEl = $('#tabs');
const btnUndo = $('#btn-undo');
const undoBadge = $('#undo-badge');
const btnCloseDupes = $('#close-dupes');
const btnFindDupes = $('#find-dupes');
const btnCreateGroups = $('#create-groups');
const toggleGroupsBtn = $('#toggle-groups');
const toggleGroupsLabel = toggleGroupsBtn?.querySelector('.sr-only') || null;
const findDupesLabel = btnFindDupes?.querySelector('.sr-only') || null;

const TAB_GROUP_COLOR_HEX = {
  blue: '#60a5fa',
  red: '#f87171',
  yellow: '#facc15',
  green: '#34d399',
  pink: '#f472b6',
  purple: '#c084fc',
  cyan: '#22d3ee',
  orange: '#fb923c'
};

const STATUS_ACCENTS = {
  pinned: '#facc15',
  muted: '#c084fc',
  discarded: '#fb7185',
  normal: '#94a3b8'
};

const TAB_GROUP_NONE = chrome?.tabGroups && typeof chrome.tabGroups.TAB_GROUP_ID_NONE !== 'undefined'
  ? chrome.tabGroups.TAB_GROUP_ID_NONE
  : -1;

let openGroupMenuRef = null;
let menuListenerAttached = false;
let settings = {};
let allTabs = [];
const expandedGroupsByMode = new Map();
const allowEmptyModes = new Set();
let lastRenderedMode = 'none';
let lastRenderedGroupKeys = [];
let showDuplicatesOnly = false;

function getExpandedSet(mode) {
  if (!expandedGroupsByMode.has(mode)) {
    expandedGroupsByMode.set(mode, new Set());
  }
  return expandedGroupsByMode.get(mode);
}

function closeGroupMenu() {
  if (!openGroupMenuRef) return;
  openGroupMenuRef.menu.hidden = true;
  openGroupMenuRef.button.setAttribute('aria-expanded', 'false');
  openGroupMenuRef = null;
}

function ensureMenuListeners() {
  if (menuListenerAttached) return;
  document.addEventListener('click', (evt) => {
    if (!openGroupMenuRef) return;
    if (evt.target.closest('.group-menu') || evt.target.closest('.group-menu-btn')) return;
    closeGroupMenu();
  });
  menuListenerAttached = true;
}

async function load() {
  ensureMenuListeners();
  settings = await getSettings();
  if (groupingMode) {
    const preferred = settings.groupingMode && groupingMode.querySelector(`option[value="${settings.groupingMode}"]`)
      ? settings.groupingMode
      : 'none';
    groupingMode.value = preferred;
  }
  if (btnFindDupes) {
    btnFindDupes.addEventListener('click', () => {
      if (btnFindDupes.disabled) return;
      showDuplicatesOnly = !showDuplicatesOnly;
      renderTabs();
    });
  }
  await refreshTabs();
  await refreshUndoPeek();
}

async function refreshTabs() {
  allTabs = await getAllTabs({ currentWindowOnly: true });
  await renderTabs();
}

async function renderTabs() {
  closeGroupMenu();
  const q = search.value.trim();
  const mode = groupingMode?.value || 'none';
  const duplicateKeys = computeDuplicateKeys(allTabs);
  const hasDuplicates = duplicateKeys.size > 0;
  if (!hasDuplicates && showDuplicatesOnly) showDuplicatesOnly = false;
  if (btnFindDupes) {
    btnFindDupes.disabled = !hasDuplicates;
    btnFindDupes.classList.toggle('is-disabled', !hasDuplicates);
    const isActive = showDuplicatesOnly && hasDuplicates;
    btnFindDupes.classList.toggle('is-active', isActive);
    btnFindDupes.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btnFindDupes.title = isActive ? 'Show all tabs' : (hasDuplicates ? 'Highlight duplicate tabs' : 'No duplicate tabs found');
    if (findDupesLabel) findDupesLabel.textContent = isActive ? 'Show all tabs' : 'Highlight duplicate tabs';
  }

  let tabs = filterAndSortTabs(allTabs, q);
  if (showDuplicatesOnly && hasDuplicates) {
    tabs = filterTabsByDuplicateKeys(tabs, duplicateKeys);
  }

  tabsEl.innerHTML = '';
  if (toggleGroupsBtn) {
    toggleGroupsBtn.hidden = true;
    toggleGroupsBtn.disabled = true;
  }
  if (mode === 'none') {
    lastRenderedMode = mode;
    lastRenderedGroupKeys = [];
    for (const t of tabs) tabsEl.appendChild(row(t));
    return;
  }
  const groups = await groupTabsForMode(tabs, mode);
  lastRenderedMode = mode;
  lastRenderedGroupKeys = groups.map((group) => group.key);

  const expandedSet = getExpandedSet(mode);
  const currentKeys = new Set(lastRenderedGroupKeys);
  for (const key of Array.from(expandedSet)) {
    if (!currentKeys.has(key)) expandedSet.delete(key);
  }

  if (!allowEmptyModes.has(mode) && expandedSet.size === 0 && groups.length) {
    expandedSet.add(groups[0].key);
    allowEmptyModes.delete(mode);
  }

  groups.forEach((group) => {
    const expanded = expandedSet.has(group.key);
    const container = document.createElement('div');
    container.className = 'group';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'group-header';
    header.dataset.expanded = expanded ? 'true' : 'false';

    const caret = document.createElement('span');
    caret.className = 'caret';
    header.appendChild(caret);

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = group.label;
    header.appendChild(title);

    if (group.subtitle) {
      const subtitle = document.createElement('span');
      subtitle.className = 'subtitle';
      subtitle.textContent = group.subtitle;
      header.appendChild(subtitle);
    }

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(group.tabs.length);
    if (group.color) {
      count.style.color = group.color;
    } else {
      count.style.removeProperty('color');
    }
    header.appendChild(count);

    header.addEventListener('click', (evt) => {
      if (evt.target.closest('.group-menu') || evt.target.closest('.group-menu-btn')) return;
      if (expandedSet.has(group.key)) {
        expandedSet.delete(group.key);
        if (expandedSet.size === 0) allowEmptyModes.add(mode);
      } else {
        expandedSet.add(group.key);
        allowEmptyModes.delete(mode);
      }
      closeGroupMenu();
      renderTabs();
    });

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'group-menu-btn';
    menuBtn.setAttribute('aria-haspopup', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    header.appendChild(menuBtn);

    const menu = document.createElement('div');
    menu.className = 'group-menu';
    menu.hidden = true;

    const actions = buildGroupMenuActions(group.tabs);
    actions.forEach(({ key, label }) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'group-menu-item';
      item.textContent = label;
      item.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        closeGroupMenu();
        await handleGroupMenuAction(key, group.tabs);
      });
      menu.appendChild(item);
    });

    menuBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      if (openGroupMenuRef && openGroupMenuRef.menu !== menu) {
        closeGroupMenu();
      }
      const shouldOpen = menu.hidden;
      if (shouldOpen) {
        menu.hidden = false;
        menuBtn.setAttribute('aria-expanded', 'true');
        openGroupMenuRef = { button: menuBtn, menu };
      } else {
        closeGroupMenu();
      }
    });

    container.appendChild(header);
    container.appendChild(menu);

    const body = document.createElement('div');
    body.className = 'group-body';
    if (!expanded) body.classList.add('collapsed');
    for (const t of group.tabs) body.appendChild(row(t));
    container.appendChild(body);

    tabsEl.appendChild(container);
  });

  updateToggleGroupsButton(mode, groups, expandedSet);
}

function updateToggleGroupsButton(mode, groups, expandedSet) {
  if (!toggleGroupsBtn) return;

  if (mode === 'none' || !groups.length) {
    toggleGroupsBtn.hidden = true;
    toggleGroupsBtn.disabled = true;
    toggleGroupsBtn.removeAttribute('data-state');
    if (toggleGroupsLabel) toggleGroupsLabel.textContent = 'Toggle groups';
    toggleGroupsBtn.setAttribute('aria-label', 'Toggle groups');
    toggleGroupsBtn.setAttribute('title', 'Toggle groups');
    return;
  }

  toggleGroupsBtn.hidden = false;
  toggleGroupsBtn.disabled = false;

  const allExpanded = groups.every((group) => expandedSet.has(group.key));
  const label = allExpanded ? 'Collapse all groups' : 'Expand all groups';

  toggleGroupsBtn.dataset.state = allExpanded ? 'collapse' : 'expand';
  toggleGroupsBtn.setAttribute('aria-label', label);
  toggleGroupsBtn.setAttribute('title', label);
  if (toggleGroupsLabel) toggleGroupsLabel.textContent = label;
}

async function groupTabsForMode(tabs, mode) {
  switch (mode) {
    case 'domain':
      return groupByDomain(tabs);
    case 'domain-deep':
      return groupByDomainSection(tabs);
    case 'chrome-groups':
      return await groupByChromeTabGroup(tabs);
    case 'activity':
      return groupByActivity(tabs);
    case 'status':
      return groupByStatus(tabs);
    default:
      return [{ key: 'all', label: 'All tabs', tabs: sortTabsByIndex(tabs) }];
  }
}

function sortTabsByIndex(tabs) {
  return tabs.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

function groupByDomain(tabs) {
  const map = new Map();
  for (const tab of tabs) {
    const domain = domainOf(tab.url) || 'Unknown domain';
    const key = domain.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { key, label: domain, tabs: [] });
    }
    map.get(key).tabs.push(tab);
  }
  return Array.from(map.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((group) => ({ ...group, tabs: sortTabsByIndex(group.tabs) }));
}

function groupByDomainSection(tabs) {
  const map = new Map();
  for (const tab of tabs) {
    const descriptor = describeDomainSection(tab);
    if (!map.has(descriptor.key)) {
      map.set(descriptor.key, { key: descriptor.key, label: descriptor.label, subtitle: descriptor.subtitle, tabs: [] });
    }
    map.get(descriptor.key).tabs.push(tab);
  }
  return Array.from(map.values())
    .sort((a, b) => a.label.localeCompare(b.label) || (a.subtitle || '').localeCompare(b.subtitle || ''))
    .map((group) => ({ ...group, tabs: sortTabsByIndex(group.tabs) }));
}

async function groupByChromeTabGroup(tabs) {
  if (!chrome?.tabGroups?.get) {
    return [{ key: 'group:all', label: 'Tabs', tabs: sortTabsByIndex(tabs) }];
  }

  const groups = new Map();
  const ungrouped = [];
  const ids = new Set();

  for (const tab of tabs) {
    const groupId = typeof tab.groupId === 'number' ? tab.groupId : TAB_GROUP_NONE;
    if (groupId !== TAB_GROUP_NONE) {
      if (!groups.has(groupId)) {
        groups.set(groupId, { id: groupId, tabs: [], order: Number.POSITIVE_INFINITY });
      }
      const entry = groups.get(groupId);
      entry.tabs.push(tab);
      entry.order = Math.min(entry.order, tab.index ?? entry.order);
      ids.add(groupId);
    } else {
      ungrouped.push(tab);
    }
  }

  const infoMap = new Map();
  if (ids.size) {
    await Promise.all(Array.from(ids).map(async (id) => {
      try {
        const info = await chrome.tabGroups.get(id);
        infoMap.set(id, info);
      } catch {
        infoMap.set(id, null);
      }
    }));
  }

  const result = Array.from(groups.values()).map((entry) => {
    const info = infoMap.get(entry.id);
    const label = info?.title?.trim() || `Group ${entry.id}`;
    const colorName = info?.color;
    const color = colorName && TAB_GROUP_COLOR_HEX[colorName] ? TAB_GROUP_COLOR_HEX[colorName] : undefined;
    return {
      key: `group:${entry.id}`,
      label,
      subtitle: info?.collapsed ? 'Collapsed' : '',
      color,
      order: entry.order,
      tabs: sortTabsByIndex(entry.tabs)
    };
  });

  if (ungrouped.length) {
    const order = Math.min(...ungrouped.map((t) => t.index ?? Number.POSITIVE_INFINITY));
    result.push({
      key: 'group:ungrouped',
      label: 'Ungrouped',
      subtitle: '',
      color: '#94a3b8',
      order: isFinite(order) ? order + 0.1 : Number.POSITIVE_INFINITY,
      tabs: sortTabsByIndex(ungrouped)
    });
  }

  return result
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY))
    .map(({ order, ...rest }) => rest);
}

function groupByActivity(tabs) {
  const now = Date.now();
  const buckets = [
    { key: 'recent', label: 'Last 15 minutes', match: (diff) => diff <= 15 * 60 * 1000 },
    { key: 'hour', label: 'Last hour', match: (diff) => diff <= 60 * 60 * 1000 },
    { key: 'today', label: 'Earlier today', match: (diff, tab) => isSameDay(tab.lastAccessed, now) },
    { key: 'week', label: 'This week', match: (diff) => diff <= 7 * 24 * 60 * 60 * 1000 },
    { key: 'older', label: 'Older', match: () => true }
  ].map((def) => ({ ...def, tabs: [] }));

  for (const tab of tabs) {
    const diff = tab.lastAccessed ? now - tab.lastAccessed : Number.POSITIVE_INFINITY;
    for (const bucket of buckets) {
      if (bucket.match(diff, tab)) {
        bucket.tabs.push(tab);
        break;
      }
    }
  }

  return buckets
    .filter((bucket) => bucket.tabs.length)
    .map((bucket) => ({ key: `activity:${bucket.key}`, label: bucket.label, tabs: sortTabsByIndex(bucket.tabs) }));
}

function groupByStatus(tabs) {
  const statuses = [
    { key: 'pinned', label: 'Pinned', test: (tab) => tab.pinned },
    { key: 'muted', label: 'Muted', test: (tab) => !!(tab.mutedInfo?.muted) },
    { key: 'discarded', label: 'Discarded', test: (tab) => !!tab.discarded },
    { key: 'normal', label: 'Normal', test: () => true }
  ].map((def) => ({ ...def, tabs: [] }));

  for (const tab of tabs) {
    for (const bucket of statuses) {
      if (bucket.test(tab)) {
        bucket.tabs.push(tab);
        break;
      }
    }
  }

  return statuses
    .filter((bucket) => bucket.tabs.length)
    .map((bucket) => ({
      key: `status:${bucket.key}`,
      label: bucket.label,
      tabs: sortTabsByIndex(bucket.tabs),
      color: STATUS_ACCENTS[bucket.key]
    }));
}

function computeDuplicateKeys(tabs) {
  const counts = new Map();
  for (const tab of tabs) {
    const key = duplicateKey(tab);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicates = new Map();
  for (const [key, count] of counts) {
    if (count > 1) duplicates.set(key, count);
  }
  return duplicates;
}

function filterTabsByDuplicateKeys(tabs, duplicateKeys) {
  if (!duplicateKeys.size) return [];
  return tabs.filter((tab) => duplicateKeys.has(duplicateKey(tab)));
}

function duplicateKey(tab) {
  const url = tab.url || '';
  if (!url) return '';
  return url.split('#')[0].trim();
}

function buildGroupMenuActions(tabs) {
  const actions = [];
  if (!tabs.length) return actions;
  actions.push({ key: 'close', label: 'Close tabs' });

  const allPinned = tabs.every((tab) => !!tab.pinned);
  actions.push({ key: allPinned ? 'unpin' : 'pin', label: allPinned ? 'Unpin tabs' : 'Pin tabs' });

  const allMuted = tabs.every((tab) => !!(tab.mutedInfo?.muted));
  actions.push({ key: allMuted ? 'unmute' : 'mute', label: allMuted ? 'Unmute tabs' : 'Mute tabs' });

  return actions;
}

async function handleGroupMenuAction(action, tabs) {
  if (!tabs.length) return;
  switch (action) {
    case 'close': {
      const snapshots = tabs.map(snapshotTab).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      await pushUndo({ type: 'reopen-tabs', tabs: snapshots });
      for (const tab of tabs) {
        await closeTab(tab.id);
      }
      await refreshTabs();
      await refreshUndoPeek();
      showUndo('Closed tabs');
      break;
    }
    case 'pin':
    case 'unpin': {
      const targetPinned = action === 'pin';
      const updates = tabs.filter((tab) => !!tab.pinned !== targetPinned);
      if (!updates.length) return;
      for (const tab of updates) {
        await pushUndo({ type: 'update-tab', tabId: tab.id, prev: { pinned: tab.pinned } });
      }
      await Promise.all(updates.map((tab) => pinTab(tab.id, targetPinned)));
      await refreshTabs();
      await refreshUndoPeek();
      showUndo(targetPinned ? 'Pinned tabs' : 'Unpinned tabs');
      break;
    }
    case 'mute':
    case 'unmute': {
      const targetMuted = action === 'mute';
      const updates = tabs.filter((tab) => !!(tab.mutedInfo?.muted) !== targetMuted);
      if (!updates.length) return;
      for (const tab of updates) {
        await pushUndo({ type: 'update-tab', tabId: tab.id, prev: { muted: !!(tab.mutedInfo?.muted) } });
      }
      await Promise.all(updates.map((tab) => muteTab(tab.id, targetMuted)));
      await refreshTabs();
      await refreshUndoPeek();
      showUndo(targetMuted ? 'Muted tabs' : 'Unmuted tabs');
      break;
    }
    default:
      break;
  }
}

function describeDomainSection(tab) {
  try {
    const url = new URL(tab.url);
    const host = url.hostname || 'Unknown';
    const base = domainOf(tab.url) || host;
    const pathSeg = url.pathname.split('/').filter(Boolean)[0] || '';
    const detail = [];
    if (host !== base && base) detail.push(base);
    if (pathSeg) detail.push(`/${pathSeg}`);
    const subtitle = detail.length ? detail.join(' • ') : '';
    return {
      key: `${host}|${pathSeg}`,
      label: host || 'Unknown',
      subtitle
    };
  } catch {
    return { key: 'unknown', label: 'Unknown', subtitle: '' };
  }
}

function isSameDay(ts, nowTs) {
  if (!ts) return false;
  const a = new Date(ts);
  const b = new Date(nowTs);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function row(t) {
  const el = document.createElement('div');
  el.className = 'row';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  const titleText = t.title || '(untitled)';
  const urlText = t.url || '';
  el.setAttribute('aria-label', `Focus tab ${titleText}`);
  const pinTitle = t.pinned ? 'Unpin' : 'Pin';
  const muteTitle = t.mutedInfo?.muted ? 'Unmute' : 'Mute';
  const pinIcon = t.pinned ? 'pin-off' : 'pin';
  el.innerHTML = `
    <div class="favicon">${t.favIconUrl ? `<img src="${t.favIconUrl}" alt="" />` : ''}</div>
    <div class="meta">
      <div class="title">${escapeHtml(titleText)}</div>
      <div class="url">${escapeHtml(urlText)}</div>
    </div>
    <div class="actions">
      <button class="btn-icon pin" data-act="pin" title="${pinTitle}" aria-label="${pinTitle}"><svg class="svg-icon"><use href="icons.svg#${pinIcon}"/></svg><span class="sr-only">${pinTitle}</span></button>
      <button class="btn-icon mute" data-act="mute" title="${muteTitle}" aria-label="${muteTitle}"><svg class="svg-icon"><use href="${t.mutedInfo?.muted ? 'icons.svg#volume' : 'icons.svg#volume-x'}"/></svg><span class="sr-only">${muteTitle}</span></button>
      <button class="btn-icon discard" data-act="discard" title="Discard (free memory)" aria-label="Discard"><svg class="svg-icon"><use href="icons.svg#chip"/></svg><span class="sr-only">Discard</span></button>
      <button class="btn-icon close" data-act="close" title="Close tab" aria-label="Close"><svg class="svg-icon"><use href="icons.svg#x"/></svg><span class="sr-only">Close</span></button>
    </div>
  `;

  const focusTab = async () => { await switchTo(t.id); };

  el.addEventListener('click', async (evt) => {
    if (evt.target.closest('.actions')) return;
    await focusTab();
  });

  el.addEventListener('keydown', async (evt) => {
    if (evt.target.closest('.actions')) return;
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      await focusTab();
    }
  });
  el.querySelector('[data-act="close"]').addEventListener('click', async () => { await pushUndo({ type:'reopen-tabs', tabs:[snapshotTab(t)] }); await closeTab(t.id); showUndo('Tab closed'); await refreshTabs(); await refreshUndoPeek(); });
  el.querySelector('[data-act="pin"]').addEventListener('click', async () => { await pushUndo({ type:'update-tab', tabId:t.id, prev:{ pinned:t.pinned }}); await pinTab(t.id, !t.pinned); showUndo(t.pinned?'Unpinned':'Pinned'); await refreshTabs(); });
  el.querySelector('[data-act="mute"]').addEventListener('click', async () => { const muted=!!(t.mutedInfo?.muted); await pushUndo({ type:'update-tab', tabId:t.id, prev:{ muted }}); await muteTab(t.id, !muted); showUndo(muted?'Unmuted':'Muted'); await refreshTabs(); });
  el.querySelector('[data-act="discard"]').addEventListener('click', async () => { await pushUndo({ type:'reload-tab', tabId:t.id }); await discardTab(t.id); showUndo('Tab discarded'); await refreshTabs(); });
  return el;
}

function escapeHtml(str) { return (str || '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;' }[c])); }

search.addEventListener('input', () => { renderTabs(); });
if (groupingMode) {
  groupingMode.addEventListener('change', async () => {
    settings = await saveSettings({ groupingMode: groupingMode.value });
    allowEmptyModes.delete(groupingMode.value);
    renderTabs();
  });
}

if (toggleGroupsBtn) {
  toggleGroupsBtn.addEventListener('click', () => {
    const mode = lastRenderedMode;
    if (mode === 'none' || !lastRenderedGroupKeys.length) return;
    const set = getExpandedSet(mode);
    const allExpanded = lastRenderedGroupKeys.every((key) => set.has(key));
    if (allExpanded) {
      set.clear();
      allowEmptyModes.add(mode);
    } else {
      lastRenderedGroupKeys.forEach((key) => set.add(key));
      allowEmptyModes.delete(mode);
    }
    renderTabs();
  });
}

btnUndo.addEventListener('click', async () => { const res = await popUndo(); if (res.ok) { await refreshTabs(); await refreshUndoPeek(); } });
btnCloseDupes.addEventListener('click', async () => {
  const tabs = await getAllTabs({ currentWindowOnly: true });
  const seen = new Set();
  const closed = [];
  for (const t of tabs) {
    const key = (t.url || '').split('#')[0];
    if (!key) continue;
    if (seen.has(key)) { closed.push(snapshotTab(t)); await closeTab(t.id); } else { seen.add(key); }
  }
  if (closed.length) { await pushUndo({ type:'reopen-tabs', tabs: closed }); showUndo(`${closed.length} duplicate${closed.length>1?'s':''} closed`); }
  await refreshTabs();
  await refreshUndoPeek();
});

btnCreateGroups.addEventListener('click', async () => {
  const winTabs = await getAllTabs({ currentWindowOnly: true });
  if (!winTabs.length) return;
  const ok = confirm('Create Chrome tab groups by domain for the current window? You can Undo to ungroup.');
  if (!ok) return;
  const ids = winTabs.map(t => t.id);
  await pushUndo({ type: 'ungroup-tabs', tabIds: ids });
  await groupTabsByDomain(ids);
  showUndo('Created tab groups');
});

function showUndo() {}

// Neutral theme — no theme toggling

async function refreshUndoPeek() {
  const peek = await peekUndo();
  if (peek && peek.count) { undoBadge.hidden = false; undoBadge.textContent = String(peek.count); }
  else { undoBadge.hidden = true; undoBadge.textContent = ''; }
}

await load();
