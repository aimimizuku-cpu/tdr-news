/* ===== リアルタイム待ち時間・混雑ビュー ===== */
'use strict';

const PARKS = {
  tdl: { id: '3cc919f1-d16d-43e0-8c3f-1dd269bd1a42', name: '東京ディズニーランド', color: '#F285AD' },
  tds: { id: '67b290d5-3478-4f23-b601-2f8fb71ba803', name: '東京ディズニーシー', color: '#1F82BF' },
};

// ThemeParks.wiki の英語名 → 公式日本語名
const JP_NAMES = {
  "Alice's Tea Party": 'アリスのティーパーティー',
  'Beaver Brothers Explorer Canoes': 'ビーバーブラザーズのカヌー探険',
  'Big Thunder Mountain': 'ビッグサンダー・マウンテン',
  'Castle Carrousel': 'キャッスルカルーセル',
  "Chip 'n Dale's Treehouse": 'チップとデールのツリーハウス',
  "Cinderella's Fairy Tale Hall": 'シンデレラのフェアリーテイル・ホール',
  'Country Bear Theater': 'カントリーベア・シアター',
  "Donald's Boat": 'ドナルドのボート',
  'Dumbo The Flying Elephant': '空飛ぶダンボ',
  'Enchanted Tale of Beauty and the Beast': '美女と野獣“魔法のものがたり”',
  "Gadget's Go Coaster": 'ガジェットのゴーコースター',
  "Goofy's Paint 'n' Play House": 'グーフィーのペイント＆プレイハウス',
  'Haunted Mansion': 'ホーンテッドマンション',
  'Jungle Cruise: Wildlife Expeditions': 'ジャングルクルーズ：ワイルドライフ・エクスペディション',
  'Mark Twain Riverboat': '蒸気船マークトウェイン号',
  "Mickey's PhilharMagic": 'ミッキーのフィルハーマジック',
  "Minnie's House": 'ミニーの家',
  'Monsters, Inc. Ride & Go Seek!': 'モンスターズ・インク“ライド＆ゴーシーク！”',
  'Omnibus': 'オムニバス',
  'Penny Arcade': 'ペニーアーケード',
  "Peter Pan's Flight": 'ピーターパン空の旅',
  "Pinocchio's Daring Journey": 'ピノキオの冒険旅行',
  'Pirates of the Caribbean': 'カリブの海賊',
  "Pooh's Hunny Hunt": 'プーさんのハニーハント',
  "Roger Rabbit's Car Toon Spin": 'ロジャーラビットのカートゥーンスピン',
  "Snow White's Adventures": '白雪姫と七人のこびと',
  'Splash Mountain': 'スプラッシュ・マウンテン',
  'Star Tours: The Adventures Continue': 'スター・ツアーズ：ザ・アドベンチャーズ・コンティニュー',
  'Stitch Encounter': 'スティッチ・エンカウンター',
  'Swiss Family Treehouse': 'スイスファミリー・ツリーハウス',
  'The Enchanted Tiki Room: Stitch Presents “Aloha E Komo Mai!”': '魅惑のチキルーム：スティッチ・プレゼンツ“アロハ・エ・コモ・マイ！”',
  'The Happy Ride with Baymax': 'ベイマックスのハッピーライド',
  'Tom Sawyer Island Rafts': 'トムソーヤ島いかだ',
  'Toon Park': 'トゥーンパーク',
  'Western River Railroad': 'ウエスタンリバー鉄道',
  'Westernland Shootin’ Gallery': 'ウエスタンランド・シューティングギャラリー',
  'Westernland Shootin\' Gallery': 'ウエスタンランド・シューティングギャラリー',
  '“it’s a small world”': 'イッツ・ア・スモールワールド',
  '20,000 Leagues Under the Sea': '海底2万マイル',
  "Anna and Elsa's Frozen Journey": 'アナとエルサのフローズンジャーニー',
  'Aquatopia': 'アクアトピア',
  "Ariel's Playground": 'アリエルのプレイグラウンド',
  'Big City Vehicles': 'ビッグシティ・ヴィークル',
  'Blowfish Balloon Race': 'ブローフィッシュ・バルーンレース',
  'Caravan Carousel': 'キャラバンカルーセル',
  'DisneySea Electric Railway (American Waterfront)': 'エレクトリックレールウェイ（アメリカンW）',
  'DisneySea Electric Railway (Port Discovery)': 'エレクトリックレールウェイ（ポートD）',
  'DisneySea Transit Steamer Line (American Waterfront)': 'トランジットスチーマーライン（アメリカンW）',
  'DisneySea Transit Steamer Line (Lost River Delta)': 'トランジットスチーマーライン（ロストリバー）',
  'DisneySea Transit Steamer Line (Mediterranean Harbor)': 'トランジットスチーマーライン（メディテレー二アン）',
  "Fairy Tinker Bell's Busy Buggies": 'フェアリー・ティンカーベルのビジーバギー',
  "Flounder's Flying Fish Coaster": 'フランダーのフライングフィッシュコースター',
  'Fortress Explorations': 'フォートレス・エクスプロレーション',
  'Indiana Jones Adventure®: Temple of the Crystal Skull': 'インディ・ジョーンズ・アドベンチャー',
  "Jasmine's Flying Carpets": 'ジャスミンのフライングカーペット',
  'Journey to the Center of the Earth': 'センター・オブ・ジ・アース',
  "Jumpin' Jellyfish": 'ジャンピン・ジェリーフィッシュ',
  'Mermaid Lagoon Theater': 'マーメイドラグーンシアター',
  'Nemo & Friends SeaRider': 'ニモ＆フレンズ・シーライダー',
  "Peter Pan's Never Land Adventure": 'ピーターパンのネバーランドアドベンチャー',
  'Raging Spirits': 'レイジングスピリッツ',
  "Rapunzel's Lantern Festival": 'ラプンツェルのランタンフェスティバル',
  "Scuttle's Scooters": 'スカットルのスクーター',
  "Sindbad's Storybook Voyage": 'シンドバッド・ストーリーブック・ヴォヤッジ',
  'Soaring: Fantastic Flight': 'ソアリン：ファンタスティック・フライト',
  'The Leonardo Challenge': 'レオナルドチャレンジ',
  'The Magic Lamp Theater': 'マジックランプシアター',
  'The Whirlpool': 'ワールプール',
  'Tower of Terror': 'タワー・オブ・テラー',
  'Toy Story Mania!': 'トイ・ストーリー・マニア！',
  'Turtle Talk': 'タートル・トーク',
  'Venetian Gondolas': 'ヴェネツィアン・ゴンドラ',
};
const jpName = (en) => JP_NAMES[en] || en;

