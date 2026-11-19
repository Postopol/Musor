const statusEl = document.getElementById('status');
const gridEl = document.getElementById('presets');
const modesEl = document.getElementById('modes');
const savedEl = document.getElementById('saved');
const savedListEl = document.getElementById('savedList');
const saveNameEl = document.getElementById('saveName');

let currentCfg = null;

const MODES = [
  { id: 'dark-mode',  label: 'Тёмный режим',  rules: { colorScheme: 'dark',  bg: '#1b1d22', textColor: '#e4e6eb', linkColor: '#8ab4f8', borderColor: '#3a3d46' } },
  { id: 'light-mode', label: 'Светлый режим', rules: { colorScheme: 'light', bg: '#ffffff', textColor: '#1a1c20', linkColor: '#0b57d0', borderColor: '#d5d7de' } }
];

const PRESETS = [
  { id: 'reset',    label: 'Сброс',     swatch: 'linear-gradient(135deg,#555,#999)', rules: null },
  { id: 'dark',     label: 'Инверсия',  swatch: '#20242e', rules: { filter: 'invert(1) hue-rotate(180deg)', imgFilter: 'invert(1) hue-rotate(180deg)' } },
  { id: 'sepia',    label: 'Сепия',     swatch: '#c9a86a', rules: { filter: 'sepia(.85) saturate(1.15)' } },
  { id: 'bw',       label: 'Ч/Б',       swatch: '#ffffff', rules: { filter: 'grayscale(1) contrast(1.05)' } },
  { id: 'blue',     label: 'Синий',     swatch: '#4f7cff', rules: { filter: 'hue-rotate(180deg) saturate(1.3)' } },
  { id: 'matrix',   label: 'Матрица',   swatch: '#00ff66', rules: { textColor: '#00ff66', bg: '#001100', linkColor: '#7dffb0', font: "'Courier New', monospace", textShadow: '0 0 6px rgba(0,255,102,.55)' } },
  { id: 'warm',     label: 'Тёплая',    swatch: '#ff9d5c', rules: { filter: 'sepia(.35) saturate(1.4) hue-rotate(-12deg) brightness(1.03)' } },
  { id: 'contrast', label: 'Контраст',  swatch: '#e8e8ec', rules: { filter: 'contrast(1.6) saturate(1.25)' } }
];

const FONTS = [
  "'Comic Sans MS', cursive",
  'Georgia, serif',
  "'Courier New', monospace",
  'Impact, sans-serif',
  'Verdana, sans-serif',
  "'Times New Roman', serif",
  "'Trebuchet MS', sans-serif",
  'system-ui, sans-serif'
];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;

function randomCfg() {
  const f = [
    'hue-rotate(' + Math.floor(rnd(0, 360)) + 'deg)',
    'saturate(' + rnd(0.25, 2.8).toFixed(2) + ')',
    'contrast(' + rnd(0.85, 1.5).toFixed(2) + ')',
    'brightness(' + rnd(0.8, 1.25).toFixed(2) + ')'
  ];
  if (chance(0.25)) f.push('grayscale(1)');
  const invert = chance(0.3);
  if (invert) f.push('invert(1)');

  const rules = { filter: f.join(' ') };
  if (invert) rules.imgFilter = 'invert(1)';
  if (chance(0.7)) rules.font = pick(FONTS);
  if (chance(0.55)) rules.letterSpacing = rnd(-1, 3).toFixed(1) + 'px';
  if (chance(0.4)) rules.wordSpacing = rnd(0, 6).toFixed(1) + 'px';
  if (chance(0.35)) {
    const h = Math.floor(rnd(0, 360));
    rules.textColor = 'hsl(' + h + ', 85%, ' + Math.floor(rnd(35, 75)) + '%)';
    rules.bg = 'hsl(' + ((h + 180) % 360) + ', ' + Math.floor(rnd(40, 90)) + '%, ' + Math.floor(rnd(4, 22)) + '%)';
    rules.linkColor = 'hsl(' + ((h + 60) % 360) + ', 95%, 65%)';
  }
  if (chance(0.25)) rules.textShadow = pick(['0 0 6px currentColor', '2px 2px 0 rgba(0,0,0,.55)', '-1px -1px 0 rgba(255,255,255,.5)']);
  if (chance(0.25)) rules.textTransform = 'uppercase';
  if (chance(0.3)) rules.borderRadius = Math.floor(rnd(2, 16)) + 'px';
  return { name: 'random', rules };
}

function hostOf(url) {
  try { return new URL(url).hostname || 'local-file'; } catch (e) { return null; }
}

function send(tabId, cfg) {
  chrome.tabs.sendMessage(tabId, { type: 'apply', cfg }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      // страница открыта до установки расширения — внедряем скрипт и повторяем
      chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
        void chrome.runtime.lastError;
        chrome.tabs.sendMessage(tabId, { type: 'apply', cfg }, () => void chrome.runtime.lastError);
      });
    }
  });
}

function applyCfg(cfg, label) {
  currentCfg = cfg;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !/^(https?|file):/.test(tab.url)) {
      statusEl.textContent = 'Не работает на служебных страницах браузера';
      return;
    }
    const key = 'host:' + hostOf(tab.url);
    if (cfg) chrome.storage.local.set({ [key]: cfg });
    else chrome.storage.local.remove(key);
    send(tab.id, cfg);
    statusEl.textContent = label;
  });
}

function markActive(id) {
  document.querySelectorAll('button[data-id]').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

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

PRESETS.forEach((p) => {
  const b = document.createElement('button');
  b.dataset.id = p.id;
  b.innerHTML = '<span class="sw" style="background:' + p.swatch + '"></span>' + p.label;
  b.addEventListener('click', () => {
    applyCfg(p.rules ? { name: p.id, rules: p.rules } : null, p.rules ? 'Применено: ' + p.label : 'Сброшено');
    markActive(p.id);
  });
  gridEl.appendChild(b);
});

document.getElementById('random').addEventListener('click', () => {
  applyCfg(randomCfg(), 'Рандом применён — жми ещё!');
  markActive(null);
});

// --- сохранённые стили ---

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

    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Удалить';
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      const next = (await loadSaved()).filter((x) => x.id !== item.id);
      await chrome.storage.local.set({ saved: next });
      renderSaved(next);
      statusEl.textContent = 'Удалено: ' + item.name;
    });

    row.appendChild(b);
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

// показываем текущее состояние сайта и сохранённые стили
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const host = tab && tab.url ? hostOf(tab.url) : null;

  loadSaved().then(renderSaved);

  if (!host) return;
  chrome.storage.local.get('host:' + host).then((res) => {
    const cfg = res && res['host:' + host];
    if (!cfg) return;
    currentCfg = cfg;
    if (cfg.name === 'random') {
      statusEl.textContent = 'Сейчас: рандом';
    } else if (cfg.name.indexOf('saved:') === 0) {
      loadSaved().then((list) => {
        const item = list.find((x) => 'saved:' + x.id === cfg.name);
        statusEl.textContent = 'Сейчас: ' + (item ? item.name : 'сохранённый стиль');
      });
    } else {
      const known = MODES.find((x) => x.id === cfg.name) || PRESETS.find((x) => x.id === cfg.name);
      statusEl.textContent = 'Сейчас: ' + (known ? known.label : cfg.name);
    }
    markActive(cfg.name);
  });
});
