/* ===== 過去データビュー =====
   実測（GitHub Actions が20分ごとに蓄積）＋ 過去の天気（Open-Meteo アーカイブ）＋
   イベント情報 ＋ 来園者数推定 ＋ アトラクション別の最大/平均待ち時間 */
'use strict';

const historyState = {
  park: 'tdl',
  date: null,          // 'YYYY-MM-DD'
  built: false,
  weatherCache: new Map(),
};

function historyDays() { return (predictState.history || []).slice().sort((a, b) => b.date.localeCompare(a.date)); }
function findHistoryDay(ds) { return (predictState.history || []).find((h) => h.date === ds); }

// 過去の天気（直近7日は forecast API の past_days、それ以前はアーカイブ API）
async function fetchPastWeather(ds) {
  if (historyState.weatherCache.has(ds)) return historyState.weatherCache.get(ds);
  const target = parseD(ds);
  const ageDays = Math.round((new Date() - target) / 86400000);
  let url;
  if (ageDays <= 6) {
    url = 'https://api.open-meteo.com/v1/forecast?latitude=35.632&longitude=139.880' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo&past_days=7&forecast_days=1';
  } else {
    url = 'https://archive-api.open-meteo.com/v1/archive?latitude=35.632&longitude=139.880' +
      `&start_date=${ds}&end_date=${ds}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo`;
  }
  try {
    const w = await (await fetch(url)).json();
    const idx = w.daily ? w.daily.time.indexOf(ds) : -1;
    const result = idx < 0 ? null : {
      code: w.daily.weather_code[idx],
      tmax: w.daily.temperature_2m_max[idx],
      tmin: w.daily.temperature_2m_min[idx],
      rain: w.daily.precipitation_sum[idx],
    };
    historyState.weatherCache.set(ds, result);
    return result;
  } catch { return null; }
}

function eventsOnDay(ds, park) {
  const d = parseD(ds);
  const active = [];
  for (const ev of predictState.events) {
    if (!forPark(ev, park)) continue;
    if (d >= parseD(ev.start) && d <= parseD(ev.end)) active.push(ev.name);
  }
  for (const g of predictState.goods) {
    if (forPark(g, park) && g.date === ds) active.push(`グッズ発売: ${g.name}`);
  }
  for (const ev of predictState.nearby) {
    if (d >= parseD(ev.start) && d <= parseD(ev.end || ev.start)) active.push(`周辺: ${ev.name}`);
  }
  return active;
}

function renderHistoryChips() {
  const wrap = document.getElementById('history-chips');
  wrap.innerHTML = '';
  const days = historyDays().slice(0, 21);
  if (!days.length) {
    wrap.innerHTML = '<div class="panel-empty">実測記録はまだありません。2026年7月5日から自動で蓄積されていきます。<br>日付を選ぶと、イベント・天気・モデルによる推定値を表示できます。</div>';
    return;
  }
  for (const h of days) {
    const d = parseD(h.date);
    const active = historyState.date === h.date;
    const chip = el(`<button class="x-chip${active ? ' active' : ''}">${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})</button>`);
    chip.addEventListener('click', () => { historyState.date = h.date; document.getElementById('history-date').value = h.date; renderHistoryDetail(); renderHistoryChips(); });
    wrap.appendChild(chip);
  }
}

