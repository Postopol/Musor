const statusEl = document.getElementById('status');
const gridEl = document.getElementById('presets');
const modesEl = document.getElementById('modes');
const savedEl = document.getElementById('saved');
const savedListEl = document.getElementById('savedList');
const saveNameEl = document.getElementById('saveName');
const importCodeEl = document.getElementById('importCode');
const sitesListEl = document.getElementById('sitesList');
const autoDnEl = document.getElementById('autoDN');
const mediaFilterEl = document.getElementById('mediaFilter');

let currentCfg = null;

document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version;

const MODES = [
  { id: 'dark-mode',  label: 'Тёмный режим',  rules: CVET.MODE_RULES['dark-mode'] },
  { id: 'light-mode', label: 'Светлый режим', rules: CVET.MODE_RULES['light-mode'] }
];

const PRESETS = [
  { id: 'reset',    label: 'Сброс',      swatch: 'linear-gradient(135deg,#555,#999)', rules: null },
  { id: 'dark',     label: 'Инверсия',   swatch: '#20242e', rules: { filter: 'invert(1) hue-rotate(180deg)', imgFilter: 'invert(1) hue-rotate(180deg)' } },
  { id: 'sepia',    label: 'Сепия',      swatch: '#c9a86a', rules: { filter: 'sepia(.85) saturate(1.15)' } },
  { id: 'bw',       label: 'Ч/Б',        swatch: '#ffffff', rules: { filter: 'grayscale(1) contrast(1.05)' } },
  { id: 'blue',     label: 'Синий',      swatch: '#4f7cff', rules: { filter: 'hue-rotate(180deg) saturate(1.3)' } },
  { id: 'matrix',   label: 'Матрица',    swatch: '#00ff66', rules: { textColor: '#00ff66', bg: '#001100', linkColor: '#7dffb0', font: "'Courier New', monospace", textShadow: '0 0 6px rgba(0,255,102,.55)' } },
  { id: 'reader',   label: 'Читаю',      swatch: '#f5efdd', rules: { bg: '#fbf7ee', textColor: '#33312c', linkColor: '#8a5a2b', extraCss: 'body{max-width:820px !important;margin:0 auto !important;padding:0 16px !important}\np,li,dd,dt,blockquote{font-size:18px !important;line-height:1.75 !important;max-width:78ch}\nh1,h2,h3{line-height:1.3 !important}' } },
  { id: 'comic',    label: 'Comic Sans', swatch: '#ff69b4', rules: { font: "'Comic Sans MS', cursive" } },
  { id: 'warm',     label: 'Тёплая',     swatch: '#ff9d5c', rules: { filter: 'sepia(.35) saturate(1.4) hue-rotate(-12deg) brightness(1.03)' } },
  { id: 'contrast', label: 'Контраст',   swatch: '#e8e8ec', rules: { filter: 'contrast(1.6) saturate(1.25)' } }
];

// --- применение ---

function applyCfg(cfg, label) {
  currentCfg = cfg;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !/^(https?|file):/.test(tab.url)) {
      statusEl.textContent = 'Не работает на служебных страницах браузера';
      return;
    }
    CVET.applyToTab(tab, cfg);
    statusEl.textContent = label;
    renderSites();
  });
}

function markActive(id) {
  document.querySelectorAll('button[data-id]').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

// --- режимы ---

MODES.forEach((m) => {
  const b = document.createElement('button');
  b.dataset.id = m.id;
  b.textContent = m.label;
  b.addEventListener('click', () => {
    applyCfg({ name: m.id, rules: m.rules }, 'Применено: ' + m.label);
    markActive(m.id);
  });
  modesEl.appendChild(b);
});

// --- авто день/ночь и фильтр медиа ---

chrome.storage.local.get('settings').then((r) => {
  const s = r.settings || {};
  autoDnEl.checked = !!s.autoDayNight;
  mediaFilterEl.value = s.mediaFilter || 'auto';
}).catch(() => {});

function saveSetting(patch) {
  return chrome.storage.local.get('settings').then((r) => {
    const s = Object.assign({}, r.settings, patch);
    return chrome.storage.local.set({ settings: s });
  });
}

autoDnEl.addEventListener('change', () => {
  const on = autoDnEl.checked;
  saveSetting({ autoDayNight: on });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url && /^(https?|file):/.test(tab.url)) {
      CVET.sendToTab(tab, { type: 'setAuto', enabled: on });
    }
  });
  statusEl.textContent = on ? 'Авто день/ночь: вкл (тёмный после 19:00)' : 'Авто день/ночь: выкл';
});

