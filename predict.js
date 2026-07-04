/* ===== 混雑予測AI（統計学習モデル） =====
   要因: 曜日 / 祝日・連休 / 学校休暇 / イベント期間（開始・終了ブースト）/ グッズ発売日 /
         周辺イベント（幕張メッセ等）/ アトラクション休止 / 天気予報（7日先まで）/
         実測履歴（GitHub Actions が蓄積、同月・同曜日区分で自動補正） */
'use strict';

// ---------- 日本の祝日（2026-2027） ----------
const JP_HOLIDAYS = {
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日', '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日', '2026-05-06': '振替休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日', '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日', '2027-03-22': '振替休日', '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日', '2027-05-05': 'こどもの日', '2027-07-19': '海の日', '2027-08-11': '山の日',
  '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日', '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
};

// 月別ベース（過去の混雑傾向: 3月春休み・10月ハロウィーン・年末が高い）
const MONTH_BASE = { 1: -6, 2: -3, 3: 10, 4: 1, 5: 3, 6: -5, 7: 3, 8: 7, 9: 6, 10: 10, 11: 8, 12: 9 };
const WEEKDAY_ADJ = { 0: 8, 1: -4, 2: -6, 3: -6, 4: -4, 5: 2, 6: 14 }; // 日月火水木金土

const predictState = {
  events: [], goods: [], nearby: [], closures: [],
  history: [], weather: null,
  monthChart: null, built: false,
  cache: new Map(),
};

// ---------- ユーティリティ ----------
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseD = (s) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function isHoliday(ds) { return JP_HOLIDAYS[ds] || null; }
function isSchoolBreak(d) {
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 3 && day >= 20) || (m === 4 && day <= 7)) return '春休み';
  if ((m === 7 && day >= 18) || m === 8) return '夏休み';
  if ((m === 12 && day >= 23) || (m === 1 && day <= 7)) return '冬休み';
  return null;
}

// ---------- 予測モデル ----------
function predictDay(d) {
  const ds = dstr(d);
  if (predictState.cache.has(ds)) return predictState.cache.get(ds);

  const factors = [];
  let score = 42;
  factors.push({ name: '基準値', v: 42 });

  const mb = MONTH_BASE[d.getMonth() + 1];
  if (mb) factors.push({ name: `季節傾向（${d.getMonth() + 1}月）`, v: mb });
  score += mb;

  const wa = WEEKDAY_ADJ[d.getDay()];
  if (wa) factors.push({ name: `曜日（${DOW[d.getDay()]}曜日）`, v: wa });
  score += wa;

  const hol = isHoliday(ds);
  if (hol) { score += 14; factors.push({ name: `祝日（${hol}）`, v: 14 }); }
  const nextHol = isHoliday(dstr(addDays(d, 1)));
  if (!hol && nextHol && d.getDay() !== 6) { score += 6; factors.push({ name: '祝前日', v: 6 }); }

  const sb = isSchoolBreak(d);
  if (sb) {
    const v = sb === '春休み' ? 10 : sb === '夏休み' ? 7 : 8;
    score += v; factors.push({ name: sb, v });
    const m = d.getMonth() + 1, day = d.getDate();
    if (m === 8 && day >= 11 && day <= 16) { score += 5; factors.push({ name: 'お盆', v: 5 }); }
  }
  // GW
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 4 && day >= 29) || (m === 5 && day <= 6)) { score += 14; factors.push({ name: 'ゴールデンウィーク', v: 14 }); }
  if (m === 1 && day <= 4) { score += 5; factors.push({ name: 'お正月', v: 5 }); }

  // パークイベント（開始直後・終了間際は駆け込みで増加）
  for (const ev of predictState.events) {
    const s = parseD(ev.start), e = parseD(ev.end);
    if (d >= s && d <= e) {
      score += ev.boost;
      factors.push({ name: `${ev.name}${ev.estimated ? '（推定）' : ''}`, v: ev.boost });
      const sinceStart = Math.round((d - s) / 86400000);
      const untilEnd = Math.round((e - d) / 86400000);
      if (sinceStart < 7) { score += 7; factors.push({ name: `${ev.name} 開始直後`, v: 7 }); }
      else if (untilEnd < 7) { score += 9; factors.push({ name: `${ev.name} 終了間際`, v: 9 }); }
    }
  }
  // グッズ発売日
  for (const g of predictState.goods) {
    if (g.date === ds) { score += 6; factors.push({ name: `グッズ発売（${g.name}）`, v: 6 }); }
  }
  // 周辺イベント（幕張メッセ・舞浜近隣のライブ等 → 交通・ホテル混雑）
  for (const ev of predictState.nearby) {
    const s = parseD(ev.start), e = parseD(ev.end || ev.start);
    if (d >= s && d <= e) { score += ev.boost || 3; factors.push({ name: `周辺: ${ev.name}${ev.estimated ? '（推定）' : ''}`, v: ev.boost || 3 }); }
  }
  // アトラクション休止（容量減 → 体感待ち時間アップ）
  let clCount = 0;
  for (const c of predictState.closures) {
    const s = parseD(c.start), e = parseD(c.end);
    if (d >= s && d <= e && clCount < 3) { clCount++; score += 3; factors.push({ name: `休止: ${c.name}`, v: 3 }); }
  }
  // 天気予報（7日先まで）
  const w = predictState.weather;
  if (w && w.daily) {
    const idx = w.daily.time.indexOf(ds);
    if (idx >= 0) {
      const rain = w.daily.precipitation_probability_max[idx];
      const tmax = w.daily.temperature_2m_max[idx];
      const code = w.daily.weather_code[idx];
      if (code >= 95 || (rain != null && rain >= 90)) { score -= 12; factors.push({ name: '荒天予報', v: -12 }); }
      else if (rain != null && rain >= 70) { score -= 8; factors.push({ name: `雨予報（${rain}%）`, v: -8 }); }
      if (tmax != null && tmax >= 35) { score -= 3; factors.push({ name: `猛暑予報（${Math.round(tmax)}°C）`, v: -3 }); }
    }
  }
  // 実測履歴による自動補正（同月×平日/休日の平均スコアと30%ブレンド）
  const holidayLike = hol || d.getDay() === 0 || d.getDay() === 6;
  const bucket = predictState.history.filter((h) => {
    const hd = parseD(h.date);
    const hHol = isHoliday(h.date) || hd.getDay() === 0 || hd.getDay() === 6;
    return hd.getMonth() === d.getMonth() && hHol === !!holidayLike && h.score != null;
  });
  if (bucket.length >= 5) {
    const avgH = bucket.reduce((s2, h) => s2 + h.score, 0) / bucket.length;
    const adj = Math.round((avgH - score) * 0.3);
    if (adj) { score += adj; factors.push({ name: `実測補正（${bucket.length}日分）`, v: adj }); }
  }

  score = Math.max(5, Math.min(100, Math.round(score)));
  const result = { date: ds, score, factors, level: predictLevel(score) };
  predictState.cache.set(ds, result);
  return result;
}

