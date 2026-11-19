const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const gridEl = $('presets');
const modesEl = $('modes');
const savedListEl = $('savedList');
const saveNameEl = $('saveName');
const importCodeEl = $('importCode');
const sitesListEl = $('sitesList');
const autoDnEl = $('autoDN');
const protectVideoEl = $('protectVideo');

let currentCfg = null;
// стиль, поверх которого работает тонкая настройка
let baseCfg = null;
let settings = {};

$('ver').textContent = 'v' + chrome.runtime.getManifest().version;

// --- иконки (одно семейство, линия 1.8) ---

const ICONS = {
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'
};

function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}

function iconButton(name, label, extraClass) {
  const b = document.createElement('button');
  b.className = 'icon-btn' + (extraClass ? ' ' + extraClass : '');
  b.title = label;
  b.setAttribute('aria-label', label);
  b.appendChild(icon(name));
  return b;
}

// --- всплывающее сообщение ---

let toastTimer = null;
function toast(msg) {
  statusEl.textContent = msg;
  statusEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => statusEl.classList.remove('show'), 2600);
}

// --- данные ---

const MODES = [
  { id: 'dark-mode',  label: 'Тёмный',  full: 'Тёмный режим',  icon: 'moon', rules: CVET.MODE_RULES['dark-mode'] },
  { id: 'light-mode', label: 'Светлый', full: 'Светлый режим', icon: 'sun',  rules: CVET.MODE_RULES['light-mode'] }
];

const PRESETS = [
  { id: 'dark',     label: 'Инверсия',   swatch: '#20242e', rules: { filter: 'invert(1) hue-rotate(180deg)', imgFilter: 'invert(1) hue-rotate(180deg)' } },
  { id: 'sepia',    label: 'Сепия',      swatch: '#c9a86a', rules: { filter: 'sepia(.85) saturate(1.15)' } },
  { id: 'bw',       label: 'Ч/Б',        swatch: 'linear-gradient(90deg,#fff 50%,#222 50%)', rules: { filter: 'grayscale(1) contrast(1.05)' } },
  { id: 'blue',     label: 'Синий',      swatch: '#4f7cff', rules: { filter: 'hue-rotate(180deg) saturate(1.3)' } },
  { id: 'matrix',   label: 'Матрица',    swatch: '#00d95a', rules: { textColor: '#00ff66', bg: '#001100', linkColor: '#7dffb0', font: "'Courier New', monospace", textShadow: '0 0 6px rgba(0,255,102,.55)' } },
  { id: 'reader',   label: 'Читаю',      swatch: '#f5efdd', rules: { bg: '#fbf7ee', textColor: '#33312c', linkColor: '#8a5a2b', extraCss: 'body{max-width:820px !important;margin:0 auto !important;padding:0 16px !important}\np,li,dd,dt,blockquote{font-size:18px !important;line-height:1.75 !important;max-width:78ch}\nh1,h2,h3{line-height:1.3 !important}' } },
  { id: 'comic',    label: 'Comic Sans', swatch: '#ff69b4', rules: { font: "'Comic Sans MS', cursive" } },
  { id: 'warm',     label: 'Тёплая',     swatch: '#ff9d5c', rules: { filter: 'sepia(.35) saturate(1.4) hue-rotate(-12deg) brightness(1.03)' } },
  { id: 'contrast', label: 'Контраст',   swatch: 'linear-gradient(135deg,#fff 50%,#000 50%)', rules: { filter: 'contrast(1.6) saturate(1.25)' } }
];

let savedCache = [];

function cfgLabel(cfg, saved) {
  if (!cfg) return '';
  const n = cfg.name || '';
  if (n === 'random') return 'Случайный стиль';
  if (n === 'tuned') return cfg.base ? cfgLabel(cfg.base, saved) + ' + настройка' : 'Тонкая настройка';
  if (n.indexOf('saved:') === 0) {
    const it = (saved || savedCache).find((x) => 'saved:' + x.id === n);
    return it ? it.name : 'Сохранённый стиль';
  }
  const mode = MODES.find((x) => x.id === n);
  if (mode) return mode.full;
  const known = PRESETS.find((x) => x.id === n);
  return known ? known.label : n;
}

