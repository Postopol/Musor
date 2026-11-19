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
  let mediaTune = CVET.DEFAULT_MEDIA_TUNE;
  let protectVideo = false;
  let watcher = null;
  let scanTimer = null;
  let scanOpts = { bg: false, video: false, cut: false };

  // Защита медиа-зон от заливки. ДВА отдельных правила:
  // первое — без :has(), работает на любом Chromium (атрибут ставит JS ниже);
  // второе — дополнительный слой для современных движков.
  // Нельзя объединять в одно: при неподдержке :has() умрёт всё правило целиком.
  // :has() — только для ПРЯМОГО родителя и никогда для html/body:
  // «*:has(video)» ловит всех предков, включая body, и стирает фон всей страницы.
  const MEDIA_EXEMPT =
    '[data-cvet-media],[data-cvet-media] *,' +
    'img,video,picture,canvas,svg,iframe,embed,object' +
    '{background-color:transparent !important}\n' +
    ':not(html,body):has(> video,> iframe,> canvas),' +
    ':not(html,body):has(> video,> iframe,> canvas) *' +
    '{background-color:transparent !important}\n';

  // picture не фильтруем: внутри всегда img, иначе фильтр ляжет дважды
  const MEDIA_EL = 'img,video,canvas,svg,iframe';
  // вложенный svg уже получил фильтр от внешнего
  const MEDIA_NESTED_RESET = 'svg svg{filter:none !important}\n';
  // встроенные плееры, которые считаем видео (для «Не трогать видео»)
  const VIDEO_IFRAME = /(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|rutube\.ru|vk\.com\/video|vkvideo\.ru|ok\.ru\/videoembed|dzen\.ru|twitch\.tv|dailymotion\.com|coub\.com)/i;
  const SKIP_TAGS = { HEAD: 1, SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, TEMPLATE: 1, NOSCRIPT: 1 };

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

  // масштаб шрифта в %; старые сохранённые стили хранили строку htmlFontSize: '110%'
  function fontScaleOf(r) {
    const v = r.fontScale || parseFloat(r.htmlFontSize) || 100;
    return v === 100 ? 0 : v;
  }

  function buildCss(cfg, fontPx) {
    const r = (cfg && cfg.rules) || {};
    const mediaT = CVET.tuneFilter(mediaTune);
    let css = '';
    if (r.colorScheme) css += 'html{color-scheme:' + r.colorScheme + ' !important}\n';

    // фильтр страницы: на html, а при «Не трогать видео» — на кусках страницы вокруг видео
    if (r.filter) {
      css += 'html:not([data-cvet-cut]){filter:' + r.filter + ' !important}\n';
      css += '[data-cvet-f]{filter:' + r.filter + ' !important}\n';
    }

    // медиа: контр-фильтр стиля (например, у инверсии) + ползунки «Медиа»
    const mediaF = [r.imgFilter, mediaT].filter(Boolean).join(' ');
    if (mediaF) css += MEDIA_EL + '{filter:' + mediaF + ' !important}\n' + MEDIA_NESTED_RESET;
    // защищённое видео: стиль его не касается, действуют только ползунки «Медиа»
    if (protectVideo) css += '[data-cvet-video]{filter:' + (mediaT || 'none') + ' !important}\n';

    if (fontPx) css += 'html{font-size:' + fontPx.toFixed(2) + 'px !important}\n';

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

  // --- маркировка плееров: JS-слой защиты фона, не зависит от поддержки :has() ---

  function markMediaRoots() {
    if (!document.body) return;
    document.querySelectorAll('video, canvas, object, embed, iframe').forEach((el) => {
      if (el.closest('[data-cvet-media]')) return;
      // поднимаемся от видео вверх, пока контейнер похож на плеер
      // (класс/id содержит player, video, media и т.п.) — так захватываем оверлеи;
      // прямой родитель метится всегда, первый обычный предок — НЕТ
      let last = el.parentElement;
      let node = last;
      let levels = 0;
      while (node && node !== document.body && levels < 8) {
        const cls = (typeof node.className === 'string' ? node.className : '') + ' ' + (node.id || '');
        if (!/(player|video|media|embed|stream|carousel|shorts|reel)/i.test(cls)) break;
        last = node;
        node = node.parentElement;
        levels++;
      }
      // body/html не метим: иначе прозрачной станет вся страница
      if (last && last !== document.body && last !== document.documentElement) {
        last.setAttribute('data-cvet-media', '');
      }
    });
  }

  // --- «Не трогать видео» ---
  // Фильтр на html действует на всё внутри, видео из-под него не вынуть.
  // Поэтому фильтр вешаем не на html, а на «срез»: всех соседей по пути
  // от видео до html. Сам путь и видео остаются без фильтра.

  function isVideo(el) {
    if (el.tagName === 'VIDEO') return true;
    return VIDEO_IFRAME.test(el.getAttribute('src') || '');
  }

  function setMarks(attr, wanted) {
    document.querySelectorAll('[' + attr + ']').forEach((el) => {
      if (!wanted.has(el)) el.removeAttribute(attr);
    });
    wanted.forEach((el) => {
      if (!el.hasAttribute(attr)) el.setAttribute(attr, '');
    });
  }

  function markVideos(cut) {
    const videos = new Set();
    document.querySelectorAll('video, iframe').forEach((el) => { if (isVideo(el)) videos.add(el); });
    setMarks('data-cvet-video', videos);

    const root = document.documentElement;
    if (!cut || !videos.size) {
      setMarks('data-cvet-f', new Set());
      root.removeAttribute('data-cvet-cut');
      return;
    }
    const path = new Set();
    videos.forEach((v) => {
      for (let n = v.parentElement; n && !path.has(n); n = n.parentElement) path.add(n);
    });
    const pieces = new Set();
    path.forEach((n) => {
      for (const child of n.children) {
        if (!path.has(child) && !videos.has(child) && !SKIP_TAGS[child.tagName]) pieces.add(child);
      }
    });
    setMarks('data-cvet-f', pieces);
    root.setAttribute('data-cvet-cut', '');
  }

  function clearVideoMarks() {
    setMarks('data-cvet-video', new Set());
    setMarks('data-cvet-f', new Set());
    document.documentElement.removeAttribute('data-cvet-cut');
  }

  function scan() {
    if (scanOpts.bg) markMediaRoots();
    if (scanOpts.video) markVideos(scanOpts.cut);
  }

  // throttle, а не debounce: на «живых» страницах (Ютуб, часы, ленты) DOM меняется
  // чаще 300 мс, и debounce откладывал сканирование бесконечно
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 300);
  }

  function updateWatch(opts) {
    const wasVideo = scanOpts.video;
    scanOpts = opts;
    if (wasVideo && !opts.video) clearVideoMarks();
    const on = opts.bg || opts.video;
    if (on && !watcher) {
      watcher = new MutationObserver(scheduleScan);
      watcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    } else if (!on && watcher) {
      watcher.disconnect();
      watcher = null;
    }
    if (on) scan();
  }

  // --- применение ---

  function autoCfg() {
    const h = new Date().getHours();
    const night = h >= 19 || h < 7;
    return night
      ? { name: 'dark-mode', rules: CVET.MODE_RULES['dark-mode'] }
      : { name: 'light-mode', rules: CVET.MODE_RULES['light-mode'] };
  }

  function activeCfg() {
    if (hostCfg) return hostCfg;
    if (autoEnabled && !explicitReset) return autoCfg();
    return null;
  }

  function render() {
    const cfg = activeCfg();
    const r = (cfg && cfg.rules) || {};
    const scale = fontScaleOf(r);
    try {
      const s = getSheet();
      if (scale) {
        // размер шрифта считаем от размера самого сайта (у Ютуба 10px, а не 16px):
        // сначала применяем стиль без шрифта, меряем, потом ставим шрифт
        s.replaceSync(buildCss(cfg, 0));
        const base = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        s.replaceSync(buildCss(cfg, base * scale / 100));
      } else {
        s.replaceSync(buildCss(cfg, 0));
      }
    } catch (e) { /* ignore */ }

    const mediaActive = !!(cfg || CVET.tuneFilter(mediaTune));
    updateWatch({
      bg: !!r.bg,
      video: protectVideo && mediaActive,
      cut: protectVideo && !!r.filter
    });
  }

  // стили сайта грузятся после document_start — перемеряем шрифт, когда они готовы
  function rerenderIfFont() {
    const cfg = activeCfg();
    if (cfg && cfg.rules && fontScaleOf(cfg.rules)) render();
  }
  document.addEventListener('DOMContentLoaded', rerenderIfFont);
  window.addEventListener('load', rerenderIfFont);

  function applySettings(s) {
    s = s || {};
    autoEnabled = !!s.autoDayNight;
    protectVideo = !!s.protectVideo;
    mediaTune = CVET.normTune(s.mediaTune);
  }

  // --- сообщения от попапа и хоткеев ---

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'apply') {
      hostCfg = msg.cfg || null;
      explicitReset = !hostCfg;
      render();
      sendResponse({ ok: true });
    } else if (msg.type === 'settings') {
      if (msg.settings && msg.settings.autoDayNight && !autoEnabled) explicitReset = false;
      applySettings(msg.settings);
      render();
      sendResponse({ ok: true });
    }
  });

  // общие настройки поменялись в попапе — обновляем и остальные открытые вкладки
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const s = changes.settings.newValue || {};
    if (s.autoDayNight && !autoEnabled) explicitReset = false;
    applySettings(s);
    render();
  });

  // --- восстановление при загрузке страницы ---

  const host = location.hostname || 'local-file';
  chrome.storage.local.get(['host:' + host, 'settings']).then((res) => {
    hostCfg = res['host:' + host] || null;
    applySettings(res.settings);
    render();
  }).catch(() => {});

  // раз в минуту перепроверяем авто день/ночь
  setInterval(() => {
    if (autoEnabled && !hostCfg && !explicitReset) render();
  }, 60000);
})();
