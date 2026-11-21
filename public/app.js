const $ = (id) => document.getElementById(id);
const usd = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdShort = (n) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0 });
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = null;

async function call(path, method = 'GET', body) {
  const res = await fetch(`api/${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  state = data;
  render();
  return data;
}

function ago(iso) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function render() {
  const { goal, summary, streams, entries, apify } = state;
  $('goal-name').textContent = goal.name;
  $('total').textContent = usdShort(summary.totalUsd);
  $('goal-amount').textContent = usdShort(goal.amountUsd);
  const pct = Math.round(summary.progress * 1000) / 10;
  $('bar-fill').style.width = `${pct}%`;
  $('bar').setAttribute('aria-valuenow', pct);
  $('remaining').textContent = usd(summary.remainingUsd);
  $('last30').textContent = usd(summary.last30Usd);
  $('cashed').textContent = usd(summary.cashedUsd);

  const pace = [];
  pace.push(`${pct}% there.`);
  if (summary.remainingUsd === 0) pace.push('Goal reached. Go get it.');
  else {
    if (summary.etaDate) pace.push(`At the last 30 days' pace you hit it around ${fmtDate(summary.etaDate)}.`);
    if (summary.neededPerWeek != null && goal.targetDate) pace.push(`Need ${usd(summary.neededPerWeek)}/week to make ${fmtDate(goal.targetDate)}.`);
  }
  $('pace').textContent = pace.join(' ');

  const sel = $('stream-select');
  const prev = sel.value;
  sel.innerHTML = streams.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  if (prev && streams.some((s) => s.id === prev)) sel.value = prev;

  $('streams').innerHTML = streams.map((s) => {
    const count = s.kind === 'apify' ? apify.actors.filter((a) => a.isPublic).length : null;
    const sub = [s.payout, count != null ? `${count} live in Store` : null].filter(Boolean).join(' · ');
    const canDelete = s.kind !== 'apify' && !entries.some((e) => e.streamId === s.id);
    return `<li><div class="main"><div class="title">${esc(s.name)}</div><div class="sub">${esc(sub)}</div></div>
      <div class="right"><div class="num">${usd(summary.byStream[s.id] || 0)}</div>${canDelete ? `<button class="link danger small" data-del-stream="${esc(s.id)}">Remove</button>` : ''}</div></li>`;
  }).join('');

  const live = apify.actors.filter((a) => a.isPublic).length;
  $('apify-meta').textContent = apify.error
    ? `Couldn't load Apify: ${apify.error}`
    : `${live} live, ${apify.actors.length - live} waiting · updated ${ago(apify.refreshedAt)}. Apify doesn't share earnings by API, so log payouts above.`;
  $('actors').innerHTML = apify.actors.length ? apify.actors.map((a) => {
    const price = a.price?.perThousandUsd != null ? `${usd(a.price.perThousandUsd)}/1k ${esc(a.price.unit || 'results')}` : (a.price ? 'priced' : 'no price yet');
    return `<li><div class="main"><div class="title"><a href="${a.isPublic ? a.storeUrl : a.consoleUrl}" target="_blank" rel="noopener">${esc(a.title)}</a></div>
      <div class="sub"><span class="pill ${a.isPublic ? 'live' : ''}">${a.isPublic ? 'Live' : 'Not public'}</span> ${price}</div></div>
      <div class="right"><div class="num">${a.users30Days}</div><div class="sub">users 30d</div></div></li>`;
  }).join('') : '<li class="empty">No Actors loaded yet.</li>';

  const names = Object.fromEntries(streams.map((s) => [s.id, s.name]));
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  $('entries').innerHTML = sorted.length ? sorted.map((e) => `<li><div class="main"><div class="title">${esc(names[e.streamId] || e.streamId)}</div>
      <div class="sub">${fmtDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
      <div class="right"><div class="num">${usd(e.amountUsd)}</div>
      <div class="entry-actions"><button class="link small" data-toggle="${e.id}">${e.status === 'cashed' ? 'In Cash App ✓' : 'Mark cashed'}</button><button class="link danger small" data-del="${e.id}">Delete</button></div></div></li>`).join('')
    : '<li class="empty">Nothing logged yet. Your first payout goes here.</li>';
}

function showError(err) {
  const el = $('form-error');
  el.textContent = err.message;
  el.hidden = false;
}

$('entry-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('form-error').hidden = true;
  const f = new FormData(ev.target);
  try {
    await call('entries', 'POST', {
      amountUsd: f.get('amountUsd'), streamId: f.get('streamId'), date: f.get('date') || undefined,
      note: f.get('note'), status: f.get('cashed') ? 'cashed' : 'earned',
    });
    ev.target.reset();
    ev.target.date.valueAsDate = new Date();
  } catch (err) { showError(err); }
});

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  try {
    if (t.dataset.del && confirm('Delete this entry?')) await call(`entries/${t.dataset.del}`, 'DELETE');
    if (t.dataset.toggle) {
      const e = state.entries.find((x) => x.id === t.dataset.toggle);
      await call(`entries/${e.id}`, 'PATCH', { status: e.status === 'cashed' ? 'earned' : 'cashed' });
    }
    if (t.dataset.delStream && confirm('Remove this stream?')) await call(`streams/${t.dataset.delStream}`, 'DELETE');
  } catch (err) { alert(err.message); }
});

$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  try { await call('refresh', 'POST'); } catch (err) { alert(err.message); }
  $('refresh').disabled = false;
});

$('edit-goal').addEventListener('click', () => {
  const f = $('goal-form');
  f.name.value = state.goal.name;
  f.amountUsd.value = state.goal.amountUsd;
  f.targetDate.value = state.goal.targetDate || '';
  $('goal-dialog').showModal();
});
$('goal-dialog').addEventListener('close', async () => {
  if ($('goal-dialog').returnValue !== 'save') return;
  const f = $('goal-form');
  try { await call('goal', 'PUT', { name: f.name.value, amountUsd: f.amountUsd.value, targetDate: f.targetDate.value || null }); } catch (err) { alert(err.message); }
});

$('add-stream').addEventListener('click', () => { $('stream-form').reset(); $('stream-dialog').showModal(); });
$('stream-dialog').addEventListener('close', async () => {
  if ($('stream-dialog').returnValue !== 'save') return;
  const f = $('stream-form');
  try { await call('streams', 'POST', { name: f.name.value, payout: f.payout.value }); } catch (err) { alert(err.message); }
});

$('entry-form').date.valueAsDate = new Date();
call('data').catch((err) => { document.querySelector('main').insertAdjacentHTML('afterbegin', `<p class="error">${esc(err.message)}</p>`); });
setInterval(() => call('data').catch(() => {}), 60000);
