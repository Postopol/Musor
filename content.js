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
  let mediaFilter = 'auto';
  let mediaObserver = null;
  let mediaScanTimer = null;

  // Защита медиа-зон от заливки. ДВА отдельных правила:
  // первое — без :has(), работает на любом Chromium (атрибут ставит JS ниже);
  // второе — дополнительный слой для современных движков.
  // Нельзя объединять в одно: при неподдержке :has() умрёт всё правило целиком.
  const MEDIA_EXEMPT =
    '[data-cvet-media],[data-cvet-media] *,' +
    'img,video,picture,canvas,svg,iframe,embed,object' +
    '{background-color:transparent !important}\n' +
    '*:has(video),*:has(video) *,' +
    '*:has(iframe),*:has(iframe) *,' +
    '*:has(canvas),*:has(canvas) *' +
    '{background-color:transparent !important}\n';

  const MEDIA_EL = 'img,video,picture,canvas,svg,iframe';
  const MEDIA_FILTERS = {
    invert: 'invert(1)',
    sepia: 'sepia(.8)',
    grayscale: 'grayscale(1)',
    hue: 'hue-rotate(90deg) saturate(1.8)'
  };

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

    // фильтр для медиа: либо отдельный (опция), либо контр-фильтр из стиля
    const mf = MEDIA_FILTERS[mediaFilter];
    if (mf) css += MEDIA_EL + '{filter:' + mf + ' !important}\n';
    else if (r.imgFilter) css += 'img,video,picture,canvas,svg,iframe{filter:' + r.imgFilter + ' !important}\n';

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
    // защита медиа-зон — только когда стиль заливает фон
    if (r.bg) css += MEDIA_EXEMPT;
    return css;
  }

  // --- маркировка плееров: JS-слой защиты, не зависит от поддержки :has() ---

  function markMediaRoots() {
    if (!document.body) return;
    document.querySelectorAll('video, canvas, object, embed, iframe').forEach((el) => {
      if (el.closest('[data-cvet-media]')) return;
      // поднимаемся от видео вверх, пока контейнер похож на плеер
      // (класс/id содержит player, video, media и т.п.) — так захватываем оверлеи
      let node = el.parentElement;
      let last = node;
      let levels = 0;
      while (node && node !== document.body && levels < 8) {
        last = node;
        const cls = (typeof node.className === 'string' ? node.className : '') + ' ' + (node.id || '');
        if (!/(player|video|media|embed|stream|carousel|shorts|reel)/i.test(cls)) break;
        node = node.parentElement;
        levels++;
      }
      if (last) last.setAttribute('data-cvet-media', '');
    });
  }

  function scheduleMediaScan() {
    clearTimeout(mediaScanTimer);
    mediaScanTimer = setTimeout(markMediaRoots, 300);
  }

  function ensureMediaWatch(on) {
    if (on && !mediaObserver) {
      mediaObserver = new MutationObserver(scheduleMediaScan);
      mediaObserver.observe(document.documentElement, { childList: true, subtree: true });
      markMediaRoots();
    } else if (!on && mediaObserver) {
      mediaObserver.disconnect();
      mediaObserver = null;
    }
  }

  function applyCfg(cfg) {
    try {
      getSheet().replaceSync(buildCss(cfg));
    } catch (e) { /* ignore */ }
    ensureMediaWatch(!!(cfg && cfg.rules && cfg.rules.bg));
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

  // --- сообщения от попапа и хоткеев ---

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'apply') {
      hostCfg = msg.cfg || null;
      explicitReset = !hostCfg;
      applyCfg(hostCfg);
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
    } else if (msg.type === 'setMedia') {
      mediaFilter = typeof msg.value === 'string' && MEDIA_FILTERS[msg.value] ? msg.value : 'auto';
      if (hostCfg) applyCfg(hostCfg);
      else if (autoEnabled) applyCfg(autoCfg());
      else applyCfg(null);
      sendResponse({ ok: true });
    }
  });

  // --- восстановление при загрузке страницы ---

  const host = location.hostname || 'local-file';
  chrome.storage.local.get(['host:' + host, 'settings']).then((res) => {
    hostCfg = res['host:' + host] || null;
    const s = res.settings || {};
    autoEnabled = !!s.autoDayNight;
    mediaFilter = s.mediaFilter || 'auto';
    if (hostCfg) applyCfg(hostCfg);
    else if (autoEnabled) applyCfg(autoCfg());
  }).catch(() => {});

  // раз в минуту перепроверяем авто день/ночь
  setInterval(refreshAuto, 60000);
})();