const liveState = {
  park: 'tdl',
  data: { tdl: null, tds: null },   // { attractions: [...], fetchedAt }
  schedule: { tdl: null, tds: null },
  today: null,                       // GitHub Actions が蓄積する当日記録
  weather: null,
  loaded: false,
  gaugeChart: null,
  todayChart: null,
};

// ---------- 取得 ----------
async function fetchJSON(url, timeout = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

function summarizeLive(liveData) {
  const attractions = [];
  for (const e of liveData || []) {
    if (e.entityType !== 'ATTRACTION') continue;
    const q = e.queue || {};
    const dpa = q.PAID_RETURN_TIME || q.PAID_STANDBY || null;
    attractions.push({
      name: jpName(e.name),
      wait: q.STANDBY ? q.STANDBY.waitTime : null,
      status: e.status || 'UNKNOWN',
      hasDPA: !!dpa,
      dpaState: dpa ? (dpa.state || 'UNKNOWN') : null,
    });
  }
  attractions.sort((a, b) => (b.wait ?? -1) - (a.wait ?? -1));
  return attractions;
}

async function loadPark(key) {
  const park = PARKS[key];
  try {
    const d = await fetchJSON(`https://api.themeparks.wiki/v1/entity/${park.id}/live`);
    liveState.data[key] = { attractions: summarizeLive(d.liveData), fetchedAt: Date.now() };
  } catch {
    liveState.data[key] = liveState.data[key] || null; // 前回値を保持
  }
  try {
    if (!liveState.schedule[key]) {
      const s = await fetchJSON(`https://api.themeparks.wiki/v1/entity/${park.id}/schedule`);
      liveState.schedule[key] = s.schedule || [];
    }
  } catch { /* スケジュールは任意 */ }
}

async function loadTodayLog() {
  try {
    liveState.today = await fetchJSON('data/today.json?t=' + Math.floor(Date.now() / 300000));
  } catch { liveState.today = null; }
}

async function loadWeatherNow() {
  if (liveState.weather) return;
  try {
    liveState.weather = await fetchJSON(
      'https://api.open-meteo.com/v1/forecast?latitude=35.632&longitude=139.880' +
      '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=7');
  } catch { /* 天気は任意 */ }
}

// ---------- 混雑スコア ----------
// 平均待ち時間を 0-100 のスコアに変換（40分平均 ≒ スコア80）
function crowdScore(avgWait) {
  if (avgWait == null) return null;
  return Math.max(2, Math.min(100, Math.round(avgWait * 2)));
}
function crowdLevel(score) {
  if (score == null) return { label: '計測中', color: '#c0c4cb' };
  if (score < 35) return { label: '空いている', color: '#50BFBF' };
  if (score < 50) return { label: 'やや混雑', color: '#F2CB05' };
  if (score < 65) return { label: '混雑', color: '#F2C166' };
  if (score < 80) return { label: 'かなり混雑', color: '#F285AD' };
  return { label: '激混雑', color: '#d94f7e' };
}

const WMO_EMOJI = [
  [0, '☀️', '快晴'], [1, '🌤', '晴れ'], [2, '⛅', '晴れ時々曇り'], [3, '☁️', '曇り'],
  [45, '🌫', '霧'], [48, '🌫', '霧'], [51, '🌦', '霧雨'], [55, '🌧', '霧雨'],
  [61, '🌧', '雨'], [65, '🌧', '大雨'], [71, '🌨', '雪'], [77, '🌨', '雪'],
  [80, '🌦', 'にわか雨'], [82, '🌧', '激しい雨'], [95, '⛈', '雷雨'], [99, '⛈', '雷雨'],
];
function wmoInfo(code) {
  if (code == null) return { emoji: '', label: '' };
  let best = WMO_EMOJI[0];
  for (const w of WMO_EMOJI) if (code >= w[0]) best = w;
  return { emoji: best[1], label: best[2] };
}

// ---------- 描画 ----------
function renderGauge(score) {
  const lvl = crowdLevel(score);
  document.getElementById('gauge-score').textContent = score ?? '--';
  document.getElementById('gauge-score').style.color = lvl.color;
  document.getElementById('gauge-label').textContent = lvl.label;
  const ctx = document.getElementById('gauge-chart');
  if (!window.Chart || !ctx) return;
  const val = score ?? 0;
  if (liveState.gaugeChart) {
    liveState.gaugeChart.data.datasets[0].data = [val, 100 - val];
    liveState.gaugeChart.data.datasets[0].backgroundColor = [lvl.color, '#f0f2f5'];
    liveState.gaugeChart.update();
    return;
  }
  liveState.gaugeChart = new Chart(ctx, {
    type: 'doughnut',
    data: { datasets: [{ data: [val, 100 - val], backgroundColor: [lvl.color, '#f0f2f5'], borderWidth: 0, borderRadius: 6 }] },
    options: { cutout: '76%', responsive: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 500 } },
  });
}

