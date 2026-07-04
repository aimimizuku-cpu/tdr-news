/* ===== TDRニュース アプリロジック ===== */
'use strict';

// ---------- 定数 ----------
const PALETTE = { pink: '#F285AD', blue: '#1F82BF', teal: '#50BFBF', yellow: '#F2CB05', orange: '#F2C166' };

const TYPE_META = {
  official: { label: '公式・ニュース', short: '公式', icon: 'bell', color: PALETTE.blue },
  goods: { label: 'グッズ', short: 'グッズ', icon: 'shoppingBag', color: PALETTE.pink },
  food: { label: 'フード', short: 'フード', icon: 'utensils', color: PALETTE.orange },
  event: { label: 'イベント', short: 'イベント', icon: 'calendar', color: PALETTE.teal },
};

const FACILITIES = {
  all: 'すべて',
  land: '東京ディズニーランド',
  sea: '東京ディズニーシー',
  hotel: 'ディズニーホテル',
  ikspiari: 'イクスピアリ',
  overseas: '海外ディズニー',
};

const gnews = (q) => 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=ja&gl=JP&ceid=JP:ja';
const PARK_KEYWORDS = /ディズニーランド|ディズニーシー|ディズニーリゾート|TDR|TDL|TDS|イクスピアリ|ディズニーホテル|ミラコスタ|アンバサダーホテル|ファンタジースプリングス|ダッフィー|上海ディズニー|香港ディズニー|パリ|アナハイム|カリフォルニア|フロリダ|アウラニ|クルーズライン/;
const FEEDS = [
  { url: gnews('東京ディズニー') },
  { url: gnews('イクスピアリ OR ディズニーホテル OR ミラコスタ') },
  { url: gnews('上海ディズニー OR 香港ディズニー OR ディズニーランド・パリ OR アウラニ') },
  { url: 'https://dlove.jp/mezzomiki/feed/', source: 'MezzoMiki' },
  { url: 'https://dtimes.jp/category/disney/feed/', source: 'DTIMES', keep: PARK_KEYWORDS },
];

const DEFAULT_ACCOUNTS = ['TDR_PR', 'DisneyParks'];
const NEWS_CACHE_TTL = 15 * 60 * 1000;   // 15分
const TWEET_CACHE_TTL = 20 * 60 * 1000;  // 20分
const AUTO_REFRESH_MS = 10 * 60 * 1000;  // 10分

const PROXIES = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
];

// ---------- 状態 ----------
const state = {
  facility: 'all',
  type: 'all',
  query: '',
  savedOnly: false,
  newOnly: false,
  account: 'all',
  news: [],
  tweetsByAccount: {},
  saved: loadJSON('tdrnews:saved', {}),
  accounts: loadJSON('tdrnews:accounts', DEFAULT_ACCOUNTS),
  lastVisit: Number(localStorage.getItem('tdrnews:lastVisit') || 0),
  newsLoaded: false,
};

// ---------- ユーティリティ ----------
function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 容量超過は無視 */ }
}

