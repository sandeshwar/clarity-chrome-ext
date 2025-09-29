// Simple search scoring across title + url

export function normalize(str) {
  return (str || "").toLowerCase();
}

export function scoreTab(tab, query) {
  if (!query) return 1; // show all if empty
  const q = normalize(query);
  const title = normalize(tab.title);
  const url = normalize(tab.url);

  if (!q) return 1;

  // Prefer title matches, then URL
  const inTitle = title.indexOf(q);
  const inUrl = url.indexOf(q);

  if (inTitle === -1 && inUrl === -1) return -1;

  // closer to start is better
  const titleScore = inTitle === -1 ? 0 : 100 - Math.min(inTitle, 100);
  const urlScore = inUrl === -1 ? 0 : 50 - Math.min(inUrl, 50);
  return titleScore + urlScore;
}

export function filterAndSortTabs(tabs, query) {
  const scored = tabs
    .map(t => ({ tab: t, score: scoreTab(t, query) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score);
  return scored.map(x => x.tab);
}

