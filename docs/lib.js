export const STORAGE_KEY = 'bankroll:v1';
export const APIFY_API = 'https://api.apify.com/v2';
export const APIFY_USER = 'acute_view';
export const APIFY_ACTORS = [
  'shopify-app-store-scraper', 'ats-jobs-scraper', 'workday-jobs-scraper', 'substack-free-posts-scraper',
  'sam-gov-opportunities', 'chrome-web-store-extension-scraper', 'sec-edgar-filings-scraper',
];

export const DEFAULT_STATE = {
  goal: { name: 'Xbox + GTA 6', amountUsd: 650, targetDate: '2027-06-30' },
  streams: [{ id: 'apify', name: 'Apify Actors', kind: 'apify', payout: 'Apify → PayPal → Cash App' }],
  entries: [],
};

const round2 = (n) => Math.round(n * 100) / 100;
const MAX_ETA_DAYS = 365 * 100;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function loadState(raw) {
  const base = structuredClone(DEFAULT_STATE);
  if (!raw) return base;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object' || !data.goal || !Array.isArray(data.streams) || !Array.isArray(data.entries)) {
    throw new Error('Not a Bankroll backup');
  }
  const state = { goal: { ...base.goal, ...data.goal }, streams: data.streams, entries: data.entries };
  if (!state.streams.some((s) => s.kind === 'apify')) state.streams.unshift(base.streams[0]);
  return state;
}

export function setGoal(state, { name, amountUsd, targetDate }) {
  const amount = Number(amountUsd);
  if (!(amount > 0)) throw new Error('Goal amount must be positive');
  state.goal = { name: String(name || state.goal.name).slice(0, 80), amountUsd: round2(amount), targetDate: targetDate || null };
  return state.goal;
}

export function addStream(state, { name, payout }) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) throw new Error('Stream name is required');
  let id = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stream';
  while (state.streams.some((s) => s.id === id)) id += '-2';
  const stream = { id, name: clean, kind: 'manual', payout: String(payout || '').slice(0, 80) };
  state.streams.push(stream);
  return stream;
}

export function removeStream(state, id) {
  if (state.entries.some((e) => e.streamId === id)) throw new Error('Stream has entries; delete them first');
  const before = state.streams.length;
  state.streams = state.streams.filter((s) => s.id !== id || s.kind === 'apify');
  if (state.streams.length === before) throw new Error('Stream not found or cannot be removed');
}

export function addEntry(state, { streamId, amountUsd, date, note, status }, today = new Date().toISOString().slice(0, 10)) {
  const amount = Number(amountUsd);
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Amount must be a non-zero number');
  if (!state.streams.some((s) => s.id === streamId)) throw new Error('Unknown stream');
  const day = date || today;
  if (!isDay(day)) throw new Error('Date must be YYYY-MM-DD');
  const entry = {
    id: newId(), streamId, amountUsd: round2(amount), date: day,
    note: String(note || '').slice(0, 140), status: status === 'cashed' ? 'cashed' : 'earned', createdAt: new Date().toISOString(),
  };
  state.entries.push(entry);
  return entry;
}

export function toggleCashed(state, id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) throw new Error('Entry not found');
  entry.status = entry.status === 'cashed' ? 'earned' : 'cashed';
  return entry;
}

export function removeEntry(state, id) {
  const before = state.entries.length;
  state.entries = state.entries.filter((e) => e.id !== id);
  if (state.entries.length === before) throw new Error('Entry not found');
}

