(() => {
  // в iframe не работаем — иначе фильтры накладываются дважды
  if (window.self !== window.top) return;
  if (window.__rashirCvetLoaded) return;
  window.__rashirCvetLoaded = true;

  const STYLE_ID = 'rashir-cvet-style';
  let sheet = null;
  let hostCfg = null;
  let autoEnabled = false;
  let explicitReset = false;
  let carnivalTimer = null;

  function getSheet() {
    if (sheet) return sheet;
    try {
      sheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return sheet;
    } catch (e) {
      let el = document.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }
      sheet = { replaceSync: (css) => { el.textContent = css; } };
      return sheet;
    }
  }

  function buildCss(cfg) {
    if (!cfg || !cfg.rules) return '';
    const r = cfg.rules;
    let css = '';
    if (r.colorScheme) css += 'html{color-scheme:' + r.colorScheme + ' !important}\n';
    if (r.filter) css += 'html{filter:' + r.filter + ' !important}\n';
    if (r.imgFilter) css += 'img,video,picture,canvas,svg,iframe{filter:' + r.imgFilter + ' !important}\n';
    if (r.htmlFontSize) css += 'html{font-size:' + r.htmlFontSize + ' !important}\n';

    const fd = [];
    if (r.font) fd.push('font-family:' + r.font + ' !important');
    if (r.letterSpacing) fd.push('letter-spacing:' + r.letterSpacing + ' !important');
    if (r.wordSpacing) fd.push('word-spacing:' + r.wordSpacing + ' !important');
    if (fd.length) css += '*{' + fd.join(';') + '}\n';

    const cd = [];
    if (r.textColor) cd.push('color:' + r.textColor + ' !important');
    if (r.bg) cd.push('background-color:' + r.bg + ' !important');
    if (cd.length) css += '*{' + cd.join(';') + '}\n';

    if (r.linkColor) css += 'a,a *{color:' + r.linkColor + ' !important}\n';
    if (r.borderColor) css += '*{border-color:' + r.borderColor + ' !important}\n';
    if (r.textShadow) css += '*{text-shadow:' + r.textShadow + ' !important}\n';
    if (r.textTransform) css += '*{text-transform:' + r.textTransform + ' !important}\n';
    if (r.borderRadius) css += '*{border-radius:' + r.borderRadius + ' !important}\n';
    if (r.extraCss) css += r.extraCss + '\n';
    return css;
  }

  function applyCfg(cfg) {
    try {
      getSheet().replaceSync(buildCss(cfg));
    } catch (e) { /* ignore */ }
  }

  // --- авто день/ночь ---

  function autoCfg() {
    const h = new Date().getHours();
    const night = h >= 19 || h < 7;
    return night
      ? { name: 'dark-mode', rules: CVET.MODE_RULES['dark-mode'] }
      : { name: 'light-mode', rules: CVET.MODE_RULES['light-mode'] };
  }

  function refreshAuto() {
    if (!autoEnabled || hostCfg || explicitReset) return;
    applyCfg(autoCfg());
  }

  // --- карнавал ---

  function startCarnival() {
    applyCfg(CVET.randomCfg());
    if (!carnivalTimer) {
      carnivalTimer = setInterval(() => applyCfg(CVET.randomCfg()), 5000);
    }
  }

  function stopCarnival() {
    if (carnivalTimer) {
      clearInterval(carnivalTimer);
      carnivalTimer = null;
    }
  }

  // --- сообщения от попапа и хоткеев ---

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'apply') {
      hostCfg = msg.cfg || null;
      if (hostCfg && hostCfg.name === 'carnival') {
        explicitReset = false;
        startCarnival();
      } else {
        stopCarnival();
        explicitReset = !hostCfg;
        applyCfg(hostCfg);
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'setAuto') {
      autoEnabled = !!msg.enabled;
      if (autoEnabled) {
        explicitReset = false;
        refreshAuto();
      } else if (!hostCfg) {
        applyCfg(null);
      }
      sendResponse({ ok: true });
    }
  });

  // --- восстановление при загрузке страницы ---

  const host = location.hostname || 'local-file';
  Promise.all([
    chrome.storage.local.get('host:' + host),
    chrome.storage.local.get('settings')
  ]).then(([hostRes, setRes]) => {
    hostCfg = hostRes['host:' + host] || null;
    autoEnabled = !!(setRes.settings && setRes.settings.autoDayNight);
    if (hostCfg) {
      if (hostCfg.name === 'carnival') startCarnival();
      else applyCfg(hostCfg);
    } else if (autoEnabled) {
      applyCfg(autoCfg());
    }
  }).catch(() => {});

  // раз в минуту перепроверяем авто день/ночь
  setInterval(refreshAuto, 60000);
})();
