/* Blueprint Builds: single-page app (hash routing, no build step). */
(function () {
  /* ---------- site configuration ---------- */
  const SITE = window.SITE = Object.assign({
    name: 'Blueprint Builds',
    discordUrl: 'https://discord.com/',
    price: { monthly: 4.99, yearlyDiscount: 0.4, currency: '$' },
    freeLayers: 2,
    apiUrl: 'http://localhost:3000',
    modUrl: '',
    /* Per-build hosted files, e.g. { 'starter-cabin': { java: 'https://…zip', mcworld: '…', mcaddon: '…' } } */
    downloads: {},
  }, window.SITE || {});

  /* ---------- storage (never required for the page to work) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bb.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bb.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const state = {
    lang: store.get('lang', (navigator.language || 'en').toLowerCase().startsWith('n') ? 'no' : 'en'),
    user: store.get('user', null),
    premium: store.get('premium', null),
    favs: new Set(store.get('favs', [])),
    votes: store.get('votes', {}),
    myRequests: store.get('requests', []),
    checks: store.get('checks', {}),
    filters: { q: '', cat: 'all', styles: new Set(), sizes: new Set(), diffs: new Set(), sort: 'top', free: false },
  };
  const isPremium = () => !!state.premium;

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function t(key, vars) {
    let s = (window.I18N[state.lang] && window.I18N[state.lang][key]) ?? window.I18N.en[key] ?? key;
    if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
    return s;
  }
  const L = (obj) => (obj && (obj[state.lang] ?? obj.en)) || '';
  const fmt = (n) => n.toLocaleString(state.lang === 'no' ? 'nb-NO' : 'en-US');
  const money = (n) => SITE.price.currency + n.toFixed(2);
  const yearly = () => Math.round(SITE.price.monthly * 12 * (1 - SITE.price.yearlyDiscount) * 100) / 100;
  const byId = (id) => window.CATALOG.find((b) => b.id === id);
  const unlockedFor = (b) => (isPremium() || b.free ? Infinity : SITE.freeLayers);

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  /* ---------- icons ---------- */
  const P = {
    cube: '<path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 4.5 9-4.5" opacity=".5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
    download: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v3h16v-3"/>',
    puzzle: '<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3h7Z"/>',
    devices: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',
    heart: '<path d="M12 20s-7-4.4-9-9.2C1.6 7.4 3.8 4 7.2 4c2 0 3.4 1.1 4.8 2.8C13.4 5.1 14.8 4 16.8 4c3.4 0 5.6 3.4 4.2 6.8C19 15.6 12 20 12 20Z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    chat: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/>',
    discord: '<path d="M7 7.5c3.3-1.4 6.7-1.4 10 0M6.5 16.5c3.6 1.7 7.4 1.7 11 0"/><path d="M7 7.5 5 15l2.5 2.5L9 15.5M17 7.5l2 7.5-2.5 2.5-1.5-2"/><circle cx="9.5" cy="12" r="1.2"/><circle cx="14.5" cy="12" r="1.2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    arrowL: '<path d="M15 5 8 12l7 7"/>', arrowR: '<path d="m9 5 7 7-7 7"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
    play: '<path d="M8 5v14l11-7L8 5Z"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z"/>',
    world: '<circle cx="12" cy="12" r="9"/><path d="M5 8h5l2 3-2 3H6M14 4l1 4 4 1M15 20l1-4 4-2"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>', bot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.cube}</svg>`;
  const stars = (r) => `<span class="stars" aria-label="${r} / 5">${[1, 2, 3, 4, 5].map((i) => `<svg viewBox="0 0 24 24" class="${r >= i - 0.25 ? 'on' : r >= i - 0.75 ? 'half' : ''}"><path d="${P.star.match(/d="([^"]+)"/)[1]}"/></svg>`).join('')}</span>`;

  /* ---------- shared fragments ---------- */
  function card(b) {
    const vox = window.getVoxels(b);
    const isNew = (Date.now() - new Date(b.added).getTime()) / 864e5 < 14 && new Date(b.added) <= new Date();
    return `<article class="card" data-id="${b.id}">
      <a href="#/build/${b.id}" class="card-link" aria-label="${esc(b.name)}">
        <div class="thumb"><img alt="" data-thumb="${b.id}"><div class="thumb-sk"></div>
          <div class="badges">${b.free ? `<span class="badge free">${t('card.free')}</span>` : ''}${isNew ? `<span class="badge new">${t('card.new')}</span>` : ''}</div>
        </div>
        <div class="card-body">
          <h3>${esc(b.name)}</h3>
          <div class="meta"><span>${t('style.' + b.style)}</span><span>${t('size.' + b.size)}</span><span class="diff d-${b.difficulty}">${t('diff.' + b.difficulty)}</span></div>
          <div class="card-foot">${stars(b.rating)}<span class="muted">${b.rating.toFixed(1)}</span><span class="muted sep">${t('card.layers', { n: vox.size.y })}</span></div>
        </div>
      </a>
      <button class="fav ${state.favs.has(b.id) ? 'on' : ''}" data-fav="${b.id}" aria-label="${t('build.favorite')}">${icon('heart')}</button>
    </article>`;
  }
  const grid = (list) => `<div class="grid">${list.map(card).join('')}</div>`;

  const thumbQueue = [];
  let thumbTimer = null;
  function hydrateThumbs(root = document) {
    for (const img of $$('img[data-thumb]', root)) if (!img.src) thumbQueue.push(img);
    if (!thumbTimer) pump();
  }
  function pump() {
    const img = thumbQueue.shift();
    if (!img) { thumbTimer = null; return; }
    if (img.isConnected) {
      try { img.src = window.Voxel.thumbnail(byId(img.dataset.thumb)); img.onload = () => img.classList.add('ready'); } catch (e) { console.error(e); }
    }
    thumbTimer = setTimeout(pump, 0);
  }

  function section(title, sub, body, link) {
    return `<section class="section"><div class="wrap">
      <div class="section-head"><div><h2>${title}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div>${link || ''}</div>
      ${body}</div></section>`;
  }

  /* ---------- pages ---------- */
  const pages = {};
  let cleanup = [];

  pages.home = () => {
    const all = window.CATALOG;
    const blocks = all.reduce((s, b) => s + window.getVoxels(b).blocks.length, 0);
    const newest = [...all].sort((a, b) => b.added.localeCompare(a.added)).slice(0, 4);
    const weekly = all.filter((b) => b.weekly).slice(0, 3);
    const free = all.filter((b) => b.free);
    const reviews = window.CONTENT.reviews;
    const avg = reviews.reduce((s, r) => s + r.stars, 0) / reviews.length;
    const feats = [['cube', '3d'], ['layers', 'layers'], ['list', 'materials'], ['download', 'files'], ['puzzle', 'mod'], ['devices', 'devices']];
    return `
    <section class="hero"><div class="wrap hero-grid">
      <div class="hero-copy">
        <span class="kicker">${icon('sparkle')} ${t('hero.kicker')}</span>
        <h1>${t('hero.title')}</h1>
        <p class="lead">${t('hero.sub')}</p>
        <div class="cta-row">
          <a class="btn primary lg" href="#/build/starter-cabin">${icon('cube')} ${t('cta.preview')}</a>
          <a class="btn ghost lg" href="#/pricing">${t('cta.full')} · ${money(SITE.price.monthly)}${t('pricing.perMonth')}</a>
        </div>
        <p class="note">${icon('check')} ${t('hero.note')}</p>
        <div class="stats">
          <div><b>${all.length}</b><span>${t('stat.builds')}</span></div>
          <div><b>${fmt(blocks)}</b><span>${t('stat.blocks')}</span></div>
          <div><b>2</b><span>${t('stat.editions')}</span></div>
          <div><b>3</b><span>${t('stat.devices')}</span></div>
        </div>
      </div>
      <div class="hero-viewer card-panel">
        <div class="viewer" id="hero-viewer"><div class="viewer-tip" id="hero-tip"></div></div>
        <div class="hero-controls">
          <span class="muted small">${t('hero.drag')}</span>
          <div class="mini-layers"><button class="icon-btn" id="hero-prev" aria-label="${t('build.prev')}">${icon('arrowL')}</button>
          <span id="hero-layer" class="pill">${t('build.full')}</span>
          <button class="icon-btn" id="hero-next" aria-label="${t('build.next')}">${icon('arrowR')}</button></div>
          <a href="#/build/survival-house" class="small link">${esc(byId('survival-house').name)} →</a>
        </div>
      </div>
    </div></section>

    ${section(t('home.new'), t('home.newSub'), grid(newest), `<a class="link" href="#/builds?sort=new">${t('cta.browse')} →</a>`)}

    <section class="section alt"><div class="wrap">
      <div class="section-head"><div><h2>${t('home.weekly')}</h2><p class="muted">${t('home.weeklySub')}</p></div></div>
      <div class="weekly">${weekly.map((b, i) => `<a class="weekly-card" href="#/build/${b.id}"><span class="rank">#${i + 1}</span><img alt="" data-thumb="${b.id}"><div><h3>${esc(b.name)}</h3><p class="muted small">${esc(L(b.desc))}</p><div class="card-foot">${stars(b.rating)}<span class="muted">${b.rating.toFixed(1)} · ${fmt(b.votes)}</span></div></div></a>`).join('')}</div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="section-head center"><div><h2>${t('home.features')}</h2><p class="muted">${t('home.featuresSub')}</p></div></div>
      <div class="features">${feats.map(([ic, k]) => `<div class="feature">${icon(ic)}<h3>${t('feat.' + k)}</h3><p class="muted">${t('feat.' + k + 'Text')}</p></div>`).join('')}</div>
    </div></section>

    <section class="section alt" id="how"><div class="wrap">
      <div class="section-head center"><div><h2>${t('how.title')}</h2><p class="muted">${t('how.sub')}</p></div></div>
      ${howSteps()}
    </div></section>

    ${section(t('home.free'), t('home.freeSub'), grid(free))}

    <section class="section alt"><div class="wrap">
      <div class="section-head"><div><h2>${t('cat.buildings')} · ${t('cat.decorations')} · ${t('cat.redstone')}</h2></div><a class="link" href="#/builds">${t('cta.browse')} →</a></div>
      <div class="cats">${['buildings', 'decorations', 'redstone'].map((c) => { const first = all.find((b) => b.category === c && !b.free) || all.find((b) => b.category === c); const n = all.filter((b) => b.category === c).length; return `<a class="cat-tile" href="#/builds?cat=${c}"><img alt="" data-thumb="${first.id}"><div><h3>${t('cat.' + c)}</h3><span class="muted">${n} ${t('stat.builds')}</span></div></a>`; }).join('')}</div>
    </div></section>

    ${pricingBlock()}

    <section class="section"><div class="wrap">
      <div class="section-head"><div><h2>${t('reviews.title')}</h2><p class="muted rating-line">${stars(avg)} <b>${avg.toFixed(2)}</b> ${t('reviews.based', { n: reviews.length })}</p></div></div>
      <div class="reviews">${reviews.map((r) => `<figure class="review"><div>${stars(r.stars)}</div><blockquote>${esc(L(r.text))}</blockquote><figcaption><span class="avatar">${esc(r.name[0])}</span><b>${esc(r.name)}</b>${r.premium ? `<span class="badge premium">${t('reviews.premium')}</span>` : ''}</figcaption></figure>`).join('')}</div>
    </div></section>

    <section class="section alt"><div class="wrap">
      <div class="section-head center"><div><h2>${t('faq.title')}</h2></div></div>
      ${faqList(window.CONTENT.faq.slice(0, 5))}
      <p class="center"><a class="link" href="#/faq">${t('nav.faq')} →</a></p>
    </div></section>

    ${supportBand()}`;
  };
  pages.home.mount = () => {
    hydrateThumbs();
    const b = byId('survival-house');
    const vox = window.getVoxels(b);
    const tip = $('#hero-tip');
    const v = new window.Voxel.Viewer($('#hero-viewer'), vox, { unlocked: unlockedFor(b), autoRotate: true, onHover: hoverTip(tip) });
    cleanup.push(() => v.destroy());
    let layer = -1;
    const label = () => { $('#hero-layer').textContent = layer < 0 ? t('build.full') : `${t('build.layer')} ${layer + 1} / ${vox.size.y}`; };
    const go = (d) => {
      layer = layer < 0 ? (d > 0 ? 0 : vox.size.y - 1) : layer + d;
      if (layer >= vox.size.y || layer < 0) { layer = -1; v.showFull(); } else v.setLayer(layer);
      label();
      if (layer >= unlockedFor(b)) toastLocked(layer);
    };
    $('#hero-prev').onclick = () => go(-1);
    $('#hero-next').onclick = () => go(1);
  };
  let lockedToastAt = 0;
  function toastLocked(layer) { if (Date.now() - lockedToastAt > 4000) { lockedToastAt = Date.now(); toast(t('build.locked', { n: layer + 1 })); } }

  function hoverTip(tip) {
    return (it, x, y) => {
      if (!it) { tip.classList.remove('show'); return; }
      const def = window.BLOCKS[it.id];
      tip.innerHTML = `<img src="${window.Voxel.swatch(it.id)}" alt=""><div><b>${esc(def.name)}</b><span>${t('build.pos', { y: it.y + 1, x: it.x, z: it.z })}</span></div>`;
      tip.style.left = Math.min(x + 14, tip.parentElement.clientWidth - 200) + 'px';
      tip.style.top = Math.max(8, y - 50) + 'px';
      tip.classList.add('show');
    };
  }

  function howSteps() {
    return `<ol class="steps">${[1, 2, 3, 4, 5].map((i) => `<li><span class="step-n">${i}</span><h3>${t('how.' + i)}</h3><p class="muted">${t('how.' + i + 't')}</p></li>`).join('')}</ol>`;
  }
  function faqList(items) {
    return `<div class="faq">${items.map((f) => `<details><summary>${esc(L(f.q))}${icon('plus')}</summary><p>${esc(L(f.a))}</p></details>`).join('')}</div>`;
  }
  function supportBand() {
    return `<section class="section"><div class="wrap"><div class="support">
      <div>${icon('discord', 'big')}<h2>${t('support.title')}</h2><p class="muted">${t('support.text')}</p></div>
      <div class="cta-row"><a class="btn discord" href="${esc(SITE.discordUrl)}" target="_blank" rel="noopener">${icon('discord')} ${t('cta.discord')}</a>
      <button class="btn ghost" data-open-assistant>${icon('chat')} ${t('support.assistant')}</button></div>
    </div></div></section>`;
  }
  function pricingBlock() {
    const y = yearly();
    const cur = state.premium?.plan;
    const perks = [1, 2, 3, 4, 5, 6, 7].map((i) => `<li>${icon('check')} ${t('pricing.p' + i)}</li>`).join('');
    return `<section class="section alt" id="pricing"><div class="wrap">
      <div class="section-head center"><div><h2>${t('pricing.title')}</h2><p class="muted">${t('pricing.sub')}</p></div></div>
      <div class="plans">
        <div class="plan"><h3>${t('pricing.freeTitle')}</h3><div class="price"><b>${money(0)}</b></div>
          <ul>${[1, 2, 3].map((i) => `<li>${icon('check')} ${t('pricing.free' + i)}</li>`).join('')}</ul>
          <a class="btn ghost block" href="#/build/starter-cabin">${t('pricing.startFree')}</a></div>
        <div class="plan"><h3>${t('pricing.monthly')}</h3><div class="price"><b>${money(SITE.price.monthly)}</b><span>${t('pricing.perMonth')}</span></div>
          <ul>${perks}</ul>
          <button class="btn ${cur === 'monthly' ? 'ghost' : 'primary'} block" data-plan="monthly" ${cur === 'monthly' ? 'disabled' : ''}>${cur === 'monthly' ? t('pricing.current') : t('pricing.choose')}</button></div>
        <div class="plan featured"><span class="ribbon">${t('pricing.save')}</span><h3>${t('pricing.yearly')}</h3>
          <div class="price"><b>${money(y / 12)}</b><span>${t('pricing.perMonth')}</span></div><p class="muted small">${t('pricing.billedYearly', { p: money(y) })} · <s>${money(SITE.price.monthly * 12)}</s></p>
          <ul>${perks}</ul>
          <button class="btn ${cur === 'yearly' ? 'ghost' : 'primary'} block" data-plan="yearly" ${cur === 'yearly' ? 'disabled' : ''}>${cur === 'yearly' ? t('pricing.current') : t('pricing.choose')}</button></div>
      </div>
      <p class="demo-note">${t('pricing.demo')}</p>
    </div></section>`;
  }

  /* --- catalog --- */
  pages.builds = (params) => {
    const f = state.filters;
    if (params.get('cat')) f.cat = params.get('cat');
    if (params.get('sort')) f.sort = params.get('sort');
    if (params.get('style')) f.styles = new Set([params.get('style')]);
    if (params.get('q') !== null) f.q = params.get('q');
    const chip = (group, val, label) => `<button class="chip ${f[group].has(val) ? 'on' : ''}" data-chip="${group}" data-val="${val}">${label}</button>`;
    return `<section class="page-head"><div class="wrap">
      <h1>${t('catalog.title')}</h1><p class="muted">${t('catalog.sub', { n: window.CATALOG.length })}</p>
      <div class="tabs" role="tablist">${['all', 'buildings', 'decorations', 'redstone'].map((c) => `<button role="tab" class="tab ${f.cat === c ? 'on' : ''}" data-cat="${c}">${c === 'all' ? t('catalog.all') : t('cat.' + c)}</button>`).join('')}</div>
    </div></section>
    <section class="section tight"><div class="wrap catalog">
      <aside class="filters" id="filters">
        <label class="search">${icon('search')}<input id="q" type="search" placeholder="${t('catalog.search')}" value="${esc(f.q)}"></label>
        <div class="fgroup"><h4>${t('filter.sort')}</h4><select id="sort">${['top', 'new', 'popular'].map((s) => `<option value="${s}" ${f.sort === s ? 'selected' : ''}>${t('sort.' + s)}</option>`).join('')}</select></div>
        <div class="fgroup"><h4>${t('filter.style')}</h4><div class="chips">${['starter', 'survival', 'modern', 'fantasy', 'medieval', 'natural', 'farms', 'underground'].map((s) => chip('styles', s, t('style.' + s))).join('')}</div></div>
        <div class="fgroup"><h4>${t('filter.size')}</h4><div class="chips">${['small', 'medium', 'large'].map((s) => chip('sizes', s, t('size.' + s))).join('')}</div></div>
        <div class="fgroup"><h4>${t('filter.difficulty')}</h4><div class="chips">${['easy', 'medium', 'hard'].map((s) => chip('diffs', s, t('diff.' + s))).join('')}</div></div>
        <label class="toggle"><input type="checkbox" id="free-only" ${f.free ? 'checked' : ''}><span></span>${t('filter.freeOnly')}</label>
        <button class="link small" id="clear">${t('filter.clear')}</button>
      </aside>
      <div><div class="result-line muted" id="count"></div><div id="results"></div></div>
    </div></section>`;
  };
  pages.builds.mount = () => {
    const f = state.filters;
    const render = () => {
      const q = f.q.trim().toLowerCase();
      let list = window.CATALOG.filter((b) =>
        (f.cat === 'all' || b.category === f.cat) &&
        (!f.styles.size || f.styles.has(b.style)) && (!f.sizes.size || f.sizes.has(b.size)) && (!f.diffs.size || f.diffs.has(b.difficulty)) &&
        (!f.free || b.free) &&
        (!q || [b.name, L(b.desc), t('style.' + b.style), b.style, t('cat.' + b.category)].join(' ').toLowerCase().includes(q)));
      const sorters = { top: (a, b) => b.rating - a.rating || b.votes - a.votes, new: (a, b) => b.added.localeCompare(a.added), popular: (a, b) => b.popularity - a.popularity };
      list.sort(sorters[f.sort]);
      $('#count').textContent = `${list.length} / ${window.CATALOG.length}`;
      $('#results').innerHTML = list.length ? grid(list) : `<div class="empty">${icon('search', 'big')}<p>${t('catalog.empty')}</p><button class="btn ghost" id="clear2">${t('filter.clear')}</button></div>`;
      $('#clear2')?.addEventListener('click', clear);
      hydrateThumbs($('#results'));
    };
    const clear = () => { Object.assign(f, { q: '', cat: 'all', styles: new Set(), sizes: new Set(), diffs: new Set(), free: false }); history.replaceState(null, '', '#/builds'); route(); };
    $('#q').addEventListener('input', (e) => { f.q = e.target.value; render(); });
    $('#sort').addEventListener('change', (e) => { f.sort = e.target.value; render(); });
    $('#free-only').addEventListener('change', (e) => { f.free = e.target.checked; render(); });
    $('#clear').addEventListener('click', clear);
    $$('[data-cat]').forEach((b) => b.addEventListener('click', () => { f.cat = b.dataset.cat; $$('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
    $$('[data-chip]').forEach((c) => c.addEventListener('click', () => {
      const set = f[c.dataset.chip];
      set.has(c.dataset.val) ? set.delete(c.dataset.val) : set.add(c.dataset.val);
      c.classList.toggle('on');
      render();
    }));
    history.replaceState(null, '', '#/builds');
    render();
  };

  /* --- build detail with the 3D guide --- */
  pages.build = (params, id) => {
    const b = byId(id);
    if (!b) return `<section class="page-head"><div class="wrap"><h1>${t('build.notFound')}</h1><a class="btn" href="#/builds">${t('build.back')}</a></div></section>`;
    const vox = window.getVoxels(b);
    const unlocked = unlockedFor(b);
    const related = window.CATALOG.filter((x) => x.id !== b.id && (x.category === b.category || x.style === b.style)).slice(0, 4);
    const dl = (k, ic) => `<button class="dl ${unlocked === Infinity ? '' : 'locked'}" data-dl="${k}">${icon(unlocked === Infinity ? ic : 'lock')}<div><b>${t('build.dl' + k[0].toUpperCase() + k.slice(1))}</b><span class="muted small">${t('build.dl' + k[0].toUpperCase() + k.slice(1) + 'T')}</span></div></button>`;
    return `<section class="build-head"><div class="wrap">
      <a class="link small" href="#/builds">${icon('arrowL')} ${t('build.back')}</a>
      <div class="build-title">
        <div><h1>${esc(b.name)}</h1>
          <div class="meta big"><span>${t('cat.' + b.category)}</span><span>${t('style.' + b.style)}</span><span>${t('size.' + b.size)}</span><span class="diff d-${b.difficulty}">${t('diff.' + b.difficulty)}</span>
          <span class="rating">${stars(b.rating)} ${b.rating.toFixed(1)} <span class="muted">(${fmt(b.votes)})</span></span></div>
        </div>
        <button class="btn ghost fav-btn ${state.favs.has(b.id) ? 'on' : ''}" data-fav="${b.id}">${icon('heart')} <span>${state.favs.has(b.id) ? t('build.unfavorite') : t('build.favorite')}</span></button>
      </div>
      <p class="muted desc">${esc(L(b.desc))}</p>
      ${b.free ? `<p class="free-banner">${icon('check')} ${t('build.freeBadge')}</p>` : ''}
    </div></section>
    <section class="section tight"><div class="wrap guide">
      <div class="guide-main">
        <div class="viewer-panel card-panel">
          <div class="viewer tall" id="viewer">
            <div class="viewer-tip" id="tip"></div>
            <div class="viewer-hint muted small">${icon('eye')} ${t('build.hover')}</div>
            <div class="lock-overlay" id="lock" hidden>
              <div>${icon('lock', 'big')}<h3 id="lock-title"></h3><p>${t('build.lockedText')}</p>
              <a class="btn primary" href="#/pricing">${t('cta.full')}</a></div>
            </div>
          </div>
          <div class="layer-bar">
            <button class="icon-btn" id="prev" aria-label="${t('build.prev')}">${icon('arrowL')}</button>
            <div class="slider-wrap">
              <input type="range" id="slider" min="1" max="${vox.size.y}" value="${vox.size.y}" aria-label="${t('build.layer')}">
              <div class="slider-lock" style="left:${unlocked === Infinity ? 100 : (Math.min(unlocked, vox.size.y) / vox.size.y) * 100}%"></div>
            </div>
            <button class="icon-btn" id="next" aria-label="${t('build.next')}">${icon('arrowR')}</button>
            <span class="pill layer-label" id="layer-label"></span>
          </div>
          <div class="view-bar">
            <button class="btn sm" id="full">${icon('cube')} ${t('build.full')}</button>
            <div class="seg" role="group"><button class="on" data-mode="stack">${t('build.stack')}</button><button data-mode="single">${t('build.single')}</button></div>
            <label class="toggle small"><input type="checkbox" id="ghost" checked><span></span>${t('build.ghost')}</label>
            <button class="btn sm ghost" id="reset">${icon('reset')} ${t('build.reset')}</button>
          </div>
          <p class="muted small keys">${t('build.keys')}</p>
        </div>
        <div class="dims muted small">${t('build.size')}: ${t('build.dims', { x: vox.size.x, z: vox.size.z, y: vox.size.y })} · ${t('card.blocks', { n: fmt(vox.blocks.length) })}</div>
      </div>
      <aside class="guide-side">
        <div class="card-panel pad">
          <div class="panel-head"><h3>${icon('list')} ${t('build.materials')}</h3>
            <div class="seg small" role="group"><button data-mat="layer">${t('build.layer')}</button><button class="on" data-mat="all">${t('build.materialsAll')}</button></div></div>
          <div id="materials"></div>
        </div>
        <div class="card-panel pad">
          <div class="panel-head"><h3>${icon('layers')} ${t('build.plan')}</h3></div>
          <div class="plan-wrap"><canvas id="plan"></canvas><div class="viewer-tip" id="plan-tip"></div></div>
        </div>
        <div class="card-panel pad">
          <div class="panel-head"><h3>${icon('download')} ${t('build.downloads')}</h3></div>
          <div class="dls">${dl('schem', 'download')}${dl('java', 'world')}${dl('world', 'globe')}${dl('addon', 'puzzle')}</div>
          ${unlocked === Infinity ? `<details class="bot"><summary>${icon('bot')} ${t('build.sendBot')}</summary><p class="muted small">${t('build.sendBotT')}</p>
          <pre><code id="curl">curl -s -F file=@${b.id}.schem ${esc(SITE.apiUrl)}/schematics</code></pre><button class="btn sm ghost" id="copy-curl">${icon('copy')} ${t('common.copy')}</button></details>` : ''}
        </div>
      </aside>
    </div></section>
    ${related.length ? section(t('build.related'), '', grid(related)) : ''}`;
  };
  pages.build.mount = (params, id) => {
    const b = byId(id);
    if (!b) return;
    hydrateThumbs();
    const vox = window.getVoxels(b);
    const H = vox.size.y;
    const unlocked = unlockedFor(b);
    const v = new window.Voxel.Viewer($('#viewer'), vox, { unlocked, onHover: hoverTip($('#tip')) });
    cleanup.push(() => v.destroy());
    let layer = H - 1, full = true, matMode = 'all';
    const setMat = (m) => { matMode = m; $$('[data-mat]').forEach((x) => x.classList.toggle('on', x.dataset.mat === m)); };
    const slider = $('#slider');
    const checks = new Set(state.checks[b.id] || []);

    function update() {
      slider.value = layer + 1;
      slider.style.setProperty('--p', ((layer) / Math.max(1, H - 1)) * 100 + '%');
      $('#layer-label').textContent = full ? t('build.full') : `${t('build.layer')} ${layer + 1} ${t('build.of')} ${H}`;
      $('#full').classList.toggle('on', full);
      const locked = !full && layer >= unlocked;
      $('#lock').hidden = !locked;
      if (locked) $('#lock-title').textContent = t('build.locked', { n: layer + 1 });
      renderMaterials();
      renderPlan();
    }
    function setLayer(n) { layer = Math.max(0, Math.min(H - 1, n)); full = false; setMat('layer'); v.setLayer(layer); update(); }
    function showFull() { full = true; layer = H - 1; setMat('all'); v.showFull(); update(); }
    function renderMaterials() {
      const el = $('#materials');
      const curLayer = full ? null : layer;
      if (matMode === 'layer') {
        if (curLayer === null) { setLayer(0); return; }
        if (curLayer >= unlocked) { el.innerHTML = lockedRows(window.materialList(vox, Infinity, curLayer)); return; }
        el.innerHTML = matTable(window.materialList(vox, Infinity, curLayer), false, `${t('build.materialsLayer')} (${curLayer + 1})`);
        return;
      }
      const list = window.materialList(vox);
      if (unlocked !== Infinity) { el.innerHTML = matTable(list.slice(0, 3), false, t('build.materialsAll')) + lockedRows(list.slice(3)); return; }
      el.innerHTML = `<p class="muted small">${t('build.checkHint')}</p>` + matTable(list, true, t('build.materialsAll'));
      $$('#materials input[type=checkbox]').forEach((c) => c.addEventListener('change', () => {
        c.checked ? checks.add(c.value) : checks.delete(c.value);
        state.checks[b.id] = [...checks]; store.set('checks', state.checks);
        c.closest('tr').classList.toggle('done', c.checked);
      }));
    }
    function stacks(n) { const s = Math.floor(n / 64), r = n % 64; return s ? (r ? t('build.stacks', { s, r }) : t('build.stacksOnly', { s })) : ''; }
    function matTable(list, checkable, caption) {
      const total = list.reduce((s, m) => s + m.count, 0);
      return `<table class="mats"><caption class="sr">${esc(caption)}</caption><tbody>${list.map((m) => `<tr class="${checkable && checks.has(m.name) ? 'done' : ''}">
        ${checkable ? `<td class="ck"><input type="checkbox" value="${esc(m.name)}" ${checks.has(m.name) ? 'checked' : ''} aria-label="${esc(m.name)}"></td>` : ''}
        <td class="sw"><img src="${window.Voxel.swatch(m.id)}" alt=""></td><td>${esc(m.name)}<span class="muted small stack">${stacks(m.count)}</span></td><td class="num">${fmt(m.count)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="${checkable ? 3 : 2}">${t('build.total')}</td><td class="num">${fmt(total)}</td></tr></tfoot></table>`;
    }
    function lockedRows(list) {
      return `<div class="locked-rows"><table class="mats blur" aria-hidden="true"><tbody>${list.slice(0, 5).map((m) => `<tr><td class="sw"><img src="${window.Voxel.swatch(m.id)}" alt=""></td><td>${esc(m.name)}</td><td class="num">${m.count}</td></tr>`).join('')}</tbody></table>
        <a class="btn primary sm" href="#/pricing">${icon('lock')} ${t('build.lockedMaterials')}</a></div>`;
    }
    let planCells = null;
    function renderPlan() {
      const l = full ? 0 : layer;
      planCells = { layer: l, ...window.Voxel.drawLayerPlan($('#plan'), vox, l, { locked: l >= unlocked, max: 300 }) };
    }
    const planTip = $('#plan-tip');
    $('#plan').addEventListener('pointermove', (e) => {
      const r = e.target.getBoundingClientRect();
      const scale = e.target.width / r.width;
      const x = Math.floor(((e.clientX - r.left) * scale) / planCells.cell), z = Math.floor(((e.clientY - r.top) * scale) / planCells.cell);
      const c = planCells.cells.find((c) => c.x === x && c.z === z);
      if (!c || planCells.layer >= unlocked) { planTip.classList.remove('show'); return; }
      hoverTip(planTip)({ id: c.id, x, y: planCells.layer, z }, e.clientX - r.left, e.clientY - r.top + 40);
    });
    $('#plan').addEventListener('pointerleave', () => planTip.classList.remove('show'));

    slider.addEventListener('input', () => setLayer(slider.value - 1));
    $('#prev').onclick = () => setLayer(full ? H - 1 : layer - 1);
    $('#next').onclick = () => (full ? setLayer(0) : layer === H - 1 ? showFull() : setLayer(layer + 1));
    $('#full').onclick = showFull;
    $('#reset').onclick = () => v.resetView();
    $('#ghost').onchange = (e) => v.setGhost(e.target.checked);
    $$('[data-mode]').forEach((btn) => btn.addEventListener('click', () => { $$('[data-mode]').forEach((x) => x.classList.toggle('on', x === btn)); v.setMode(btn.dataset.mode); if (full) setLayer(0); }));
    $$('[data-mat]').forEach((btn) => btn.addEventListener('click', () => { setMat(btn.dataset.mat); renderMaterials(); }));
    $$('[data-dl]').forEach((btn) => btn.addEventListener('click', async () => {
      if (unlocked !== Infinity) { toast(t('toast.premiumNeeded')); location.hash = '#/pricing'; return; }
      const k = btn.dataset.dl;
      if (k === 'schem') { await window.Schem.download(b); toast(t('toast.schem')); return; }
      const url = SITE.downloads[b.id]?.[{ java: 'java', world: 'mcworld', addon: 'mcaddon' }[k]];
      if (url) window.open(url, '_blank', 'noopener'); else toast(t('toast.hosted'));
    }));
    $('#copy-curl')?.addEventListener('click', () => { navigator.clipboard?.writeText($('#curl').textContent).then(() => toast(t('toast.copied')), () => {}); });
    const onKey = (e) => {
      if (/input|textarea|select/i.test(document.activeElement?.tagName) && document.activeElement.type !== 'range') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); $('#next').click(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); $('#prev').click(); }
      else if (e.key === 'f' || e.key === 'F') $('#full').click();
      else if (e.key === 'r' || e.key === 'R') v.resetView();
    };
    document.addEventListener('keydown', onKey);
    cleanup.push(() => document.removeEventListener('keydown', onKey));
    update();
  };

  pages.pricing = () => `${pricingBlock()}<section class="section"><div class="wrap"><div class="section-head center"><div><h2>${t('faq.title')}</h2></div></div>${faqList(window.CONTENT.faq)}</div></section>`;
  pages.faq = () => `<section class="page-head"><div class="wrap"><h1>${t('faq.title')}</h1></div></section><section class="section tight"><div class="wrap">${faqList(window.CONTENT.faq)}</div></section>${supportBand()}`;
  pages.how = () => `<section class="page-head"><div class="wrap"><h1>${t('how.title')}</h1><p class="muted">${t('how.sub')}</p></div></section>
    <section class="section tight"><div class="wrap">${howSteps()}</div></section>
    ${section(t('tut.title'), t('tut.sub'), tutorialGrid(window.CONTENT.tutorials.slice(0, 3)), `<a class="link" href="#/tutorials">${t('nav.tutorials')} →</a>`)}
    ${pricingBlock()}`;

  function tutorialGrid(list) {
    const icMap = { mod: 'puzzle', layers: 'layers', world: 'world', bedrock: 'globe', addon: 'puzzle', cube: 'cube' };
    return `<div class="tutorials">${list.map((tu) => `<article class="tutorial card-panel">
      <div class="video" data-video="${tu.id}">${icon(icMap[tu.icon])}<button class="play" aria-label="${t('tut.watch')}">${icon('play')}</button><span class="len">${tu.length}</span></div>
      <div class="pad"><h3>${esc(L(tu.title))}</h3><h4 class="muted small">${t('tut.steps')}</h4><ol>${L(tu.steps).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div></article>`).join('')}</div>`;
  }
  pages.tutorials = () => `<section class="page-head"><div class="wrap"><h1>${t('tut.title')}</h1><p class="muted">${t('tut.sub')}</p></div></section>
    <section class="section tight"><div class="wrap">${tutorialGrid(window.CONTENT.tutorials)}</div></section>${supportBand()}`;
  pages.tutorials.mount = () => $$('[data-video] .play').forEach((p) => p.addEventListener('click', () => toast(t('toast.hosted'))));
  pages.how.mount = pages.tutorials.mount;

  pages.mod = () => `<section class="page-head"><div class="wrap"><h1>${t('mod.title')}</h1><p class="muted">${t('mod.sub')}</p></div></section>
    <section class="section tight"><div class="wrap two">
      <div class="card-panel pad mod-card"><span class="kicker">${icon('puzzle')} Fabric</span><h2>${t('mod.java')}</h2>
        <ol class="numbered">${[1, 2, 3, 4, 5].map((i) => `<li><span>${t('mod.j' + i).replace(' B ', ' <kbd>B</kbd> ')}</span></li>`).join('')}</ol>
        <a class="btn primary" ${SITE.modUrl ? `href="${esc(SITE.modUrl)}"` : 'href="#/mod" data-hosted'}>${icon('download')} ${t('mod.download')}</a></div>
      <div class="card-panel pad mod-card"><span class="kicker">${icon('globe')} 1.21.40+</span><h2>${t('mod.bedrock')}</h2>
        <ol class="numbered">${[1, 2, 3, 4, 5].map((i) => `<li><span>${t('mod.b' + i)}</span></li>`).join('')}</ol>
        <a class="btn ghost" href="#/tutorials">${icon('play')} ${t('mod.downloadAddon')}</a></div>
    </div></section>
    <section class="section alt"><div class="wrap two center-v">
      <div><span class="kicker">${icon('bot')} Blueprint bot</span><h2>${t('mod.botTitle')}</h2><p class="muted">${t('mod.botText')}</p></div>
      <pre class="code"><code># 1. upload a schematic from any build page
curl -s -F file=@survival-house.schem ${esc(SITE.apiUrl)}/schematics

# 2. let the bot build it
curl -s -X POST ${esc(SITE.apiUrl)}/sessions \\
  -H 'content-type: application/json' -d '{
  "server": { "host": "mc", "port": 25565 },
  "schematicId": "&lt;id&gt;",
  "origin": { "x": 40, "y": -60, "z": 40 },
  "mode": "op"
}'</code></pre>
    </div></section>`;
  pages.mod.mount = () => $$('[data-hosted]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast(t('toast.hosted')); }));

  /* --- requests --- */
  pages.requests = () => `<section class="page-head"><div class="wrap"><h1>${t('req.title')}</h1><p class="muted">${t('req.sub')}</p></div></section>
    <section class="section tight"><div class="wrap two top">
      <form class="card-panel pad form" id="req-form">
        <label>${t('req.name')}<input name="name" required maxlength="60"></label>
        <div class="row"><label>${t('req.style')}<select name="style">${['starter', 'survival', 'modern', 'fantasy', 'medieval', 'natural', 'farms', 'underground'].map((s) => `<option value="${s}">${t('style.' + s)}</option>`).join('')}</select></label>
        <label>${t('req.size')}<select name="size"><option value="small">${t('req.sizeSmall')}</option><option value="medium" selected>${t('req.sizeMedium')}</option><option value="large">${t('req.sizeLarge')}</option></select></label></div>
        <label>${t('req.desc')}<textarea name="desc" rows="4" maxlength="400" required></textarea></label>
        <label>${t('req.image')}<input name="image" type="url" placeholder="https://"></label>
        <button class="btn primary" type="submit">${t('req.submit')}</button>
      </form>
      <div><div class="panel-head"><h2>${t('req.list')}</h2><div class="seg small"><button class="on" data-rsort="top">${t('req.sortTop')}</button><button data-rsort="new">${t('req.sortNew')}</button></div></div><div id="req-list"></div></div>
    </div></section>`;
  pages.requests.mount = () => {
    let sort = 'top';
    const render = () => {
      const all = [...window.CONTENT.requests, ...state.myRequests].map((r) => ({ ...r, total: r.votes + (state.votes[r.id] ? 1 : 0) }));
      all.sort(sort === 'top' ? (a, b) => b.total - a.total : (a, b) => b.date.localeCompare(a.date));
      $('#req-list').innerHTML = all.map((r) => `<div class="req card-panel">
        <button class="vote ${state.votes[r.id] ? 'on' : ''}" data-vote="${esc(r.id)}" aria-label="${t('req.vote')}">${icon('arrowR')}<b>${r.total}</b><span>${t('req.votes')}</span></button>
        <div><h3>${esc(r.name)} ${r.priority ? `<span class="badge premium">${t('req.priority')}</span>` : ''}</h3>
        <div class="meta"><span>${t('style.' + r.style)}</span><span>${t('size.' + r.size)}</span>${r.image ? `<a class="link small" href="${esc(r.image)}" target="_blank" rel="noopener nofollow">${t('req.ref')}</a>` : ''}</div>
        <p class="muted small">${esc(r.desc)}</p></div></div>`).join('');
      $$('[data-vote]').forEach((btn) => btn.addEventListener('click', () => {
        const id = btn.dataset.vote;
        state.votes[id] ? delete state.votes[id] : (state.votes[id] = true);
        store.set('votes', state.votes);
        render();
      }));
    };
    $$('[data-rsort]').forEach((btn) => btn.addEventListener('click', () => { $$('[data-rsort]').forEach((x) => x.classList.toggle('on', x === btn)); sort = btn.dataset.rsort; render(); }));
    $('#req-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      const image = /^https?:\/\//i.test(d.image || '') ? d.image : '';
      const rid = 'u' + Date.now();
      state.myRequests.push({ id: rid, name: d.name.trim(), style: d.style, size: d.size, desc: d.desc.trim(), image, votes: 0, date: new Date().toISOString().slice(0, 10), priority: isPremium(), mine: true });
      store.set('requests', state.myRequests);
      e.target.reset();
      toast(t('req.thanks'));
      sort = 'new';
      $$('[data-rsort]').forEach((x) => x.classList.toggle('on', x.dataset.rsort === 'new'));
      render();
    });
    render();
  };

  pages.favorites = () => {
    const list = window.CATALOG.filter((b) => state.favs.has(b.id));
    return `<section class="page-head"><div class="wrap"><h1>${t('fav.title')}</h1></div></section>
      <section class="section tight"><div class="wrap">${list.length ? grid(list) : `<div class="empty">${icon('heart', 'big')}<p>${t('fav.empty')}</p><a class="btn primary" href="#/builds">${t('cta.browse')}</a></div>`}</div></section>`;
  };
  pages.favorites.mount = () => hydrateThumbs();

  pages.account = () => {
    const u = state.user;
    if (!u) return `<section class="page-head"><div class="wrap"><h1>${t('acc.title')}</h1></div></section>
      <section class="section tight"><div class="wrap narrow"><form class="card-panel pad form" id="signin">
        <label>${t('acc.name')}<input name="name" required maxlength="32" autocomplete="nickname"></label>
        <label>${t('acc.email')}<input name="email" type="email" required autocomplete="email"></label>
        <button class="btn primary" type="submit">${t('acc.signin')}</button><p class="muted small">${t('acc.local')}</p></form></div></section>`;
    const favs = window.CATALOG.filter((b) => state.favs.has(b.id));
    return `<section class="page-head"><div class="wrap"><h1>${t('acc.hello', { n: esc(u.name) })}</h1><p class="muted">${esc(u.email)}</p></div></section>
      <section class="section tight"><div class="wrap two top">
        <div class="card-panel pad"><h3>${t('acc.plan')}</h3>
          <p class="plan-status ${isPremium() ? 'premium' : ''}">${isPremium() ? `${icon('sparkle')} ${t('acc.premium')} · ${t('pricing.' + state.premium.plan)}` : t('acc.free')}</p>
          ${isPremium() ? `<p class="muted small">${t('acc.since', { d: new Date(state.premium.since).toLocaleDateString(state.lang === 'no' ? 'nb-NO' : 'en-US') })}</p><button class="btn ghost" id="cancel">${t('acc.cancel')}</button>` : `<a class="btn primary" href="#/pricing">${t('acc.upgrade')}</a>`}
          <hr><button class="btn ghost" id="signout">${t('acc.signout')}</button><p class="muted small">${t('acc.local')}</p></div>
        <div><h3>${t('acc.favorites')} (${favs.length})</h3>${favs.length ? grid(favs) : `<p class="muted">${t('fav.empty')}</p>`}</div>
      </div></section>`;
  };
  pages.account.mount = () => {
    hydrateThumbs();
    $('#signin')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      state.user = { name: d.name.trim(), email: d.email.trim() };
      store.set('user', state.user); toast(t('toast.signin')); renderHeader(); route();
    });
    $('#signout')?.addEventListener('click', () => { state.user = null; store.set('user', null); renderHeader(); route(); });
    $('#cancel')?.addEventListener('click', () => { state.premium = null; store.set('premium', null); toast(t('toast.cancelled')); renderHeader(); route(); });
  };

  pages.about = () => {
    const team = [['B', 'about.role1', 'Blueprint'], ['R', 'about.role2', 'Builds'], ['C', 'about.role3', 'Discord']];
    return `<section class="page-head"><div class="wrap narrow"><h1>${t('about.title')}</h1><p class="lead">${t('about.text1')}</p><p class="muted">${t('about.text2')}</p></div></section>
    <section class="section tight"><div class="wrap"><h2>${t('about.values')}</h2>
      <div class="features three">${[['cube', 1], ['user', 2], ['bot', 3]].map(([ic, i]) => `<div class="feature">${icon(ic)}<h3>${t('about.v' + i)}</h3><p class="muted">${t('about.v' + i + 't')}</p></div>`).join('')}</div>
      <h2>${t('about.team')}</h2>
      <div class="team">${team.map(([a, role, tag]) => `<div class="member card-panel"><span class="avatar xl">${a}</span><b>${t(role)}</b><span class="muted small">${tag}</span></div>`).join('')}</div>
    </div></section>${supportBand()}`;
  };

  /* ---------- header, footer, assistant ---------- */
  function renderHeader() {
    const links = [['#/builds', 'nav.builds'], ['#/how', 'nav.how'], ['#/mod', 'nav.mod'], ['#/tutorials', 'nav.tutorials'], ['#/requests', 'nav.requests'], ['#/pricing', 'nav.pricing']];
    $('#header').innerHTML = `<div class="wrap nav">
      <a class="logo" href="#/" aria-label="${SITE.name}">${logo()}<span>Blueprint<b>Builds</b></span></a>
      <nav class="links" id="links">${links.map(([h, k]) => `<a href="${h}" data-nav="${h}">${t(k)}</a>`).join('')}
        <a href="#/favorites" data-nav="#/favorites" class="only-mobile">${t('nav.favorites')}</a><a href="#/account" data-nav="#/account" class="only-mobile">${state.user ? esc(state.user.name) : t('nav.signin')}</a><a href="#/about" data-nav="#/about" class="only-mobile">${t('nav.about')}</a></nav>
      <div class="nav-right">
        <label class="lang">${icon('globe')}<select id="lang" aria-label="Language">${window.LANGS.map((l) => `<option value="${l.code}" ${l.code === state.lang ? 'selected' : ''}>${l.label}</option>`).join('')}</select></label>
        <a class="icon-btn hide-sm" href="#/favorites" aria-label="${t('nav.favorites')}" title="${t('nav.favorites')}">${icon('heart')}${state.favs.size ? `<i class="dot">${state.favs.size}</i>` : ''}</a>
        <a class="icon-btn hide-sm" href="#/account" aria-label="${t('nav.account')}" title="${state.user ? esc(state.user.name) : t('nav.signin')}">${icon('user')}</a>
        ${isPremium() ? `<span class="badge premium lg">${icon('sparkle')} Premium</span>` : `<a class="btn primary sm hide-sm" href="#/pricing">${t('cta.full')}</a>`}
        <button class="icon-btn menu-btn" id="menu" aria-label="Menu">${icon('menu')}</button>
      </div></div>`;
    $('#lang').addEventListener('change', (e) => { state.lang = e.target.value; store.set('lang', state.lang); document.documentElement.lang = state.lang === 'no' ? 'nb' : state.lang; renderHeader(); renderFooter(); renderAssistant(); route(); });
    $('#menu').addEventListener('click', () => $('#header').classList.toggle('open'));
    markNav();
  }
  function markNav() {
    const h = location.hash.split('?')[0] || '#/';
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', h.startsWith(a.dataset.nav)));
  }
  const logo = () => `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 3 9v14l13 7 13-7V9L16 2Z" fill="#2d6a4f"/><path d="M16 2 3 9l13 7 13-7L16 2Z" fill="#52b788"/><path d="M16 16v14l13-7V9L16 16Z" fill="#1b4332"/><path d="M9.5 12.5 16 16l6.5-3.5M16 16v7" stroke="#d8f3dc" stroke-width="1.4" fill="none" stroke-dasharray="2 1.6"/></svg>`;

  function renderFooter() {
    $('#footer').innerHTML = `<div class="wrap foot">
      <div><a class="logo" href="#/">${logo()}<span>Blueprint<b>Builds</b></span></a><p class="muted small">${t('footer.tag')}</p>
        <a class="btn discord sm" href="${esc(SITE.discordUrl)}" target="_blank" rel="noopener">${icon('discord')} Discord</a></div>
      <div><h4>${t('footer.product')}</h4><a href="#/builds">${t('nav.builds')}</a><a href="#/pricing">${t('nav.pricing')}</a><a href="#/mod">${t('nav.mod')}</a><a href="#/requests">${t('nav.requests')}</a></div>
      <div><h4>${t('footer.help')}</h4><a href="#/how">${t('nav.how')}</a><a href="#/tutorials">${t('nav.tutorials')}</a><a href="#/faq">${t('nav.faq')}</a><a href="#" data-open-assistant>${t('assist.title')}</a></div>
      <div><h4>${t('footer.company')}</h4><a href="#/about">${t('nav.about')}</a><a href="#/favorites">${t('nav.favorites')}</a><a href="#/account">${t('nav.account')}</a></div>
    </div><div class="wrap fine muted small">© ${new Date().getFullYear()} ${SITE.name}. ${t('footer.notAffiliated')}</div>`;
  }

  /* Rule-based helper. It answers from this table and points to Discord otherwise. */
  const ANSWERS = [
    { k: ['litematic', 'schem', 'schematic', 'file', 'fil', 'use', 'bruk'], en: 'Download the .schem from a build page, put it in .minecraft/schematics and load it with Litematica (press M). The Tutorials page walks through it step by step.', no: 'Last ned .schem-filen fra en byggside, legg den i .minecraft/schematics og last den inn med Litematica (trykk M). Veiledningssiden går gjennom det steg for steg.', link: '#/tutorials' },
    { k: ['bedrock', 'mcworld', 'mcaddon', 'addon', 'add-on', 'realms', 'pe', 'console', 'konsoll'], en: 'Yes! Bedrock players can import ready-made .mcworld files or use the .mcaddon add-on (1.21.40+), which also works on Realms.', no: 'Ja! Bedrock-spillere kan importere ferdige .mcworld-filer eller bruke .mcaddon-add-onen (1.21.40+), som også virker på Realms.', link: '#/mod' },
    { k: ['premium', 'price', 'pris', 'cost', 'koster', 'subscri', 'abonn', 'include', 'får'], en: () => `Premium is ${money(SITE.price.monthly)}/month or ${money(yearly())}/year (40% off). It unlocks every layer of every build, full material lists, schematics and world downloads. Cancel anytime.`, no: () => `Premium koster ${money(SITE.price.monthly)}/mnd eller ${money(yearly())}/år (40 % rabatt). Du får alle lag i alle bygg, hele materiallister, schematics og verdensnedlastinger. Avslutt når som helst.`, link: '#/pricing' },
    { k: ['cancel', 'avslutt', 'refund', 'stopp'], en: 'You can cancel anytime from your Account page and keep access until the period ends.', no: 'Du kan avslutte når som helst fra kontosiden og beholder tilgangen ut perioden.', link: '#/account' },
    { k: ['java world', 'world download', 'verden', 'saves', 'zip'], en: 'Unzip the Java world into .minecraft/saves and restart Minecraft. It shows up in Singleplayer with the build already in place.', no: 'Pakk ut Java-verdenen i .minecraft/saves og start Minecraft på nytt. Den dukker opp under Singleplayer med bygget på plass.', link: '#/tutorials' },
    { k: ['mod', 'fabric', 'hologram', 'auto', 'bot'], en: 'The free Fabric mod opens the catalog with B, shows a ghost preview and can place the build or auto-build it block by block.', no: 'Den gratis Fabric-modden åpner katalogen med B, viser en spøkelsesvisning og kan plassere bygget eller autobygge det blokk for blokk.', link: '#/mod' },
    { k: ['layer', 'lag', '3d', 'rotate', 'roter', 'zoom', 'guide', 'mobile', 'mobil', 'phone'], en: 'Open a build, drag to rotate, scroll or pinch to zoom, and use the slider or arrow keys to go layer by layer. It works on PC, tablet and phone.', no: 'Åpne et bygg, dra for å rotere, scroll eller knip for å zoome, og bruk glideren eller piltastene for å gå lag for lag. Det virker på PC, nettbrett og mobil.', link: '#/build/starter-cabin' },
    { k: ['free', 'gratis', 'try', 'prøv', 'account', 'konto'], en: 'The first two layers of every build are free without an account, and the free builds are completely unlocked.', no: 'De to første lagene av alle bygg er gratis uten konto, og gratisbyggene er helt åpne.', link: '#/builds' },
    { k: ['request', 'ønske', 'suggest', 'foreslå', 'vote', 'stem'], en: 'Head to Request a build to suggest ideas and vote. Popular requests are built first.', no: 'Gå til «Ønsk deg et bygg» for å foreslå ideer og stemme. Populære ønsker bygges først.', link: '#/requests' },
    { k: ['material', 'block', 'blokk', 'count', 'tell'], en: 'Every build page has a material list for the whole build and for each layer, with stack counts and checkboxes.', no: 'Hver byggside har en materialliste for hele bygget og for hvert lag, med antall stabler og avkrysningsbokser.' },
  ];
  function answer(q) {
    const s = q.toLowerCase();
    let best = null, score = 0;
    for (const a of ANSWERS) { const n = a.k.filter((k) => s.includes(k)).length; if (n > score) { score = n; best = a; } }
    if (!best) return { text: t('assist.fallback'), link: SITE.discordUrl, ext: true };
    const txt = best[state.lang] || best.en;
    return { text: typeof txt === 'function' ? txt() : txt, link: best.link };
  }
  function renderAssistant() {
    $('#assistant').innerHTML = `<button class="assist-fab" id="assist-fab" aria-label="${t('assist.title')}">${icon('chat')}</button>
      <div class="assist-panel" id="assist-panel" role="dialog" aria-label="${t('assist.title')}" hidden>
        <header><div><b>${t('assist.title')}</b><span class="muted small">${t('assist.tag')}</span></div><button class="icon-btn" id="assist-close" aria-label="${t('common.close')}">${icon('close')}</button></header>
        <div class="assist-log" id="assist-log"><div class="msg bot">${t('assist.hello')}</div></div>
        <div class="assist-quick">${[1, 2, 3].map((i) => `<button class="chip" data-q="${esc(t('assist.q' + i))}">${t('assist.q' + i)}</button>`).join('')}</div>
        <form id="assist-form"><input id="assist-in" placeholder="${t('assist.placeholder')}" autocomplete="off"><button class="btn primary sm" type="submit">${t('assist.send')}</button></form>
      </div>`;
    const panel = $('#assist-panel');
    const log = $('#assist-log');
    const ask = (q) => {
      if (!q.trim()) return;
      log.insertAdjacentHTML('beforeend', `<div class="msg me">${esc(q)}</div>`);
      const a = answer(q);
      setTimeout(() => {
        log.insertAdjacentHTML('beforeend', `<div class="msg bot">${esc(a.text)}${a.link ? ` <a href="${esc(a.link)}" ${a.ext ? 'target="_blank" rel="noopener"' : ''} class="link">→</a>` : ''}</div>`);
        log.scrollTop = log.scrollHeight;
      }, 250);
      log.scrollTop = log.scrollHeight;
    };
    $('#assist-fab').onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) $('#assist-in').focus(); };
    $('#assist-close').onclick = () => (panel.hidden = true);
    $$('[data-q]', panel).forEach((c) => (c.onclick = () => ask(c.dataset.q)));
    $('#assist-form').onsubmit = (e) => { e.preventDefault(); ask($('#assist-in').value); $('#assist-in').value = ''; };
  }

  /* ---------- global events ---------- */
  document.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault();
      const id = fav.dataset.fav;
      const on = !state.favs.has(id);
      on ? state.favs.add(id) : state.favs.delete(id);
      store.set('favs', [...state.favs]);
      $$(`[data-fav="${id}"]`).forEach((el) => { el.classList.toggle('on', on); const s = el.querySelector('span'); if (s) s.textContent = on ? t('build.unfavorite') : t('build.favorite'); });
      toast(on ? t('toast.fav') : t('toast.unfav'));
      renderHeader();
      return;
    }
    const plan = e.target.closest('[data-plan]');
    if (plan) {
      state.premium = { plan: plan.dataset.plan, since: Date.now() };
      store.set('premium', state.premium);
      toast(t('toast.premium'));
      renderHeader(); route();
      return;
    }
    if (e.target.closest('[data-open-assistant]')) { e.preventDefault(); const p = $('#assist-panel'); p.hidden = false; $('#assist-in').focus(); }
    if (e.target.closest('#links a')) $('#header').classList.remove('open');
  });

  /* ---------- router ---------- */
  function route() {
    cleanup.forEach((fn) => fn()); cleanup = [];
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const [name, arg] = path.split('/');
    const params = new URLSearchParams(query || '');
    const page = pages[name || 'home'] || pages.home;
    $('#main').innerHTML = page(params, arg);
    document.title = (name === 'build' && byId(arg) ? byId(arg).name + ' · ' : '') + SITE.name;
    markNav();
    page.mount?.(params, arg);
    if (!arg || name !== 'build') window.scrollTo(0, 0); else window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  document.documentElement.lang = state.lang === 'no' ? 'nb' : state.lang;
  renderHeader(); renderFooter(); renderAssistant(); route();
})();
