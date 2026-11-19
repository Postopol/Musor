(() => {
  // в iframe не работаем — иначе фильтры накладываются дважды
  if (window.self !== window.top) return;
  if (window.__rashirCvetLoaded) return;
  window.__rashirCvetLoaded = true;

  const STYLE_ID = 'rashir-cvet-style';
  let sheet = null;

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
    return css;
  }

  function applyCfg(cfg) {
    try {
      getSheet().replaceSync(buildCss(cfg));
    } catch (e) { /* ignore */ }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'apply') {
      applyCfg(msg.cfg);
      sendResponse({ ok: true });
    }
  });

  // восстанавливаем сохранённый вид сайта после перезагрузки
  const host = location.hostname || 'local-file';
  chrome.storage.local
    .get('host:' + host)
    .then((res) => {
      const cfg = res && res['host:' + host];
      if (cfg) applyCfg(cfg);
    })
    .catch(() => {});
})();
