import { test } from 'node:test';
import assert from 'node:assert';
import * as lib from '../docs/lib.js';

const fresh = () => lib.loadState(null);

test('entries add up toward the goal and survive a save/load round trip', () => {
  const s = fresh();
  lib.addEntry(s, { streamId: 'apify', amountUsd: '20', date: '2026-11-20', status: 'cashed' });
  lib.addEntry(s, { streamId: 'apify', amountUsd: 5.555, date: '2026-11-21' });
  const sum = lib.summarize(s, new Date('2026-11-21T12:00:00Z'));
  assert.equal(sum.totalUsd, 25.56);
  assert.equal(sum.cashedUsd, 20);
  assert.equal(sum.remainingUsd, 624.44);
  assert.ok(sum.etaDate > '2026-11-21');
  assert.equal(lib.loadState(JSON.stringify(s)).entries.length, 2);
});

test('default state matches the data on the old Devin App', () => {
  const s = fresh();
  assert.deepEqual(s.goal, { name: 'Xbox + GTA 6', amountUsd: 650, targetDate: '2027-06-30' });
  assert.deepEqual(s.streams.map((x) => x.id), ['apify']);
  assert.equal(s.entries.length, 0);
});

test('validation rejects bad input and bad backups', () => {
  const s = fresh();
  assert.throws(() => lib.addEntry(s, { streamId: 'nope', amountUsd: 1 }));
  assert.throws(() => lib.addEntry(s, { streamId: 'apify', amountUsd: 'abc' }));
  assert.throws(() => lib.setGoal(s, { amountUsd: 0 }));
  assert.throws(() => lib.loadState('{"hello":1}'));
});

test('streams can be added and removed only when empty', () => {
  const s = fresh();
  const st = lib.addStream(s, { name: 'Fiverr gigs' });
  assert.equal(st.id, 'fiverr-gigs');
  const e = lib.addEntry(s, { streamId: st.id, amountUsd: 10 });
  assert.throws(() => lib.removeStream(s, st.id));
  lib.toggleCashed(s, e.id);
  assert.equal(s.entries[0].status, 'cashed');
  lib.removeEntry(s, e.id);
  lib.removeStream(s, st.id);
  assert.throws(() => lib.removeStream(s, 'apify'));
});

test('pay-per-event pricing reads per-1k price', () => {
  const p = lib.priceOf([{ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: { filing: { eventTitle: 'Filing saved', eventPriceUsd: 0.0003 } } } }]);
  assert.equal(p.perThousandUsd, 0.3);
});

test('near-zero net income gives no ETA instead of throwing', () => {
  const s = fresh();
  for (const a of [0.1, 0.2, -0.3]) lib.addEntry(s, { streamId: 'apify', amountUsd: a, date: '2026-11-20' });
  assert.equal(lib.summarize(s, new Date('2026-11-21T12:00:00Z')).etaDate, null);
});

test('last 30 days excludes future and 30-day-old entries, using the local date', () => {
  const s = fresh();
  for (const [amountUsd, date] of [[10, '2026-11-21'], [20, '2026-10-23'], [40, '2026-10-22'], [80, '2026-11-25']]) lib.addEntry(s, { streamId: 'apify', amountUsd, date });
  assert.equal(lib.summarize(s, new Date('2026-11-21T12:00:00Z')).last30Usd, 30);
  assert.equal(lib.summarize(s, new Date('2026-11-21T20:00:00Z'), '2026-11-25').last30Usd, 90);
});

test('fetchActors reads public Actors without a token and marks 404s as not public', async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.includes('/store?')) return { ok: true, status: 200, json: async () => ({ data: { items: [{ username: 'u', name: 'b' }] } }) };
    if (url.endsWith('~a')) return { ok: true, status: 200, json: async () => ({ data: { id: '1', name: 'a', title: 'A', isPublic: true, stats: { totalUsers30Days: 3 }, pricingInfos: [] } }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const { actors } = await lib.fetchActors(fake, 'u', ['a']);
  assert.deepEqual(actors.map((a) => [a.name, a.isPublic, a.users30Days]), [['a', true, 3], ['b', false, 0]]);
  assert.ok(calls.every((u) => !u.includes('token')));
});