function predictLevel(score) {
  if (score < 35) return { label: '空いている', color: '#50BFBF' };
  if (score < 50) return { label: 'やや混雑', color: '#F2CB05' };
  if (score < 65) return { label: '混雑', color: '#F2C166' };
  if (score < 80) return { label: 'かなり混雑', color: '#F285AD' };
  return { label: '激混雑', color: '#d94f7e' };
}
// スコア → 人気アトラクションの待ち時間目安
const estMaxWait = (score) => Math.round(score * 2.2 / 5) * 5;

// ---------- データ読み込み ----------
async function loadPredictData() {
  const get = async (url, fb) => { try { const r = await fetch(url); return r.ok ? await r.json() : fb; } catch { return fb; } };
  const [cal, closures, history] = await Promise.all([
    get('data/events.json', { events: [], goods: [], nearby: [] }),
    get('data/closures.json', { closures: [] }),
    get('data/history.json', { days: [] }),
  ]);
  predictState.events = cal.events || [];
  predictState.goods = cal.goods || [];
  predictState.nearby = cal.nearby || [];
  predictState.closures = closures.closures || [];
  predictState.history = history.days || [];
  try {
    predictState.weather = await (await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=35.632&longitude=139.880' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=7')).json();
  } catch { /* 天気は任意 */ }
  predictState.cache.clear();
}

// ---------- 描画 ----------
function renderLegend() {
  const wrap = document.getElementById('predict-legend');
  wrap.innerHTML = '';
  for (const [lo] of [[20], [40], [57], [72], [90]]) {
    const lvl = predictLevel(lo);
    wrap.appendChild(el(`<span class="legend-chip"><span class="legend-dot" style="background:${lvl.color}"></span>${lvl.label}</span>`));
  }
}