function renderTodayChart() {
  const ctx = document.getElementById('today-chart');
  const empty = document.getElementById('today-chart-empty');
  const snaps = (liveState.today && liveState.today.snapshots) || [];
  const rows = snaps.filter((s) => s[liveState.park] && s[liveState.park].avg != null);
  const box = ctx.parentElement;
  if (!window.Chart || rows.length < 2) {
    box.style.display = 'none';
    empty.hidden = false;
    return;
  }
  box.style.display = '';
  empty.hidden = true;
  const labels = rows.map((s) => s.t);
  const avg = rows.map((s) => s[liveState.park].avg);
  const max = rows.map((s) => s[liveState.park].max);
  const color = PARKS[liveState.park].color;
  if (liveState.todayChart) liveState.todayChart.destroy();
  liveState.todayChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '平均待ち時間（分）', data: avg, borderColor: color, backgroundColor: color + '22', fill: true, tension: .35, pointRadius: 0, borderWidth: 2.5 },
        { label: '最大待ち時間（分）', data: max, borderColor: '#c0c4cb', borderDash: [5, 4], fill: false, tension: .35, pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 18, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 }, maxTicksLimit: 10 } } },
    },
  });
}

function renderDPA() {
  const wrap = document.getElementById('dpa-list');
  wrap.innerHTML = '';
  const data = liveState.data[liveState.park];
  const dpaLog = (liveState.today && liveState.today.dpa) || {};
  const items = data ? data.attractions.filter((a) => a.hasDPA) : [];
  // 過去観測（当日）に売切記録がある施設も表示対象に含める
  const logged = Object.values(dpaLog).filter((d) => d.park === liveState.park);
  for (const lg of logged) {
    if (!items.some((a) => a.name === lg.name)) items.push({ name: lg.name, hasDPA: true, dpaState: lg.state, wait: null, status: 'UNKNOWN' });
  }
  if (items.length === 0) {
    wrap.innerHTML = '<div class="panel-empty">現在DPA対象の施設情報を取得できません。</div>';
    return;
  }
  for (const a of items) {
    const lg = logged.find((d) => d.name === a.name);
    const state = a.dpaState || (lg && lg.state) || 'UNKNOWN';
    let badge, cls;
    if (state === 'AVAILABLE') { badge = '販売中'; cls = 'dpa-available'; }
    else if (state === 'TEMP_FULL' || state === 'TEMPORARILY_FULL') { badge = '一時販売停止'; cls = 'dpa-closed'; }
    else if (state === 'SOLD_OUT' || state === 'NOT_AVAILABLE') { badge = '売切'; cls = 'dpa-soldout'; }
    else if (state === 'FINISHED') { badge = isParkOpen() ? '売切' : '本日終了'; cls = isParkOpen() ? 'dpa-soldout' : 'dpa-closed'; }
    else { badge = '状態不明'; cls = 'dpa-closed'; }
    const soldOutAt = lg && lg.soldOutAt ? `<span class="dpa-time">売切時刻 <b>${lg.soldOutAt}</b> ごろ</span>` : '';
    wrap.appendChild(el(`
      <div class="dpa-item">
        <span class="attr-dpa-tag">DPA</span>
        <span class="dpa-item-name">${escapeHTML(a.name)}</span>
        ${soldOutAt}
        <span class="dpa-badge ${cls}">${badge}</span>
      </div>`));
  }
}