// --- активная вкладка ---

const tabReady = chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  const tab = tabs[0] || null;
  const usable = !!(tab && tab.url && /^(https?|file):/.test(tab.url));
  return { tab, usable, host: usable ? CVET.hostOf(tab.url) : null };
});

// карточка вверху: какой сайт и что на нём сейчас
async function updateCurrent() {
  const { usable, host } = await tabReady;
  const card = $('current');
  card.classList.toggle('disabled', !usable);
  if (!usable) {
    $('curHost').textContent = 'Служебная страница';
    $('curStyle').textContent = 'Здесь стили не работают';
    card.classList.add('off');
    return;
  }
  $('curHost').textContent = host === 'local-file' ? 'Локальный файл' : host;
  let label = cfgLabel(currentCfg);
  if (!currentCfg && settings.autoDayNight) {
    const h = new Date().getHours();
    label = 'Авто: ' + (h >= 19 || h < 7 ? 'тёмный режим' : 'светлый режим');
  }
  card.classList.toggle('off', !currentCfg);
  $('curStyle').textContent = label || 'Без стиля';
  $('curStyle').title = label || '';
  $('curReset').disabled = !currentCfg;
  $('curSave').disabled = !currentCfg;
}

// --- применение ---

async function applyCfg(cfg, label) {
  const { tab, usable } = await tabReady;
  if (!usable) {
    toast('На служебных страницах браузера стили не работают');
    return;
  }
  currentCfg = cfg;
  if (!cfg || cfg.name !== 'tuned') {
    baseCfg = cfg;
    setTuneUI(null);
  }
  CVET.applyToTab(tab, cfg);
  toast(label);
  updateCurrent();
  renderSites();
}