function renderWeekStrip() {
  const wrap = document.getElementById('week-strip');
  wrap.innerHTML = '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const p = predictDay(d);
    const ds = dstr(d);
    let emoji = '', temp = '';
    const w = predictState.weather;
    if (w && w.daily) {
      const idx = w.daily.time.indexOf(ds);
      if (idx >= 0) {
        emoji = wmoInfo(w.daily.weather_code[idx]).emoji;
        temp = `${Math.round(w.daily.temperature_2m_max[idx])}°/${Math.round(w.daily.temperature_2m_min[idx])}°`;
      }
    }
    const hol = isHoliday(ds);
    const dayColor = hol || d.getDay() === 0 ? '#d94f7e' : d.getDay() === 6 ? '#1F82BF' : 'inherit';
    const cell = el(`
      <button class="week-day">
        <div class="week-day-name" style="color:${dayColor}">${i === 0 ? '今日' : DOW[d.getDay()]}</div>
        <div class="week-day-date">${d.getMonth() + 1}/${d.getDate()}</div>
        <div class="week-day-emoji">${emoji}</div>
        <div class="week-day-score" style="background:${p.level.color}">${p.score}</div>
        <div class="week-day-temp">${temp}</div>
      </button>`);
    cell.addEventListener('click', () => showDayDetail(d));
    wrap.appendChild(cell);
  }
}

function renderMonthChart() {
  const ctx = document.getElementById('month-chart');
  if (!window.Chart) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [], scores = [], colors = [];
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, i);
    const p = predictDay(d);
    days.push(`${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`);
    scores.push(p.score);
    colors.push(p.level.color);
  }
  if (predictState.monthChart) predictState.monthChart.destroy();
  predictState.monthChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: days, datasets: [{ data: scores, backgroundColor: colors, borderRadius: 5, maxBarThickness: 26 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (e2, els) => { if (els.length) showDayDetail(addDays(today, els[0].index)); },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => {
          const p = predictDay(addDays(today, c.dataIndex));
          return ` 混雑スコア ${p.score}（${p.level.label}）/ 人気施設 最大${estMaxWait(p.score)}分前後`;
        } } },
      },
      scales: { y: { min: 0, max: 100, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 45 } } },
    },
  });
}

function renderYearCalendar() {
  const wrap = document.getElementById('year-calendar');
  wrap.innerHTML = '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = dstr(today);
  for (let mi = 0; mi < 12; mi++) {
    const first = new Date(today.getFullYear(), today.getMonth() + mi, 1);
    const y = first.getFullYear(), mo = first.getMonth();
    const monthEl = el(`<div class="cal-month"><div class="cal-month-title">${y}年 ${mo + 1}月</div><div class="cal-grid"></div></div>`);
    const grid = monthEl.querySelector('.cal-grid');
    for (const w of DOW) grid.appendChild(el(`<div class="cal-dow">${w}</div>`));
    for (let i = 0; i < first.getDay(); i++) grid.appendChild(el('<div class="cal-day cal-empty"></div>'));
    const lastDay = new Date(y, mo + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(y, mo, day);
      if (d < today) { grid.appendChild(el(`<div class="cal-day cal-empty" style="color:#d3d7dd">${day}</div>`)); continue; }
      const p = predictDay(d);
      const cell = el(`<button class="cal-day${dstr(d) === todayStr ? ' cal-today' : ''}" style="background:${p.level.color}${p.score >= 65 ? '' : 'cc'}" title="${dstr(d)} スコア${p.score}（${p.level.label}）">${day}</button>`);
      cell.addEventListener('click', () => showDayDetail(d));
      grid.appendChild(cell);
    }
    wrap.appendChild(monthEl);
  }
}

function showDayDetail(d) {
  const p = predictDay(d);
  const panel = document.getElementById('day-detail-panel');
  panel.hidden = false;
  const hol = isHoliday(p.date);
  document.getElementById('day-detail-title').textContent =
    `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）${hol ? '・' + hol : ''} の予測`;
  const wrap = document.getElementById('day-detail');
  const maxAbs = Math.max(...p.factors.map((f) => Math.abs(f.v)), 1);
  wrap.innerHTML = `
    <div class="day-detail-summary">
      <div class="day-score-badge" style="background:${p.level.color}">${p.score}<small>${p.level.label}</small></div>
      <div class="day-detail-meta">
        人気アトラクションの最大待ち時間 <b>${estMaxWait(p.score)}分前後</b> と予想<br>
        スコアは 0（貸切級）〜100（激混雑）の指標です
      </div>
    </div>
    <div class="factor-list">
      ${p.factors.map((f) => `
        <div class="factor-row">
          <span class="factor-name">${escapeHTML(f.name)}</span>
          <span class="factor-val ${f.v > 0 ? 'plus' : f.v < 0 ? 'minus' : ''}">${f.v > 0 ? '+' : ''}${f.v}</span>
          <span class="factor-bar-track"><span class="factor-bar" style="width:${Math.round(Math.abs(f.v) / maxAbs * 100)}%;background:${f.v >= 0 ? '#F285AD' : '#50BFBF'}"></span></span>
        </div>`).join('')}
    </div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- 初期化 ----------
async function buildPredictView() {
  if (predictState.built) return;
  predictState.built = true;
  await loadPredictData();
  renderLegend();
  renderWeekStrip();
  renderMonthChart();
  renderYearCalendar();
}