function renderAttractions() {
  const wrap = document.getElementById('attr-list');
  wrap.innerHTML = '';
  const data = liveState.data[liveState.park];
  if (!data) {
    wrap.innerHTML = '<div class="panel-empty">待ち時間を取得できませんでした。時間をおいて更新してください。</div>';
    document.getElementById('attr-count').textContent = '';
    return;
  }
  const items = data.attractions;
  const operating = items.filter((a) => a.status === 'OPERATING' && a.wait != null);
  document.getElementById('attr-count').textContent = `運営中 ${operating.length} 施設`;
  const maxWait = Math.max(30, ...operating.map((a) => a.wait));
  for (const a of items) {
    const lvl = crowdLevel(a.wait == null ? null : crowdScore(a.wait));
    const isOpen = a.status === 'OPERATING';
    const waitHTML = !isOpen
      ? `<div class="attr-wait closed">${isParkOpen() ? '休止中' : '運営時間外'}</div>`
      : a.wait == null
        ? '<div class="attr-wait closed">案内なし</div>'
        : `<div class="attr-wait" style="color:${lvl.color}">${a.wait}<small>分</small></div>`;
    wrap.appendChild(el(`
      <div class="attr-row">
        <div class="attr-name">
          <div class="attr-name-line">${escapeHTML(a.name)}${a.hasDPA ? '<span class="attr-dpa-tag">DPA</span>' : ''}</div>
          <div class="attr-bar-track"><div class="attr-bar" style="width:${isOpen && a.wait != null ? Math.round((a.wait / maxWait) * 100) : 0}%;background:${lvl.color}"></div></div>
        </div>
        ${waitHTML}
      </div>`));
  }
}