function markActive(id) {
  document.querySelectorAll('[data-id]').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

$('curReset').addEventListener('click', () => {
  applyCfg(null, 'Стиль сброшен');
  markActive(null);
});

$('curSave').addEventListener('click', () => {
  const box = $('savedBox');
  box.open = true;
  saveNameEl.focus();
  saveNameEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

// --- режимы ---

MODES.forEach((m) => {
  const b = document.createElement('button');
  b.dataset.id = m.id;
  b.appendChild(icon(m.icon));
  b.appendChild(document.createTextNode(m.label));
  b.title = m.full;
  b.addEventListener('click', () => {
    applyCfg({ name: m.id, rules: m.rules }, 'Применено: ' + m.full);
    markActive(m.id);
  });
  modesEl.appendChild(b);
});

// --- общие настройки: авто день/ночь, «Не трогать видео», ползунки «Медиа» ---

const mHueEl = $('mHue');
const mSatEl = $('mSat');
const mBrightEl = $('mBright');

function setMediaUI(t) {
  t = CVET.normTune(t);
  mHueEl.value = t.hue;
  mSatEl.value = t.sat;
  mBrightEl.value = t.bright;
  $('mHueVal').textContent = t.hue + '°';
  $('mSatVal').textContent = t.sat + '%';
  $('mBrightVal').textContent = t.bright + '%';
}

// сохраняем и сразу шлём активной вкладке (остальные подхватят через storage)
async function updateSettings(patch) {
  const r = await chrome.storage.local.get('settings');
  const s = Object.assign({}, r.settings, patch);
  delete s.mediaFilter; // старая опция из выпадающего списка
  settings = s;
  await chrome.storage.local.set({ settings: s });
  const { tab, usable } = await tabReady;
  if (usable) CVET.sendToTab(tab, { type: 'settings', settings: s });
  updateCurrent();
}

autoDnEl.addEventListener('change', () => {
  const on = autoDnEl.checked;
  updateSettings({ autoDayNight: on });
  toast(on ? 'Авто день/ночь включено' : 'Авто день/ночь выключено');
});

protectVideoEl.addEventListener('change', () => {
  const on = protectVideoEl.checked;
  updateSettings({ protectVideo: on });
  toast(on ? 'Видео не трогаем: на него действуют только ползунки «Медиа»' : 'Видео снова красится вместе со страницей');
});

let mediaTimer = null;
function mediaTuneFromUI() {
  return { hue: +mHueEl.value, sat: +mSatEl.value, bright: +mBrightEl.value };
}
function onMediaTune() {
  setMediaUI(mediaTuneFromUI());
  clearTimeout(mediaTimer);
  mediaTimer = setTimeout(() => {
    updateSettings({ mediaTune: mediaTuneFromUI() });
    toast('Медиа настроено для всех сайтов');
  }, 150);
}
[mHueEl, mSatEl, mBrightEl].forEach((el) => el.addEventListener('input', onMediaTune));

$('mediaReset').addEventListener('click', () => {
  setMediaUI(null);
  updateSettings({ mediaTune: CVET.normTune(null) });
  toast('Медиа сброшено');
});

// --- пресеты ---

function loadHidden() {
  return chrome.storage.local.get('hiddenPresets').then((r) => r.hiddenPresets || []);
}

function renderPresets(hidden) {
  gridEl.textContent = '';
  const visible = PRESETS.filter((p) => hidden.indexOf(p.id) === -1);
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'grid-empty';
    empty.textContent = 'Все пресеты удалены — остались режимы и случайный стиль';
    gridEl.appendChild(empty);
    return;
  }
  visible.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'preset-item';

    const b = document.createElement('button');
    b.className = 'preset';
    b.dataset.id = p.id;
    b.title = p.label;
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = p.swatch;
    const label = document.createElement('span');
    label.className = 'preset-label';
    label.textContent = p.label;
    b.append(sw, label);
    b.addEventListener('click', () => {
      applyCfg({ name: p.id, rules: p.rules }, 'Применено: ' + p.label);
      markActive(p.id);
    });

    const del = iconButton('x', 'Удалить пресет «' + p.label + '»');
    del.className = 'del';
    del.addEventListener('click', async () => {
      const list = await loadHidden();
      if (list.indexOf(p.id) === -1) list.push(p.id);
      await chrome.storage.local.set({ hiddenPresets: list });
      renderPresets(list);
      markActive(currentCfg && currentCfg.name);
      toast('Пресет удалён: ' + p.label);
    });

    item.append(b, del);
    gridEl.appendChild(item);
  });
}

// --- случайный стиль ---

$('random').addEventListener('click', () => {
  applyCfg(CVET.randomCfg(), 'Случайный стиль применён — жми ещё');
  markActive(null);
});

// --- мои стили: сохранение, импорт, экспорт ---

function loadSaved() {
  return chrome.storage.local.get('saved').then((r) => (savedCache = r.saved || []));
}

function renderSaved(list) {
  savedCache = list;
  $('savedCount').textContent = list.length || '';
  savedListEl.textContent = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = 'Пока пусто. Понравился стиль — дай ему имя и сохрани.';
    savedListEl.appendChild(empty);
    return;
  }
  list.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'list-item';

    const b = document.createElement('button');
    b.className = 'list-main';
    b.dataset.id = 'saved:' + item.id;
    b.title = 'Применить «' + item.name + '»';
    const name = document.createElement('span');
    name.className = 'list-name';
    name.textContent = item.name;
    b.appendChild(name);
    b.addEventListener('click', () => {
      applyCfg({ name: 'saved:' + item.id, rules: item.rules }, 'Применено: ' + item.name);
      markActive('saved:' + item.id);
    });

    const exp = iconButton('copy', 'Скопировать код стиля для друга', 'exp');
    exp.addEventListener('click', async () => {
      const code = CVET.encodeCfg({ name: item.name, rules: item.rules });
      try {
        await navigator.clipboard.writeText(code);
        toast('Код стиля скопирован — отправь другу');
      } catch (e) {
        importCodeEl.value = code;
        importCodeEl.select();
        toast('Буфер недоступен — код в поле импорта, скопируй вручную');
      }
    });

    const del = iconButton('trash', 'Удалить стиль «' + item.name + '»', 'danger del');
    del.addEventListener('click', async () => {
      const next = (await loadSaved()).filter((x) => x.id !== item.id);
      await chrome.storage.local.set({ saved: next });
      renderSaved(next);
      renderSites();
      toast('Удалено: ' + item.name);
    });

    row.append(b, exp, del);
    savedListEl.appendChild(row);
  });
  markActive(currentCfg && currentCfg.name);
}

