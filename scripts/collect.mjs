/* GitHub Actions で20分ごとに実行するデータ収集スクリプト。
   - 両パークの待ち時間スナップショットを data/today.json に追記
   - DPA の販売状態を監視し、売切に変わった時刻を記録
   - 日付が変わったら前日分を data/history.json に集約（予測モデルの学習データ） */
import { readFileSync, writeFileSync } from 'node:fs';

const PARKS = {
  tdl: '3cc919f1-d16d-43e0-8c3f-1dd269bd1a42',
  tds: '67b290d5-3478-4f23-b601-2f8fb71ba803',
};

const jstNow = () => new Date(Date.now() + 9 * 3600 * 1000);
const jstDate = () => jstNow().toISOString().slice(0, 10);
const jstTime = () => jstNow().toISOString().slice(11, 16);

function load(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

async function fetchLive(parkId) {
  const res = await fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/live`, {
    headers: { 'User-Agent': 'tdr-news-dashboard (github.com/aimimizuku-cpu/tdr-news)' },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()).liveData || [];
}

function summarize(liveData) {
  const waits = [];
  const dpa = [];
  for (const e of liveData) {
    if (e.entityType !== 'ATTRACTION') continue;
    const q = e.queue || {};
    if (e.status === 'OPERATING' && q.STANDBY && q.STANDBY.waitTime != null) waits.push(q.STANDBY.waitTime);
    const p = q.PAID_RETURN_TIME || q.PAID_STANDBY;
    if (p) dpa.push({ name: e.name, state: p.state || 'UNKNOWN' });
  }
  if (!waits.length) return { avg: null, max: null, count: 0, dpa };
  return {
    avg: Math.round(waits.reduce((s, w) => s + w, 0) / waits.length),
    max: Math.max(...waits),
    count: waits.length,
    dpa,
  };
}

const today = load('data/today.json', { date: null, snapshots: [], dpa: {} });
const history = load('data/history.json', { days: [] });
const date = jstDate();

// 日付が変わったら前日を履歴へ集約
if (today.date && today.date !== date && today.snapshots.length) {
  const daily = { date: today.date };
  for (const k of Object.keys(PARKS)) {
    const rows = today.snapshots.map((s) => s[k]).filter((x) => x && x.avg != null);
    if (rows.length) {
      const peak = Math.max(...rows.map((r) => r.avg));
      daily[k] = { peakAvg: peak, max: Math.max(...rows.map((r) => r.max)) };
    }
  }
  const peaks = ['tdl', 'tds'].map((k) => daily[k]?.peakAvg).filter((v) => v != null);
  daily.score = peaks.length ? Math.max(2, Math.min(100, Math.round((peaks.reduce((a, b) => a + b, 0) / peaks.length) * 2))) : null;
  if (!history.days.some((d) => d.date === today.date)) history.days.push(daily);
  if (history.days.length > 800) history.days = history.days.slice(-800);
  writeFileSync('data/history.json', JSON.stringify(history));
  today.date = date; today.snapshots = []; today.dpa = {};
}
if (!today.date) today.date = date;

const snap = { t: jstTime() };
for (const [key, id] of Object.entries(PARKS)) {
  try {
    const live = await fetchLive(id);
    const sum = summarize(live);
    snap[key] = { avg: sum.avg, max: sum.max, count: sum.count };
    // DPA 状態遷移の記録（販売中 → 売切 の時刻を保存）
    for (const d of sum.dpa) {
      const k = `${key}|${d.name}`;
      const prev = today.dpa[k];
      if (!prev) {
        today.dpa[k] = { park: key, name: d.name, state: d.state, firstSeen: jstTime(), soldOutAt: null };
      } else {
        if (prev.state === 'AVAILABLE' && d.state !== 'AVAILABLE' && !prev.soldOutAt &&
            ['FINISHED', 'SOLD_OUT', 'NOT_AVAILABLE'].includes(d.state)) {
          prev.soldOutAt = jstTime();
        }
        prev.state = d.state;
      }
    }
  } catch (e) {
    console.error(`fetch failed for ${key}:`, e.message);
  }
}
if (snap.tdl || snap.tds) today.snapshots.push(snap);
if (today.snapshots.length > 60) today.snapshots = today.snapshots.slice(-60);

writeFileSync('data/today.json', JSON.stringify(today));
console.log('collected', date, jstTime(), JSON.stringify(snap));
