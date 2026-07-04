/* GitHub Actions で20分ごとに実行するデータ収集スクリプト。
   - 両パークの待ち時間スナップショットを data/today.json に追記
   - アトラクション別の 最大/平均 計算用アキュムレータを更新
   - DPA の販売状態を監視し、売切に変わった時刻を記録
   - 日付が変わったら前日分を data/history.json に集約
     （パーク別スコア・アトラクション別 max/avg。予測モデルの学習データになる） */
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
  const waits = [];   // パーク全体
  const attrs = [];   // アトラクション別
  const dpa = [];
  for (const e of liveData) {
    if (e.entityType !== 'ATTRACTION') continue;
    const q = e.queue || {};
    if (e.status === 'OPERATING' && q.STANDBY && q.STANDBY.waitTime != null) {
      waits.push(q.STANDBY.waitTime);
      attrs.push({ name: e.name, wait: q.STANDBY.waitTime });
    }
    const p = q.PAID_RETURN_TIME || q.PAID_STANDBY;
    if (p) dpa.push({ name: e.name, state: p.state || 'UNKNOWN' });
  }
  return {
    avg: waits.length ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : null,
    max: waits.length ? Math.max(...waits) : null,
    count: waits.length,
    attrs, dpa,
  };
}

const today = load('data/today.json', { date: null, snapshots: [], dpa: {}, attrs: {} });
if (!today.attrs) today.attrs = {};
const history = load('data/history.json', { days: [] });
const date = jstDate();

// 日付が変わったら前日を履歴へ集約
if (today.date && today.date !== date && today.snapshots.length) {
  const daily = { date: today.date };
  for (const k of Object.keys(PARKS)) {
    const rows = today.snapshots.map((s) => s[k]).filter((x) => x && x.avg != null);
    if (!rows.length) continue;
    const peakAvg = Math.max(...rows.map((r) => r.avg));
    const attractions = Object.entries(today.attrs)
      .filter(([key]) => key.startsWith(k + '|'))
      .map(([key, a]) => ({ name: key.slice(k.length + 1), max: a.max, avg: Math.round(a.sum / a.n) }));
    daily[k] = {
      peakAvg,
      max: Math.max(...rows.map((r) => r.max)),
      score: Math.max(2, Math.min(100, peakAvg * 2)),
      attractions,
    };
  }
  // 互換用の総合スコア
  const scores = ['tdl', 'tds'].map((k) => daily[k]?.score).filter((v) => v != null);
  daily.score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  if ((daily.tdl || daily.tds) && !history.days.some((d) => d.date === today.date)) history.days.push(daily);
  if (history.days.length > 800) history.days = history.days.slice(-800);
  writeFileSync('data/history.json', JSON.stringify(history));
  today.date = date; today.snapshots = []; today.dpa = {}; today.attrs = {};
}
if (!today.date) today.date = date;

const snap = { t: jstTime() };
let hasData = false;
for (const [key, id] of Object.entries(PARKS)) {
  try {
    const live = await fetchLive(id);
    const sum = summarize(live);
    snap[key] = { avg: sum.avg, max: sum.max, count: sum.count };
    if (sum.count > 0) hasData = true;
    // アトラクション別アキュムレータ（最大値と平均計算用）
    for (const a of sum.attrs) {
      const k = `${key}|${a.name}`;
      const acc = today.attrs[k] || { max: 0, sum: 0, n: 0 };
      acc.max = Math.max(acc.max, a.wait);
      acc.sum += a.wait;
      acc.n += 1;
      today.attrs[k] = acc;
    }
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
if (hasData) today.snapshots.push(snap);
if (today.snapshots.length > 60) today.snapshots = today.snapshots.slice(-60);

writeFileSync('data/today.json', JSON.stringify(today));
console.log('collected', date, jstTime(), JSON.stringify(snap));