async function saveCurrent() {
  if (!currentCfg || !currentCfg.rules) {
    toast('Сначала выбери стиль — например, случайный');
    return;
  }
  const list = await loadSaved();
  const name = saveNameEl.value.trim() || 'Стиль ' + (list.length + 1);
  list.push({ id: Date.now().toString(36), name, rules: currentCfg.rules });
  await chrome.storage.local.set({ saved: list });
  saveNameEl.value = '';
  renderSaved(list);
  toast('Сохранено: ' + name);
}

async function importCode() {
  const cfg = CVET.decodeCfg(importCodeEl.value);
  if (!cfg) {
    toast('Не похоже на код стиля — он начинается с CVET1.');
    importCodeEl.focus();
    return;
  }
  const list = await loadSaved();
  let name = (typeof cfg.name === 'string' && cfg.name.indexOf('saved:') !== 0 && cfg.name !== 'random' && cfg.name !== 'tuned')
    ? cfg.name
    : '';
  if (!name) name = 'Импорт ' + (list.length + 1);
  list.push({ id: Date.now().toString(36), name, rules: cfg.rules });
  await chrome.storage.local.set({ saved: list });
  importCodeEl.value = '';
  renderSaved(list);
  toast('Импортировано: ' + name);
}

$('saveBtn').addEventListener('click', saveCurrent);
$('importBtn').addEventListener('click', importCode);
saveNameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCurrent(); });
importCodeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') importCode(); });

// --- тонкая настройка: работает поверх текущего стиля ---

const hueEl = $('hue');
const satEl = $('sat');
const brightEl = $('bright');
const fsEl = $('fs');
let tuneTimer = null;

const DEFAULT_TUNE = { hue: 0, sat: 100, bright: 100, fs: 100 };

function setTuneUI(t) {
  t = Object.assign({}, DEFAULT_TUNE, t);
  hueEl.value = t.hue;
  satEl.value = t.sat;
  brightEl.value = t.bright;
  fsEl.value = t.fs;
  $('hueVal').textContent = t.hue + '°';
  $('satVal').textContent = t.sat + '%';
  $('brightVal').textContent = t.bright + '%';
  $('fsVal').textContent = t.fs + '%';
}

function tuneFromUI() {
  return { hue: +hueEl.value, sat: +satEl.value, bright: +brightEl.value, fs: +fsEl.value };
}

// null — все ползунки на месте, настраивать нечего
function tunedCfg(base, t) {
  const f = CVET.tuneFilter(t);
  if (!f && t.fs === 100) return null;
  const rules = Object.assign({}, base && base.rules);
  delete rules.htmlFontSize;
  delete rules.fontScale;
  const filter = [rules.filter, f].filter(Boolean).join(' ');
  if (filter) rules.filter = filter;
  if (t.fs !== 100) rules.fontScale = t.fs;
  return { name: 'tuned', base: base || null, tune: t, rules };
}

