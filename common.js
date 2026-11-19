// Общий модуль: используется в popup, content script и service worker.
// Заворачиваем в var-IIFE, чтобы повторная инъекция не падала на const.
var CVET = (function () {
  const MODE_RULES = {
    'dark-mode':  { colorScheme: 'dark',  bg: '#1b1d22', textColor: '#e4e6eb', linkColor: '#8ab4f8', borderColor: '#3a3d46' },
    'light-mode': { colorScheme: 'light', bg: '#ffffff', textColor: '#1a1c20', linkColor: '#0b57d0', borderColor: '#d5d7de' }
  };

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

  function randomRules() {
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
    return rules;
  }

  function randomCfg() {
    return { name: 'random', rules: randomRules() };
  }

  // ползунки цвета (тонкая настройка и «Медиа»): оттенок в градусах, насыщенность и яркость в %
  const DEFAULT_MEDIA_TUNE = { hue: 0, sat: 100, bright: 100 };

  function normTune(t) {
    t = t || {};
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    return { hue: num(t.hue, 0), sat: num(t.sat, 100), bright: num(t.bright, 100) };
  }

  // только изменённые части: нулевой фильтр не вешаем вовсе
  function tuneFilter(t) {
    t = normTune(t);
    const f = [];
    if (t.hue % 360 !== 0) f.push('hue-rotate(' + t.hue + 'deg)');
    if (t.sat !== 100) f.push('saturate(' + t.sat / 100 + ')');
    if (t.bright !== 100) f.push('brightness(' + t.bright / 100 + ')');
    return f.join(' ');
  }

  function hostOf(url) {
    try { return new URL(url).hostname || 'local-file'; } catch (e) { return null; }
  }

  function encodeCfg(cfg) {
    const bytes = new TextEncoder().encode(JSON.stringify(cfg));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'CVET1.' + btoa(bin);
  }

  function decodeCfg(str) {
    if (typeof str !== 'string') return null;
    str = str.trim();
    if (str.indexOf('CVET1.') !== 0) return null;
    try {
      const bin = atob(str.slice(6));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const cfg = JSON.parse(new TextDecoder().decode(bytes));
      if (cfg && cfg.rules && typeof cfg.rules === 'object') return cfg;
    } catch (e) { /* ignore */ }
    return null;
  }

  function sendToTab(tab, msg) {
    chrome.tabs.sendMessage(tab.id, msg, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        // страница открыта до установки расширения — внедряем скрипты и повторяем
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['common.js', 'content.js'] }, () => {
          void chrome.runtime.lastError;
          chrome.tabs.sendMessage(tab.id, msg, () => void chrome.runtime.lastError);
        });
      }
    });
  }

  function applyToTab(tab, cfg) {
    const host = hostOf(tab.url);
    if (host) {
      const key = 'host:' + host;
      if (cfg) chrome.storage.local.set({ [key]: cfg });
      else chrome.storage.local.remove(key);
    }
    sendToTab(tab, { type: 'apply', cfg });
  }

  return { MODE_RULES, DEFAULT_MEDIA_TUNE, normTune, tuneFilter, randomCfg, hostOf, encodeCfg, decodeCfg, sendToTab, applyToTab };
})();
