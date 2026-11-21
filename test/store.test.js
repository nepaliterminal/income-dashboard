const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, summarize } = require('../store');
const { priceOf } = require('../apify');

const tmpStore = () => new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inc-')), 'db.json'));

test('entries add up toward the goal and persist', () => {
  const s = tmpStore();
  s.addEntry({ streamId: 'apify', amountUsd: '20', date: '2026-11-20', status: 'cashed' });
  s.addEntry({ streamId: 'apify', amountUsd: 5.555, date: '2026-11-21' });
  const sum = summarize(s.state, new Date('2026-11-21T12:00:00Z'));
  assert.equal(sum.totalUsd, 25.56);
  assert.equal(sum.cashedUsd, 20);
  assert.equal(sum.remainingUsd, 624.44);
  assert.ok(sum.etaDate > '2026-11-21');
  assert.equal(new Store(s.file).state.entries.length, 2);
});

test('validation rejects bad input', () => {
  const s = tmpStore();
  assert.throws(() => s.addEntry({ streamId: 'nope', amountUsd: 1 }));
  assert.throws(() => s.addEntry({ streamId: 'apify', amountUsd: 'abc' }));
  assert.throws(() => s.setGoal({ amountUsd: 0 }));
});

test('streams can be added and removed only when empty', () => {
  const s = tmpStore();
  const st = s.addStream({ name: 'Fiverr gigs' });
  assert.equal(st.id, 'fiverr-gigs');
  const e = s.addEntry({ streamId: st.id, amountUsd: 10 });
  assert.throws(() => s.removeStream(st.id));
  s.removeEntry(e.id);
  s.removeStream(st.id);
  assert.throws(() => s.removeStream('apify'));
});

test('pay-per-event pricing reads per-1k price', () => {
  const p = priceOf([{ pricingModel: 'PAY_PER_EVENT', pricingPerEvent: { actorChargeEvents: { filing: { eventTitle: 'Filing saved', eventPriceUsd: 0.0003 } } } }]);
  assert.equal(p.perThousandUsd, 0.3);
});

test('near-zero net income gives no ETA instead of throwing', () => {
  const s = tmpStore();
  for (const a of [0.1, 0.2, -0.3]) s.addEntry({ streamId: 'apify', amountUsd: a, date: '2026-11-20' });
  assert.equal(summarize(s.state, new Date('2026-11-21T12:00:00Z')).etaDate, null);
});

test('last 30 days excludes future and 30-day-old entries', () => {
  const s = tmpStore();
  s.addEntry({ streamId: 'apify', amountUsd: 10, date: '2026-11-21' });
  s.addEntry({ streamId: 'apify', amountUsd: 20, date: '2026-10-23' });
  s.addEntry({ streamId: 'apify', amountUsd: 40, date: '2026-10-22' });
  s.addEntry({ streamId: 'apify', amountUsd: 80, date: '2026-11-25' });
  assert.equal(summarize(s.state, new Date('2026-11-21T12:00:00Z')).last30Usd, 30);
});