function applyTune() {
  const cfg = tunedCfg(baseCfg, tuneFromUI());
  if (cfg) {
    applyCfg(cfg, 'Тонкая настройка применена');
    markActive(null);
  } else {
    // ползунки вернули на место — возвращаем исходный стиль
    applyCfg(baseCfg, baseCfg ? 'Ползунки сброшены' : 'Стиль сброшен');
    markActive(baseCfg ? baseCfg.name : null);
  }
}

function onTune() {
  setTuneUI(tuneFromUI());
  clearTimeout(tuneTimer);
  tuneTimer = setTimeout(applyTune, 150);
}

[hueEl, satEl, brightEl, fsEl].forEach((el) => el.addEventListener('input', onTune));

$('tuneReset').addEventListener('click', () => {
  setTuneUI(null);
  applyTune();
});

// двойной клик по ползунку — вернуть его на место
document.querySelectorAll('input[type="range"][data-default]').forEach((el) => {
  el.title = 'Двойной клик — сбросить';
  el.addEventListener('dblclick', () => {
    el.value = el.dataset.default;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

// --- правила по сайтам ---

async function renderSites() {
  const all = await chrome.storage.local.get(null);
  const { host: here } = await tabReady;
  const entries = Object.keys(all)
    .filter((k) => k.indexOf('host:') === 0)
    .sort()
    .map((k) => ({ host: k.slice(5), cfg: all[k] }));
  $('sitesCount').textContent = entries.length || '';
  sitesListEl.textContent = '';
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = 'Пока пусто. Выбранный стиль запоминается для сайта.';
    sitesListEl.appendChild(empty);
    return;
  }
  entries.forEach(({ host, cfg }) => {
    const row = document.createElement('div');
    row.className = 'list-item site-item' + (host === here ? ' here' : '');

    const main = document.createElement('div');
    main.className = 'list-main';
    const h = document.createElement('span');
    h.className = 'list-name';
    h.textContent = host === 'local-file' ? 'Локальные файлы' : host;
    h.title = host;
    const s = document.createElement('span');
    s.className = 'list-meta';
    s.textContent = cfgLabel(cfg, all.saved || []);
    main.append(h, s);

    const del = iconButton('x', 'Убрать правило для ' + host, 'danger del');
    del.addEventListener('click', async () => {
      await chrome.storage.local.remove('host:' + host);
      if (host === here) {
        // правило текущего сайта — снимаем стиль и со страницы
        applyCfg(null, 'Правило убрано: ' + host);
        markActive(null);
      } else {
        renderSites();
        toast('Правило убрано: ' + host);
      }
    });

    row.append(main, del);
    sitesListEl.appendChild(row);
  });
}

// --- раскрытые блоки запоминаем (только удобство: без хранилища всё работает) ---

document.querySelectorAll('details.panel').forEach((d) => {
  try {
    if (localStorage.getItem('open:' + d.id) === '1') d.open = true;
  } catch (e) { /* ignore */ }
  d.addEventListener('toggle', () => {
    try { localStorage.setItem('open:' + d.id, d.open ? '1' : '0'); } catch (e) { /* ignore */ }
  });
});

// --- инициализация ---

(async () => {
  const r = await chrome.storage.local.get(['settings', 'saved', 'hiddenPresets']).catch(() => ({}));
  settings = r.settings || {};
  autoDnEl.checked = !!settings.autoDayNight;
  protectVideoEl.checked = !!settings.protectVideo;
  setMediaUI(settings.mediaTune);
  renderPresets(r.hiddenPresets || []);
  renderSaved(r.saved || []);

  const { host } = await tabReady;
  if (host) {
    const res = await chrome.storage.local.get('host:' + host).catch(() => null);
    const cfg = res && res['host:' + host];
    if (cfg) {
      currentCfg = cfg;
      if (cfg.name === 'tuned') {
        baseCfg = cfg.base || null;
        setTuneUI(cfg.tune);
      } else {
        baseCfg = cfg;
      }
      markActive(cfg.name === 'tuned' ? null : cfg.name);
    }
  }
  updateCurrent();
  renderSites();
})();