function todaySchedule(park) {
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  return (liveState.schedule[park] || []).find((s) => s.date === todayStr && s.type === 'OPERATING') || null;
}
function isParkOpen() {
  const s = todaySchedule(liveState.park);
  if (!s) return false;
  const now = Date.now();
  return now >= Date.parse(s.openingTime) && now <= Date.parse(s.closingTime);
}

function renderLiveStats() {
  const data = liveState.data[liveState.park];
  const operating = data ? data.attractions.filter((a) => a.status === 'OPERATING' && a.wait != null) : [];
  let avg = null, max = null, maxName = '';
  if (operating.length) {
    avg = Math.round(operating.reduce((s, a) => s + a.wait, 0) / operating.length);
    const top = operating[0];
    max = top.wait; maxName = top.name;
  }
  renderGauge(crowdScore(avg));
  if (avg == null && !isParkOpen()) document.getElementById('gauge-label').textContent = '閉園中';
  document.getElementById('stat-avg').innerHTML = (avg ?? '--') + '<span class="stat-unit">分</span>';
  document.getElementById('stat-avg-sub').textContent = operating.length ? `運営中 ${operating.length} 施設の平均` : '';
  document.getElementById('stat-max').innerHTML = (max ?? '--') + '<span class="stat-unit">分</span>';
  document.getElementById('stat-max-sub').textContent = maxName;

  // 運営時間
  const sched = todaySchedule(liveState.park);
  const fmtT = (iso) => new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
  document.getElementById('stat-hours').textContent = sched ? `${fmtT(sched.openingTime)} - ${fmtT(sched.closingTime)}` : '--';

  // 現在の天気
  const cur = liveState.weather && liveState.weather.current;
  if (cur) {
    const w = wmoInfo(cur.weather_code);
    document.getElementById('stat-weather').textContent = `舞浜 ${w.emoji} ${w.label} ${Math.round(cur.temperature_2m)}°C`;
  }

  const at = data ? new Date(data.fetchedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  document.getElementById('live-updated').textContent = `最終更新 ${at} ・ データ: ThemeParks.wiki`;
}

function renderLiveView() {
  renderLiveStats();
  renderTodayChart();
  renderDPA();
  renderAttractions();
}

// ---------- 初期化 ----------
async function refreshLive(force = false) {
  const stale = !liveState.data[liveState.park] || Date.now() - liveState.data[liveState.park].fetchedAt > 5 * 60 * 1000;
  if (!force && !stale) { renderLiveView(); return; }
  await Promise.allSettled([loadPark('tdl'), loadPark('tds'), loadTodayLog(), loadWeatherNow()]);
  liveState.loaded = true;
  renderLiveView();
}

function initLiveView() {
  document.querySelectorAll('.park-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      liveState.park = btn.dataset.park;
      document.querySelectorAll('.park-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderLiveView();
    });
  });
  // 5分ごとに自動更新（表示中のみ）
  setInterval(() => {
    if (!document.getElementById('view-live').hidden) refreshLive(true);
  }, 5 * 60 * 1000);
}

initLiveView();