async function renderHistoryDetail() {
  const wrap = document.getElementById('history-detail');
  const ds = historyState.date;
  if (!ds) { wrap.innerHTML = ''; return; }
  const park = historyState.park;
  const d = parseD(ds);
  const rec = findHistoryDay(ds);
  const parkRec = rec && rec[park];
  const measured = !!(parkRec && parkRec.score != null);

  // スコア: 実測があれば実測、なければモデル推定
  const pred = predictDay(d, park);
  const score = measured ? parkRec.score : pred.score;
  const lvl = predictLevel(score);
  const visitors = estimateVisitors(score, park);
  const hol = isHoliday(ds);
  const srcLabel = measured ? '実測' : 'モデル推定';

  wrap.innerHTML = '<div class="panel"><div class="panel-empty">読み込み中…</div></div>';
  const weather = await fetchPastWeather(ds);
  if (historyState.date !== ds) return; // 別の日付が選ばれた

  const w = weather ? wmoInfo(weather.code) : null;
  const weatherHTML = weather
    ? `${w.emoji} ${w.label} ・ 最高${Math.round(weather.tmax)}°C / 最低${Math.round(weather.tmin)}°C${weather.rain > 0 ? ` ・ 降水${Math.round(weather.rain)}mm` : ''}`
    : '取得できませんでした';
  const evts = eventsOnDay(ds, park);

  // アトラクション表: 実測 or 注目施設の推定
  let attrHTML;
  if (measured && parkRec.attractions && parkRec.attractions.length) {
    const rows = parkRec.attractions.slice().sort((a, b) => (b.max ?? 0) - (a.max ?? 0));
    attrHTML = `
      <div class="attr-table-head"><span>アトラクション</span><span>最大</span><span>平均</span></div>
      ${rows.map((a) => `
        <div class="attr-table-row">
          <span class="attr-name">${escapeHTML(jpName(a.name))}</span>
          <span class="attr-table-num">${a.max ?? '--'}<small>分</small></span>
          <span class="attr-table-num attr-table-avg">${a.avg ?? '--'}<small>分</small></span>
        </div>`).join('')}`;
  } else {
    attrHTML = `
      <div class="panel-empty" style="padding:14px">この日の実測記録はありません。注目施設のモデル推定値を表示しています。</div>
      <div class="attr-table-head"><span>アトラクション（推定）</span><span>最大</span><span>平均</span></div>
      ${pred.waits.map((wd) => `
        <div class="attr-table-row">
          <span class="attr-name">${escapeHTML(wd.jp)}</span>
          <span class="attr-table-num">${wd.max}<small>分</small></span>
          <span class="attr-table-num attr-table-avg">${Math.round(wd.max * 0.6 / 5) * 5}<small>分</small></span>
        </div>`).join('')}`;
  }

  wrap.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3 class="panel-title">${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）${hol ? '・' + hol : ''} — ${PARK_LABEL[park]}</h3>
        <span class="panel-note">${srcLabel}データ</span>
      </div>
      <div class="day-detail-summary">
        <div class="day-score-badge" style="background:${lvl.color}">${score}<small>${lvl.label}</small></div>
        <div class="day-detail-meta">
          推定来園者数 <b>${fmtVisitors(visitors)}</b><br>
          天気: ${weatherHTML}<br>
          ${measured ? `ピーク平均待ち <b>${parkRec.peakAvg}分</b> ・ 日中最大 <b>${parkRec.max}分</b>` : '待ち時間の実測記録なし'}
        </div>
      </div>
      ${evts.length ? `<div class="x-chips" style="padding:12px 0 0">${evts.map((e2) => `<span class="x-chip" style="cursor:default">${escapeHTML(e2)}</span>`).join('')}</div>`
        : '<div class="panel-note" style="margin-top:10px">この日の登録イベントはありません</div>'}
    </div>
    <div class="panel">
      <div class="panel-head"><h3 class="panel-title">アトラクション待ち時間</h3><span class="panel-note">${srcLabel}</span></div>
      <div class="attr-table">${attrHTML}</div>
    </div>`;
}

function buildHistoryView() {
  renderHistoryChips();
  if (!historyState.built) {
    historyState.built = true;
    const input = document.getElementById('history-date');
    const yest = addDays(new Date(), -1);
    input.max = dstr(yest);
    input.min = '2026-01-01';
    if (!historyState.date) {
      const days = historyDays();
      historyState.date = days.length ? days[0].date : dstr(yest);
      input.value = historyState.date;
    }
    input.addEventListener('change', () => {
      if (!input.value) return;
      historyState.date = input.value;
      renderHistoryChips();
      renderHistoryDetail();
    });
    document.querySelectorAll('#history-park-toggle .park-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        historyState.park = btn.dataset.park;
        document.querySelectorAll('#history-park-toggle .park-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderHistoryDetail();
      });
    });
  }
  renderHistoryDetail();
}

// 予測データ（events/history）が必要なので、未ロードならロードしてから描画
async function openHistoryView() {
  if (!predictState.built) { predictState.built = true; await loadPredictData(); }
  buildHistoryView();
}