async function fetchViaProxy(url, { timeout = 12000 } = {}) {
  let lastErr;
  for (const wrap of PROXIES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(wrap(url), { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text || text.length < 50) throw new Error('empty response');
      return text;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all proxies failed');
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return m + '分前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '時間前';
  const d = Math.floor(h / 24);
  if (d < 8) return d + '日前';
  const dt = new Date(ts);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtCount(n) {
  if (n == null) return '';
  return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
       : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
       : String(n);
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// アイコン（lucide 系パス）
const ICON_PATHS = {
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  shoppingBag: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  utensils: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'],
  layers: ['M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z', 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12', 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  repeat: ['m2 9 3-3 3 3', 'M13 18H7a2 2 0 0 1-2-2V6', 'm22 15-3 3-3-3', 'M11 6h6a2 2 0 0 1 2 2v10'],
  message: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'],
  clock: ['M12 6v6l4 2', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'],
  mapPin: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  bookmark: ['m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
};
function iconSVG(name, size, color, fill) {
  const paths = (ICON_PATHS[name] || []).map((d) => `<path d="${d}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill || 'none'}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- ニュース分類 ----------
function classifyFacility(text) {
  if (/上海|香港|パリ|カリフォルニア|フロリダ|アナハイム|オーランド|アウラニ|WDW|ウォルト・ディズニー・ワールド|海外(の)?(ディズニー|パーク)|クルーズライン|ディズニー・クルーズ/.test(text)) return 'overseas';
  if (/イクスピアリ/.test(text)) return 'ikspiari';
  if (/ホテル|ミラコスタ|アンバサダー|セレブレーション|トイ・ストーリーホテル|宿泊/.test(text)) return 'hotel';
  if (/ディズニーシー|TDS|シー(?![ルト])/.test(text)) return 'sea';
  if (/ディズニーランド|TDL|ランド/.test(text)) return 'land';
  return 'resort'; // TDR全般（「すべて」でのみ表示）
}
function classifyType(text) {
  if (/フード|メニュー|スイーツ|レストラン|ドリンク|ポップコーン|実食|グルメ|カフェ|試食|味わ/.test(text)) return 'food';
  if (/グッズ|ぬいぐるみ|カチューシャ|Tシャツ|アイテム|コレクション|バッグ|雑貨|文具|お土産|おみやげ|購入品/.test(text)) return 'goods';
  if (/イベント|パレード|ショー|開催|周年|ハロウィーン|クリスマス|アニバーサリー|フェス|グリーティング|抽選|プログラム/.test(text)) return 'event';
  return 'official';
}
function facilityLabel(key) {
  return key === 'resort' ? '東京ディズニーリゾート' : (FACILITIES[key] || key);
}

// ---------- ニュース取得 ----------
function parseRSS(xmlText, feedMeta) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return [];
  return [...doc.querySelectorAll('item')].map((item) => {
    const get = (tag) => item.querySelector(tag)?.textContent?.trim() || '';
    let title = get('title');
    let source = feedMeta.source || item.querySelector('source')?.textContent?.trim() || '';
    // Google News 形式「タイトル - 配信元」から配信元を分離
    const m = title.match(/^(.*)\s[-–]\s([^-–]+)$/);
    if (!source && m) { title = m[1]; source = m[2]; }
    else if (source && title.endsWith(' - ' + source)) { title = title.slice(0, -(source.length + 3)); }

    const link = get('link');
    const pub = get('pubDate');
    const ts = pub ? Date.parse(pub) : Date.now();

    // 説明文と画像抽出（WordPress系は description/content:encoded に img が入る）
    const rawDesc = item.getElementsByTagName('content:encoded')[0]?.textContent || get('description');
    const div = document.createElement('div');
    div.innerHTML = rawDesc;
    const img = div.querySelector('img');
    let image = img?.getAttribute('src') || '';
    if (image && !/^https?:/.test(image)) image = '';
    // media:content / enclosure もチェック
    if (!image) {
      const media = item.getElementsByTagName('media:content')[0] || item.querySelector('enclosure[type^="image"]');
      const u = media?.getAttribute('url');
      if (u && /^https?:/.test(u)) image = u;
    }
    let excerpt = (div.textContent || '').replace(/\s+/g, ' ').trim();
    // 定型文（コピーライト等）や、タイトルの重複にすぎない説明文は使わない
    const norm = (s) => s.replace(/\s+/g, '');
    if (excerpt.length < 10 || /Copyright|All Rights Reserved|に最初に表示されました/.test(excerpt) ||
        norm(excerpt).includes(norm(title).slice(0, 25))) excerpt = '';

    const hay = title + ' ' + excerpt;
    return {
      id: link || title,
      title, link, source, ts, image,
      excerpt: excerpt.slice(0, 120),
      facility: classifyFacility(hay),
      type: classifyType(hay),
    };
  }).filter((n) => n.title && n.link && (!feedMeta.keep || feedMeta.keep.test(n.title + ' ' + n.excerpt)));
}

async function loadNews(force = false) {
  const cache = loadJSON('tdrnews:cache:news', null);
  if (!force && cache && Date.now() - cache.at < NEWS_CACHE_TTL && cache.items?.length) {
    state.news = cache.items;
    state.newsLoaded = true;
    renderNews();
    return;
  }
  const results = await Promise.allSettled(
    FEEDS.map((f) => fetchViaProxy(f.url).then((xml) => parseRSS(xml, f)))
  );
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (all.length === 0) {
    if (cache?.items?.length) { state.news = cache.items; }
    state.newsLoaded = true;
    renderNews();
    if (all.length === 0 && !cache?.items?.length) toast('ニュースの取得に失敗しました。時間をおいて再読み込みしてください。');
    return;
  }
  // タイトル正規化で重複排除 → 新しい順
  const seen = new Set();
  const deduped = [];
  for (const n of all.sort((a, b) => b.ts - a.ts)) {
    const key = n.title.replace(/[\s【】\[\]「」！!？?。、・…♪♡☆★]/g, '').slice(0, 28);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(n);
  }
  const items = deduped.slice(0, 80);
  state.news = items;
  state.newsLoaded = true;
  saveJSON('tdrnews:cache:news', { at: Date.now(), items });
  renderNews();
  resolveArticleImages();
}

// フィードに画像がない直リンク記事は、記事ページの og:image をサムネイルに使う
async function resolveArticleImages() {
  const cache = loadJSON('tdrnews:imgcache', {});
  const targets = state.news.filter((n) => !n.image && !/news\.google\.com/.test(n.link)).slice(0, 8);
  let changed = false;
  await Promise.allSettled(targets.map(async (n) => {
    if (cache[n.link] !== undefined) {
      if (cache[n.link]) { n.image = cache[n.link]; changed = true; }
      return;
    }
    try {
      const html = await fetchViaProxy(n.link, { timeout: 10000 });
      const m = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
             || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      const img = m && /^https?:/.test(m[1]) ? m[1] : '';
      cache[n.link] = img;
      if (img) { n.image = img; changed = true; }
    } catch { /* 次回リロード時に再試行 */ }
  }));
  // キャッシュ肥大防止
  const keys = Object.keys(cache);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete cache[k];
  saveJSON('tdrnews:imgcache', cache);
  if (changed) {
    saveJSON('tdrnews:cache:news', { at: Date.now(), items: state.news });
    renderNews();
  }
}

// ---------- ニュース描画 ----------
function filteredNews() {
  const q = state.query.trim().toLowerCase();
  return state.news.filter((n) =>
    (state.facility === 'all' || n.facility === state.facility) &&
    (state.type === 'all' || n.type === state.type) &&
    (!state.savedOnly || state.saved[n.id]) &&
    (!state.newOnly || n.ts > state.lastVisit) &&
    (q === '' || (n.title + n.excerpt + n.source).toLowerCase().includes(q))
  );
}

function renderFacilityTabs() {
  const wrap = document.getElementById('facility-tabs');
  wrap.innerHTML = '';
  for (const key of Object.keys(FACILITIES)) {
    const btn = el(`<button class="facility-tab${state.facility === key ? ' active' : ''}">${escapeHTML(FACILITIES[key])}</button>`);
    btn.addEventListener('click', () => { state.facility = key; renderNews(); });
    wrap.appendChild(btn);
  }
}

function renderTypeFilters() {
  const wrap = document.getElementById('type-filters');
  wrap.innerHTML = '';
  const facMatch = (n) => state.facility === 'all' || n.facility === state.facility;
  for (const key of ['all', ...Object.keys(TYPE_META)]) {
    const meta = key === 'all' ? { short: 'すべて', icon: 'layers', color: PALETTE.blue } : TYPE_META[key];
    const active = state.type === key;
    const count = state.news.filter((n) => facMatch(n) && (key === 'all' || n.type === key)).length;
    const btn = el(`<button class="type-filter${active ? ' active' : ''}" ${active ? `style="background:${meta.color};border-color:${meta.color};box-shadow:0 6px 15px ${meta.color}40"` : ''}>
      ${iconSVG(meta.icon, 15, active ? '#fff' : meta.color)}<span>${escapeHTML(meta.short)}</span><span class="count">${count}</span>
    </button>`);
    btn.addEventListener('click', () => { state.type = key; renderNews(); });
    wrap.appendChild(btn);
  }
}

function renderHero() {
  const hero = document.getElementById('hero');
  const top = state.news[0];
  const hide = !top || state.query.trim() !== '' || state.savedOnly || state.newOnly;
  hero.hidden = hide;
  if (hide) return;
  hero.innerHTML = `
    <div class="hero-content">
      <div class="hero-badge">${iconSVG('bell', 13, '#fff')} PICK UP・最新情報</div>
      <h2 class="hero-title">${escapeHTML(top.title)}</h2>
      <p class="hero-desc">${escapeHTML(top.excerpt || `${top.source} — ${facilityLabel(top.facility)}の最新情報をチェックしましょう。`)}</p>
      <a class="hero-btn" href="${escapeHTML(top.link)}" target="_blank" rel="noopener">詳細を見る →</a>
    </div>
    <div class="hero-circle hero-c1"></div>
    <div class="hero-circle hero-c2"></div>
    <div class="hero-circle hero-c3"></div>`;
}

function renderNews() {
  renderFacilityTabs();
  renderTypeFilters();
  renderHero();

  document.getElementById('news-loading').hidden = state.newsLoaded;

  const items = filteredNews();
  document.getElementById('result-count').textContent = items.length;

  const labelParts = [FACILITIES[state.facility]];
  if (state.type !== 'all') labelParts.push(TYPE_META[state.type].short);
  if (state.savedOnly) labelParts.push('保存済み');
  if (state.newOnly) labelParts.push('新着');
  if (state.query.trim()) labelParts.push('「' + state.query.trim() + '」');
  document.getElementById('current-label').textContent = labelParts.join(' · ');

  document.getElementById('saved-count').textContent = Object.keys(state.saved).length;
  document.getElementById('news-empty').hidden = !(state.newsLoaded && items.length === 0);

  const grid = document.getElementById('news-grid');
  grid.innerHTML = '';
  items.forEach((n, i) => {
    const meta = TYPE_META[n.type];
    const isSaved = !!state.saved[n.id];
    const isNew = n.ts > state.lastVisit;
    const imgLabel = `${facilityLabel(n.facility).replace('東京', '')} / ${n.type.toUpperCase()}`;
    const card = el(`
      <a class="news-card" href="${escapeHTML(n.link)}" target="_blank" rel="noopener" style="animation-delay:${Math.min(i, 10) * 35}ms">
        <div class="card-img" style="--tint:${meta.color}18">
          ${n.image
            ? `<img src="${escapeHTML(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
            : `<span class="card-img-label">${escapeHTML(imgLabel)}</span>`}
          <div class="card-badge" style="background:${meta.color};box-shadow:0 3px 8px ${meta.color}55">${iconSVG(meta.icon, 13, '#fff')}<span>${meta.short}</span></div>
          ${isNew ? '<span class="card-new">NEW</span>' : ''}
        </div>
        <div class="card-body">
          <div class="card-meta">${iconSVG('mapPin', 13, '#9aa0a8')}<span>${escapeHTML(facilityLabel(n.facility))}${n.source ? ' ・ ' + escapeHTML(n.source) : ''}</span></div>
          <h3 class="card-title">${escapeHTML(n.title)}</h3>
          ${n.excerpt ? `<p class="card-excerpt">${escapeHTML(n.excerpt)}</p>` : ''}
          <div class="card-foot">
            <div class="card-date">${iconSVG('clock', 13, '#9aa0a8')}<span>${relativeTime(n.ts)}</span></div>
            <button class="bm-btn${isSaved ? ' saved' : ''}" title="${isSaved ? '保存を解除' : '記事を保存'}">${iconSVG('bookmark', 17, isSaved ? '#fff' : '#b6bbc3', isSaved ? PALETTE.blue : 'none')}</button>
          </div>
        </div>
      </a>`);
    card.querySelector('.bm-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.saved[n.id]) { delete state.saved[n.id]; toast('保存を解除しました'); }
      else { state.saved[n.id] = true; toast('記事を保存しました 🔖'); }
      saveJSON('tdrnews:saved', state.saved);
      renderNews();
    });
    grid.appendChild(card);
  });

  // 新着ドット
  const hasNew = state.news.some((n) => n.ts > state.lastVisit);
  document.getElementById('bell-dot').hidden = !hasNew;
}

// ---------- X フィード ----------
function normalizeHandle(input) {
  const h = input.trim().replace(/^@/, '').replace(/\s.*$/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : null;
}

function parseSyndication(html, account) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }
  const entries = data?.props?.pageProps?.timeline?.entries || [];
  const tweets = [];
  for (const e of entries) {
    const t = e?.content?.tweet;
    if (!t || !t.created_at) continue;
    const u = t.user || {};
    const photo = (t.photos && t.photos[0]?.url) || (t.entities?.media?.[0]?.media_url_https) || '';
    tweets.push({
      id: t.id_str || t.permalink,
      text: (t.full_text || t.text || '').replace(/https:\/\/t\.co\/\S+$/g, '').trim(),
      ts: Date.parse(t.created_at),
      name: u.name || account,
      handle: '@' + (u.screen_name || account),
      avatar: (u.profile_image_url_https || '').replace('_normal', '_bigger'),
      verified: !!(u.is_blue_verified || u.verified),
      replies: t.reply_count, retweets: t.retweet_count, likes: t.favorite_count,
      photo,
      url: t.permalink ? 'https://x.com' + t.permalink : `https://x.com/${account}`,
    });
  }
  tweets.sort((a, b) => b.ts - a.ts);
  return tweets.slice(0, 20);
}

async function loadAccountTweets(account, force = false) {
  const cacheKey = 'tdrnews:cache:x:' + account.toLowerCase();
  const cache = loadJSON(cacheKey, null);
  if (!force && cache && Date.now() - cache.at < TWEET_CACHE_TTL) {
    state.tweetsByAccount[account] = cache.tweets;
    return;
  }
  try {
    const html = await fetchViaProxy('https://syndication.twitter.com/srv/timeline-profile/screen-name/' + encodeURIComponent(account), { timeout: 15000 });
    const tweets = parseSyndication(html, account);
    if (tweets && tweets.length) {
      state.tweetsByAccount[account] = tweets;
      saveJSON(cacheKey, { at: Date.now(), tweets });
      return;
    }
    state.tweetsByAccount[account] = cache?.tweets || [];
  } catch {
    state.tweetsByAccount[account] = cache?.tweets || [];
  }
}

async function loadAllTweets(force = false) {
  document.getElementById('x-loading')?.removeAttribute('hidden');
  await Promise.allSettled(state.accounts.map((a) => loadAccountTweets(a, force)));
  document.getElementById('x-updated').textContent = ' 最終更新 ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  renderTweets();
}

const AVATAR_COLORS = [PALETTE.blue, PALETTE.pink, PALETTE.teal, PALETTE.orange, PALETTE.yellow];

function renderXChips() {
  const wrap = document.getElementById('x-chips');
  wrap.innerHTML = '';
  const chips = [{ key: 'all', label: 'すべて' }, ...state.accounts.map((a) => ({ key: a, label: '@' + a }))];
  for (const c of chips) {
    const active = state.account === c.key;
    const removable = c.key !== 'all';
    const chip = el(`<button class="x-chip${active ? ' active' : ''}"><span>${escapeHTML(c.label)}</span>${removable ? '<span class="chip-x" title="このアカウントを削除">✕</span>' : ''}</button>`);
    chip.addEventListener('click', () => { state.account = c.key; renderXChips(); renderTweets(); });
    if (removable) {
      chip.querySelector('.chip-x').addEventListener('click', (e) => {
        e.stopPropagation();
        state.accounts = state.accounts.filter((a) => a !== c.key);
        delete state.tweetsByAccount[c.key];
        if (state.account === c.key) state.account = 'all';
        saveJSON('tdrnews:accounts', state.accounts);
        toast('@' + c.key + ' を削除しました');
        renderXChips();
        renderTweets();
      });
    }
    wrap.appendChild(chip);
  }
}

function renderTweets() {
  const feed = document.getElementById('x-feed');
  const accounts = state.account === 'all' ? state.accounts : [state.account];
  const tweets = accounts.flatMap((a) => state.tweetsByAccount[a] || []).sort((a, b) => b.ts - a.ts).slice(0, 40);

  feed.innerHTML = '';
  if (state.accounts.length === 0) {
    feed.appendChild(el(`<div class="x-msg">アカウントが未登録です。<br>上の入力欄からXアカウントを追加してください。</div>`));
    return;
  }
  if (tweets.length === 0) {
    const links = accounts.map((a) => `<a href="https://x.com/${escapeHTML(a)}" target="_blank" rel="noopener">@${escapeHTML(a)}</a>`).join(' / ');
    feed.appendChild(el(`<div class="x-msg">投稿を取得できませんでした。<br>Xの制限により一時的に取得できない場合があります。<br>${links} で直接チェックできます。</div>`));
    return;
  }
  tweets.forEach((t) => {
    const color = AVATAR_COLORS[(t.handle.charCodeAt(1) + t.handle.length) % AVATAR_COLORS.length];
    const verifiedBadge = t.verified
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#1F82BF"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>'
      : '';
    const tw = el(`
      <a class="tweet" href="${escapeHTML(t.url)}" target="_blank" rel="noopener">
        <div class="tweet-row">
          <div class="tweet-avatar" style="background:${color}">
            ${t.avatar ? `<img src="${escapeHTML(t.avatar)}" alt="" loading="lazy" onerror="this.remove()">` : escapeHTML((t.handle[1] || 'X').toUpperCase())}
          </div>
          <div class="tweet-main">
            <div class="tweet-head">
              <span class="tweet-name">${escapeHTML(t.name)}</span>
              ${verifiedBadge}
              <span class="tweet-handle">${escapeHTML(t.handle)}</span>
              <span class="tweet-time">· ${relativeTime(t.ts)}</span>
            </div>
            <p class="tweet-text">${escapeHTML(t.text)}</p>
            ${t.photo ? `<div class="tweet-media"><img src="${escapeHTML(t.photo)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>` : ''}
            <div class="tweet-stats">
              <span>${iconSVG('message', 14, '#9aa0a8')}${fmtCount(t.replies)}</span>
              <span>${iconSVG('repeat', 14, '#9aa0a8')}${fmtCount(t.retweets)}</span>
              <span>${iconSVG('heart', 14, '#c98a9d')}${fmtCount(t.likes)}</span>
            </div>
          </div>
        </div>
      </a>`);
    feed.appendChild(tw);
  });
}

// ---------- ビュー切り替え ----------
function setupViewTabs() {
  const tabs = document.querySelectorAll('.view-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      for (const v of ['news', 'live', 'predict']) {
        document.getElementById('view-' + v).hidden = v !== view;
      }
      // 施設タブと検索はニュースビュー専用
      document.getElementById('facility-tabs').style.display = view === 'news' ? '' : 'none';
      document.querySelector('.searchbox').style.display = view === 'news' ? '' : 'none';
      if (view === 'live' && typeof refreshLive === 'function') refreshLive();
      if (view === 'predict' && typeof buildPredictView === 'function') buildPredictView();
    });
  });
}

// ---------- イベント ----------
function setupEvents() {
  const search = document.getElementById('search-input');
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = search.value; renderNews(); }, 200);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== search && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      search.focus();
    }
  });

  document.getElementById('saved-btn').addEventListener('click', function () {
    state.savedOnly = !state.savedOnly;
    if (state.savedOnly) state.newOnly = false;
    this.classList.toggle('active', state.savedOnly);
    document.getElementById('bell-btn').classList.remove('active');
    renderNews();
  });

  document.getElementById('bell-btn').addEventListener('click', function () {
    state.newOnly = !state.newOnly;
    if (state.newOnly) state.savedOnly = false;
    this.classList.toggle('active', state.newOnly);
    document.getElementById('saved-btn').classList.remove('active');
    renderNews();
    if (state.newOnly) toast('前回訪問後の新着記事を表示中');
  });

  document.getElementById('refresh-btn').addEventListener('click', async function () {
    this.classList.add('spinning');
    await Promise.allSettled([loadNews(true), loadAllTweets(true)]);
    this.classList.remove('spinning');
    toast('最新の情報に更新しました ✨');
  });

  document.getElementById('x-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('x-add-input');
    const handle = normalizeHandle(input.value);
    if (!handle) { toast('アカウント名は英数字とアンダースコアで入力してください'); return; }
    if (state.accounts.some((a) => a.toLowerCase() === handle.toLowerCase())) { toast('@' + handle + ' は追加済みです'); return; }
    state.accounts.push(handle);
    saveJSON('tdrnews:accounts', state.accounts);
    input.value = '';
    state.account = handle;
    renderXChips();
    toast('@' + handle + ' を追加しました。投稿を取得中…');
    await loadAccountTweets(handle, true);
    renderTweets();
    if (!(state.tweetsByAccount[handle] || []).length) toast('@' + handle + ' の投稿を取得できませんでした（非公開または存在しない可能性があります）');
  });
}

// ---------- 起動 ----------
async function init() {
  renderNews();
  renderXChips();
  setupEvents();
  setupViewTabs();

  await Promise.allSettled([loadNews(), loadAllTweets()]);
  document.getElementById('x-loading')?.remove();
  renderTweets();

  // 今回の訪問を記録（次回訪問時のNEW判定に使う）
  localStorage.setItem('tdrnews:lastVisit', String(Date.now()));

  setInterval(() => { loadNews(true); loadAllTweets(true); }, AUTO_REFRESH_MS);
}

init();
