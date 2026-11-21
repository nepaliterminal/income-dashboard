const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_STATE = {
  goal: { name: 'Xbox + GTA 6', amountUsd: 650, targetDate: '2027-06-30' },
  streams: [
    { id: 'apify', name: 'Apify Actors', kind: 'apify', payout: 'Apify → PayPal → Cash App' },
  ],
  entries: [],
};

class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.state = fs.existsSync(file)
      ? { ...structuredClone(DEFAULT_STATE), ...JSON.parse(fs.readFileSync(file, 'utf8')) }
      : structuredClone(DEFAULT_STATE);
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }

  setGoal({ name, amountUsd, targetDate }) {
    const amount = Number(amountUsd);
    if (!(amount > 0)) throw new Error('Goal amount must be positive');
    this.state.goal = {
      name: String(name || this.state.goal.name).slice(0, 80),
      amountUsd: Math.round(amount * 100) / 100,
      targetDate: targetDate || null,
    };
    this.save();
    return this.state.goal;
  }

  addStream({ name, payout }) {
    const clean = String(name || '').trim().slice(0, 60);
    if (!clean) throw new Error('Stream name is required');
    let id = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stream';
    while (this.state.streams.some((s) => s.id === id)) id += '-2';
    const stream = { id, name: clean, kind: 'manual', payout: String(payout || '').slice(0, 80) };
    this.state.streams.push(stream);
    this.save();
    return stream;
  }

  removeStream(id) {
    if (this.state.entries.some((e) => e.streamId === id)) throw new Error('Stream has entries; delete them first');
    const before = this.state.streams.length;
    this.state.streams = this.state.streams.filter((s) => s.id !== id || s.kind === 'apify');
    if (this.state.streams.length === before) throw new Error('Stream not found or cannot be removed');
    this.save();
  }

  addEntry({ streamId, amountUsd, date, note, status }) {
    const amount = Number(amountUsd);
    if (!Number.isFinite(amount) || amount === 0) throw new Error('Amount must be a non-zero number');
    if (!this.state.streams.some((s) => s.id === streamId)) throw new Error('Unknown stream');
    const day = date || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Date must be YYYY-MM-DD');
    const entry = {
      id: crypto.randomUUID(),
      streamId,
      amountUsd: Math.round(amount * 100) / 100,
      date: day,
      note: String(note || '').slice(0, 140),
      status: status === 'cashed' ? 'cashed' : 'earned',
      createdAt: new Date().toISOString(),
    };
    this.state.entries.push(entry);
    this.save();
    return entry;
  }

  updateEntry(id, patch) {
    const entry = this.state.entries.find((e) => e.id === id);
    if (!entry) throw new Error('Entry not found');
    if (patch.status) entry.status = patch.status === 'cashed' ? 'cashed' : 'earned';
    this.save();
    return entry;
  }

  removeEntry(id) {
    const before = this.state.entries.length;
    this.state.entries = this.state.entries.filter((e) => e.id !== id);
    if (this.state.entries.length === before) throw new Error('Entry not found');
    this.save();
  }
}

function summarize(state, now = new Date()) {
  const total = state.entries.reduce((sum, e) => sum + e.amountUsd, 0);
  const cashed = state.entries.filter((e) => e.status === 'cashed').reduce((s, e) => s + e.amountUsd, 0);
  const since = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const last30 = state.entries.filter((e) => e.date >= since).reduce((s, e) => s + e.amountUsd, 0);
  const byStream = Object.fromEntries(state.streams.map((s) => [s.id, 0]));
  for (const e of state.entries) byStream[e.streamId] = (byStream[e.streamId] || 0) + e.amountUsd;
  const goal = state.goal.amountUsd;
  const remaining = Math.max(0, goal - total);
  const perDay = last30 / 30;
  let etaDate = null;
  if (remaining === 0) etaDate = now.toISOString().slice(0, 10);
  else if (perDay > 0) etaDate = new Date(now.getTime() + (remaining / perDay) * 86400000).toISOString().slice(0, 10);
  let neededPerWeek = null;
  if (state.goal.targetDate && remaining > 0) {
    const days = (new Date(`${state.goal.targetDate}T00:00:00Z`) - now) / 86400000;
    if (days > 0) neededPerWeek = round2((remaining / days) * 7);
  }
  return {
    totalUsd: round2(total),
    cashedUsd: round2(cashed),
    pendingUsd: round2(total - cashed),
    last30Usd: round2(last30),
    remainingUsd: round2(remaining),
    progress: goal > 0 ? Math.min(1, total / goal) : 0,
    byStream: Object.fromEntries(Object.entries(byStream).map(([k, v]) => [k, round2(v)])),
    etaDate,
    neededPerWeek,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { Store, summarize, DEFAULT_STATE };
