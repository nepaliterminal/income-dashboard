const API = 'https://api.apify.com/v2';

async function getJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Apify ${res.status} for ${url.replace(API, '')}`);
  return (await res.json()).data;
}

function priceOf(pricingInfos) {
  const current = (pricingInfos || []).at(-1);
  if (!current) return null;
  if (current.pricingModel === 'PAY_PER_EVENT') {
    const events = current.pricingPerEvent?.actorChargeEvents || {};
    const [key, ev] = Object.entries(events).find(([k]) => k !== 'apify-actor-start') || [];
    if (!ev) return { model: 'PAY_PER_EVENT', label: 'Pay per event' };
    const usd = ev.eventPriceUsd ?? Object.values(ev.eventTieredPricingUsd || {})[0]?.tieredEventPriceUsd;
    return { model: 'PAY_PER_EVENT', usd, unit: ev.eventTitle || key, perThousandUsd: usd != null ? Math.round(usd * 1000 * 100) / 100 : null };
  }
  if (current.pricingModel === 'PRICE_PER_DATASET_ITEM') {
    return { model: current.pricingModel, perThousandUsd: current.pricePerUnitUsd * 1000, unit: 'result' };
  }
  if (current.pricingModel === 'FLAT_PRICE_PER_MONTH') return { model: current.pricingModel, usd: current.pricePerUnitUsd, unit: 'month' };
  return { model: current.pricingModel };
}

async function fetchActors(token) {
  const me = await getJson(`${API}/users/me`, token);
  const list = await getJson(`${API}/acts?my=1&limit=100`, token);
  const actors = await Promise.all(
    list.items.map(async (a) => {
      const d = await getJson(`${API}/acts/${a.id}`, token);
      const s = d.stats || {};
      return {
        id: d.id,
        name: d.name,
        title: d.title || d.name,
        isPublic: !!d.isPublic,
        storeUrl: `https://apify.com/${me.username}/${d.name}`,
        consoleUrl: `https://console.apify.com/actors/${d.id}`,
        users7Days: s.totalUsers7Days || 0,
        users30Days: s.totalUsers30Days || 0,
        totalUsers: s.totalUsers || 0,
        totalRuns: s.totalRuns || 0,
        lastRunAt: s.lastRunStartedAt || null,
        price: priceOf(d.pricingInfos),
      };
    }),
  );
  actors.sort((a, b) => Number(b.isPublic) - Number(a.isPublic) || b.users30Days - a.users30Days || a.title.localeCompare(b.title));
  return { username: me.username, actors };
}

module.exports = { fetchActors, priceOf };