const MEDIA_LABELS = { auto: 'как в стиле', invert: 'инверсия', sepia: 'сепия', grayscale: 'ч/б', hue: 'психоделика' };

mediaFilterEl.addEventListener('change', () => {
  const v = mediaFilterEl.value;
  saveSetting({ mediaFilter: v });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url && /^(https?|file):/.test(tab.url)) {
      CVET.sendToTab(tab, { type: 'setMedia', value: v });
    }
  });
  statusEl.textContent = 'Медиа: ' + (MEDIA_LABELS[v] || v);
});

// --- пресеты с удалением и восстановлением ---

function loadHidden() {
  return chrome.storage.local.get('hiddenPresets').then((r) => r.hiddenPresets || []);
}

function renderPresets(hidden) {
  gridEl.textContent = '';
  PRESETS.forEach((p) => {
    if (hidden.indexOf(p.id) !== -1) return;
    const row = document.createElement('div');
    row.className = 'preset-item';

    const b = document.createElement('button');
    b.dataset.id = p.id;
    b.innerHTML = '<span class="sw" style="background:' + p.swatch + '"></span>' + p.label;
    b.addEventListener('click', () => {
      applyCfg(p.rules ? { name: p.id, rules: p.rules } : null, p.rules ? 'Применено: ' + p.label : 'Сброшено');
      markActive(p.id);
    });
    row.appendChild(b);

    if (p.id !== 'reset') {
      const del = document.createElement('button');
      del.className = 'del';
      del.title = 'Удалить пресет';
      del.textContent = '✕';
      del.addEventListener('click', async () => {
        const list = await loadHidden();
        if (list.indexOf(p.id) === -1) list.push(p.id);
        await chrome.storage.local.set({ hiddenPresets: list });
        renderPresets(list);
        statusEl.textContent = 'Пресет удалён: ' + p.label;
      });
      row.appendChild(del);
    } else {
      const ph = document.createElement('span');
      ph.className = 'del-ph';
      row.appendChild(ph);
    }
    gridEl.appendChild(row);
  });
}

// --- рандом ---

document.getElementById('random').addEventListener('click', () => {
  applyCfg(CVET.randomCfg(), 'Рандом применён — жми ещё!');
  markActive(null);
});

// --- сохранение / импорт / экспорт ---

function loadSaved() {
  return chrome.storage.local.get('saved').then((r) => r.saved || []);
}

function renderSaved(list) {
  savedEl.classList.toggle('hidden', !list.length);
  savedListEl.textContent = '';
  list.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'saved-item';

    const b = document.createElement('button');
    b.dataset.id = 'saved:' + item.id;
    b.textContent = item.name;
    b.addEventListener('click', () => {
      applyCfg({ name: 'saved:' + item.id, rules: item.rules }, 'Применено: ' + item.name);
      markActive('saved:' + item.id);
    });

    const exp = document.createElement('button');
    exp.className = 'exp';
    exp.title = 'Скопировать код стиля';
    exp.textContent = '⇪';
    exp.addEventListener('click', async () => {
      const code = CVET.encodeCfg({ name: item.name, rules: item.rules });
      try {
        await navigator.clipboard.writeText(code);
        statusEl.textContent = 'Код стиля скопирован — кинь другу';
      } catch (e) {
        importCodeEl.value = code;
        importCodeEl.select();
        statusEl.textContent = 'Не вышло в буфер — код в поле, скопируй вручную (Ctrl+C)';
      }
    });

    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Удалить стиль';
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      const next = (await loadSaved()).filter((x) => x.id !== item.id);
      await chrome.storage.local.set({ saved: next });
      renderSaved(next);
      statusEl.textContent = 'Удалено: ' + item.name;
    });

    row.appendChild(b);
    row.appendChild(exp);
    row.appendChild(del);
    savedListEl.appendChild(row);
  });
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  if (!currentCfg || !currentCfg.rules) {
    statusEl.textContent = 'Сначала примени стиль — например, рандом';
    return;
  }
  const list = await loadSaved();
  const name = saveNameEl.value.trim() || 'Стиль ' + (list.length + 1);
  list.push({ id: Date.now().toString(36), name, rules: currentCfg.rules });
  await chrome.storage.local.set({ saved: list });
  saveNameEl.value = '';
  renderSaved(list);
  statusEl.textContent = 'Сохранено: ' + name;
});