export function summarize(state, now = new Date(), today = now.toISOString().slice(0, 10)) {
  const total = state.entries.reduce((sum, e) => sum + e.amountUsd, 0);
  const cashed = state.entries.filter((e) => e.status === 'cashed').reduce((s, e) => s + e.amountUsd, 0);
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  const last30 = state.entries.filter((e) => e.date >= since && e.date <= today).reduce((s, e) => s + e.amountUsd, 0);
  const byStream = Object.fromEntries(state.streams.map((s) => [s.id, 0]));
  for (const e of state.entries) byStream[e.streamId] = (byStream[e.streamId] || 0) + e.amountUsd;
  const goal = state.goal.amountUsd;
  const remaining = Math.max(0, goal - total);
  const perDay = round2(last30) / 30;
  let etaDate = null;
  if (remaining === 0) etaDate = today;
  else if (perDay > 0 && remaining / perDay < MAX_ETA_DAYS) etaDate = new Date(now.getTime() + (remaining / perDay) * 86400000).toISOString().slice(0, 10);
  let neededPerWeek = null;
  if (state.goal.targetDate && remaining > 0) {
    const days = (new Date(`${state.goal.targetDate}T00:00:00Z`) - now) / 86400000;
    if (days > 0) neededPerWeek = round2((remaining / days) * 7);
  }
  return {
    totalUsd: round2(total), cashedUsd: round2(cashed), pendingUsd: round2(total - cashed), last30Usd: round2(last30),
    remainingUsd: round2(remaining), progress: goal > 0 ? Math.min(1, total / goal) : 0,
    byStream: Object.fromEntries(Object.entries(byStream).map(([k, v]) => [k, round2(v)])), etaDate, neededPerWeek,
  };
}

export function priceOf(pricingInfos) {
  const current = (pricingInfos || []).at(-1);
  if (!current) return null;
  if (current.pricingModel === 'PAY_PER_EVENT') {
    const events = current.pricingPerEvent?.actorChargeEvents || {};
    const [key, ev] = Object.entries(events).find(([k]) => k !== 'apify-actor-start') || [];
    if (!ev) return { model: 'PAY_PER_EVENT', label: 'Pay per event' };
    const usd = ev.eventPriceUsd ?? Object.values(ev.eventTieredPricingUsd || {})[0]?.tieredEventPriceUsd;
    return { model: 'PAY_PER_EVENT', usd, unit: ev.eventTitle || key, perThousandUsd: usd != null ? round2(usd * 1000) : null };
  }
  if (current.pricingModel === 'PRICE_PER_DATASET_ITEM') return { model: current.pricingModel, perThousandUsd: current.pricePerUnitUsd * 1000, unit: 'result' };
  if (current.pricingModel === 'FLAT_PRICE_PER_MONTH') return { model: current.pricingModel, usd: current.pricePerUnitUsd, unit: 'month' };
  return { model: current.pricingModel };
}

// Public Actors are readable without a token; a 404 means the Actor isn't public (yet).
export async function fetchActors(fetchFn = fetch, user = APIFY_USER, names = APIFY_ACTORS) {
  let listed = [];
  try {
    const res = await fetchFn(`${APIFY_API}/store?username=${encodeURIComponent(user)}&limit=100`);
    if (res.ok) listed = ((await res.json()).data?.items || []).filter((a) => a.username === user).map((a) => a.name);
  } catch { /* fall back to the known list */ }
  const all = [...new Set([...names, ...listed])];
  const actors = await Promise.all(all.map(async (name) => {
    const res = await fetchFn(`${APIFY_API}/acts/${user}~${name}`);
    if (res.status === 404) {
      return { name, title: name, isPublic: false, storeUrl: `https://apify.com/${user}/${name}`, consoleUrl: 'https://console.apify.com/actors', users30Days: 0, price: null };
    }
    if (!res.ok) throw new Error(`Apify ${res.status} for ${name}`);
    const d = (await res.json()).data;
    const s = d.stats || {};
    return {
      name: d.name, title: d.title || d.name, isPublic: !!d.isPublic,
      storeUrl: `https://apify.com/${user}/${d.name}`, consoleUrl: `https://console.apify.com/actors/${d.id}`,
      users7Days: s.totalUsers7Days || 0, users30Days: s.totalUsers30Days || 0, totalRuns: s.totalRuns || 0, price: priceOf(d.pricingInfos),
    };
  }));
  actors.sort((a, b) => Number(b.isPublic) - Number(a.isPublic) || b.users30Days - a.users30Days || a.title.localeCompare(b.title));
  return { username: user, actors };
}