document.getElementById('importBtn').addEventListener('click', async () => {
  const cfg = CVET.decodeCfg(importCodeEl.value);
  if (!cfg) {
    statusEl.textContent = 'Неверный код стиля';
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
  statusEl.textContent = 'Импортировано: ' + name;
});

// --- тонкая настройка ---

const hueEl = document.getElementById('hue');
const satEl = document.getElementById('sat');
const brightEl = document.getElementById('bright');
const fsEl = document.getElementById('fs');
let tuneTimer = null;

function tunedRules() {
  const rules = {
    filter: 'hue-rotate(' + hueEl.value + 'deg) saturate(' + (satEl.value / 100) + ') brightness(' + (brightEl.value / 100) + ')'
  };
  if (+fsEl.value !== 100) rules.htmlFontSize = fsEl.value + '%';
  return rules;
}

function onTune() {
  document.getElementById('hueVal').textContent = hueEl.value + '°';
  document.getElementById('satVal').textContent = satEl.value + '%';
  document.getElementById('brightVal').textContent = brightEl.value + '%';
  document.getElementById('fsVal').textContent = fsEl.value + '%';
  clearTimeout(tuneTimer);
  tuneTimer = setTimeout(() => {
    applyCfg({ name: 'tuned', rules: tunedRules() }, 'Тонкая настройка применена — можно сохранить ниже');
    markActive(null);
  }, 150);
}

[hueEl, satEl, brightEl, fsEl].forEach((el) => el.addEventListener('input', onTune));

// --- правила по сайтам ---

function cfgLabel(cfg, saved) {
  if (!cfg) return '';
  const n = cfg.name || '';
  if (n === 'random') return 'рандом';
  if (n === 'tuned') return 'настройка';
  if (n.indexOf('saved:') === 0) {
    const it = saved.find((x) => 'saved:' + x.id === n);
    return it ? it.name : 'сохранённый';
  }
  const known = MODES.find((x) => x.id === n) || PRESETS.find((x) => x.id === n);
  return known ? known.label : n;
}

async function renderSites() {
  const all = await chrome.storage.local.get(null);
  const saved = await loadSaved();
  const entries = Object.keys(all)
    .filter((k) => k.indexOf('host:') === 0)
    .sort()
    .map((k) => ({ host: k.slice(5), cfg: all[k] }));
  document.getElementById('sitesCount').textContent = '(' + entries.length + ')';
  sitesListEl.textContent = '';
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'site-empty';
    empty.textContent = 'Пока пусто — выбери стиль, и он запомнится для сайта';
    sitesListEl.appendChild(empty);
    return;
  }
  entries.forEach(({ host, cfg }) => {
    const row = document.createElement('div');
    row.className = 'site-item';

    const h = document.createElement('span');
    h.className = 'site-host';
    h.textContent = host;
    h.title = host;

    const s = document.createElement('span');
    s.className = 'site-style';
    s.textContent = cfgLabel(cfg, saved);

    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Убрать правило для сайта';
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      await chrome.storage.local.remove('host:' + host);
      renderSites();
      statusEl.textContent = 'Правило убрано: ' + host;
    });

    row.appendChild(h);
    row.appendChild(s);
    row.appendChild(del);
    sitesListEl.appendChild(row);
  });
}

// --- инициализация ---

(async () => {
  loadSaved().then(renderSaved);
  loadHidden().then(renderPresets);
  renderSites();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab && tab.url ? CVET.hostOf(tab.url) : null;
  if (!host) return;

  const res = await chrome.storage.local.get('host:' + host).catch(() => null);
  const cfg = res && res['host:' + host];
  if (!cfg) {
    const s = await chrome.storage.local.get('settings').catch(() => null);
    if (s && s.settings && s.settings.autoDayNight) {
      const h = new Date().getHours();
      statusEl.textContent = 'Авто: ' + (h >= 19 || h < 7 ? 'тёмный режим' : 'светлый режим');
    }
    return;
  }
  currentCfg = cfg;
  const saved = await loadSaved();
  statusEl.textContent = 'Сейчас: ' + cfgLabel(cfg, saved);
  markActive(cfg.name);
})();
