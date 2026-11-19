// Основной набор: 71 проверка на локальных страницах, интернет не нужен.
// Запуск: cd tests && npm install && npm test   (HEADED=1 — показать браузер)
import { launch, serve, reporter, sleep } from './lib.mjs';

const { srv, base: BASE } = await serve();
const { ctx, sw, extId } = await launch();
const { t, finish } = reporter();

// применить стиль к активной вкладке так же, как это делает попап
async function apply(page, cfg) {
  await page.bringToFront();
  await sw.evaluate(async (cfg) => { const [tab] = await chrome.tabs.query({active:true,currentWindow:true}); CVET.applyToTab(tab, cfg); }, cfg);
  await sleep(400);
}
// какой фон реально видно под элементом (первый непрозрачный предок)
const seenBg = (page, sel) => page.$eval(sel, e => { for (let x=e; x; x=x.parentElement) { const b=getComputedStyle(x).backgroundColor; if (b!=='rgba(0, 0, 0, 0)') return b; } return 'canvas'; });
const css = (page, sel, prop) => page.$eval(sel, (e,p)=>getComputedStyle(e)[p], prop);
const PRE = {
  matrix: { name:'matrix', rules:{ textColor:'#00ff66', bg:'#001100', linkColor:'#7dffb0', font:"'Courier New', monospace" } },
  dark: { name:'dark-mode', rules:{ colorScheme:'dark', bg:'#1b1d22', textColor:'#e4e6eb', linkColor:'#8ab4f8', borderColor:'#3a3d46' } },
  invert: { name:'dark', rules:{ filter:'invert(1) hue-rotate(180deg)', imgFilter:'invert(1) hue-rotate(180deg)' } },
};
try {
  // === Применение, восстановление, сброс ===
  let p = await ctx.newPage(); await p.goto(BASE+'plain.html'); await sleep(300);
  await apply(p, PRE.matrix);
  t('Матрица: фон body на простой странице', (await css(p,'body','backgroundColor'))==='rgb(0, 17, 0)', await css(p,'body','backgroundColor'));
  t('Матрица: цвет текста', (await css(p,'#p','color'))==='rgb(0, 255, 102)', await css(p,'#p','color'));
  await p.reload(); await sleep(500);
  t('Стиль сайта восстанавливается после перезагрузки', (await css(p,'body','backgroundColor'))==='rgb(0, 17, 0)', await css(p,'body','backgroundColor'));
  await apply(p, null);
  t('Сброс убирает фон', (await css(p,'body','backgroundColor'))==='rgba(0, 0, 0, 0)', await css(p,'body','backgroundColor'));
  await p.close();

  // === Фон не пропадает на страницах с iframe ===
  p = await ctx.newPage(); await p.goto(BASE+'iframe-nested.html'); await sleep(300);
  await apply(p, PRE.dark);
  t('Тёмный режим: фон body при iframe в колонке', (await css(p,'body','backgroundColor'))==='rgb(27, 29, 34)', await css(p,'body','backgroundColor'));
  t('Тёмный режим: фон статьи (рядом с iframe нет)', (await css(p,'#art','backgroundColor'))==='rgb(27, 29, 34)', await css(p,'#art','backgroundColor'));
  t('Тёмный режим: текст статьи светлый', (await css(p,'#p','color'))==='rgb(228, 230, 235)', await css(p,'#p','color'));
  await apply(p, null); await p.close();

  // iframe прямо в body (счётчики, реклама)
  p = await ctx.newPage(); await p.goto(BASE+'iframe-body.html'); await sleep(300);
  await apply(p, PRE.matrix); await sleep(500);
  t('body не помечается как медиа-зона', !(await p.$eval('body', e=>e.hasAttribute('data-cvet-media'))));
  t('Матрица: фон блока при iframe в body', (await css(p,'#box','backgroundColor'))==='rgb(0, 17, 0)', await css(p,'#box','backgroundColor'));
  await apply(p, null); await p.close();

  // === Инверсия: картинки в <picture> и svg в svg ===
  p = await ctx.newPage(); await p.goto(BASE+'picture.html'); await sleep(300);
  await apply(p, PRE.invert);
  const chainCount = (sel) => p.$eval(sel, e => { let n=0; for (let x=e; x && x!==document.documentElement; x=x.parentElement) if (getComputedStyle(x).filter.includes('invert')) n++; return n; });
  t('Инверсия: одиночная картинка инвертирована ровно 1 раз (контр-фильтр)', (await chainCount('#solo'))===1, 'слоёв: '+await chainCount('#solo'));
  t('Инверсия: картинка в <picture> инвертирована ровно 1 раз', (await chainCount('#img'))===1, 'слоёв: '+await chainCount('#img'));
  t('Инверсия: svg в svg инвертирован ровно 1 раз', (await chainCount('#inner'))===1, 'слоёв: '+await chainCount('#inner'));
  await apply(p, null); await p.close();

  // === Защита видеоплееров от заливки ===
  // плеер на «живой» странице (DOM меняется постоянно)
  p = await ctx.newPage(); await p.goto(BASE+'busy.html'); await sleep(200);
  await apply(p, PRE.dark); await sleep(2500);
  t('Плеер помечается на странице с постоянными изменениями DOM', await p.$eval('.player', e=>e.hasAttribute('data-cvet-media')));
  await apply(p, null); await p.close();

  // оверлеи плеера прозрачные, остальная страница залита
  p = await ctx.newPage(); await p.goto(BASE+'player.html'); await sleep(200);
  await apply(p, PRE.dark); await sleep(600);
  t('Плеер: контейнер видео прозрачный', (await css(p,'#movie_player','backgroundColor'))==='rgba(0, 0, 0, 0)', await css(p,'#movie_player','backgroundColor'));
  t('Плеер: оверлей с кнопками прозрачный', (await css(p,'#overlay','backgroundColor'))==='rgba(0, 0, 0, 0)', await css(p,'#overlay','backgroundColor'));
  t('Плеер: карточка с видео прозрачная (слой :has)', (await css(p,'#card','backgroundColor'))==='rgba(0, 0, 0, 0)', await css(p,'#card','backgroundColor'));
  t('Плеер: body залит тёмным', (await css(p,'body','backgroundColor'))==='rgb(27, 29, 34)', await css(p,'body','backgroundColor'));
  t('Плеер: комментарии вне плеера залиты', (await css(p,'#comments','backgroundColor'))==='rgb(27, 29, 34)', await css(p,'#comments','backgroundColor'));
  await apply(p, null); await p.close();

  // === Шрифт, ползунки «Медиа», «Не трогать видео» ===
  const setSettings = (st) => sw.evaluate((st) => chrome.storage.local.set({ settings: st }), st);
  // суммарный фильтр над элементом: список непустых filter у него и всех предков
  const chain = (pg, sel) => pg.$eval(sel, e => { const out=[]; for (let x=e; x; x=x.parentElement) { const f=getComputedStyle(x).filter; if (f!=='none') out.push(x.tagName.toLowerCase()+(x.id?'#'+x.id:'')+': '+f); } return out; });
  p = await ctx.newPage(); await p.goto(BASE+'ytlike.html'); await sleep(300);
  await apply(p, { name:'tuned', rules:{ fontScale:110 } });
  t('Шрифт 110% считается от размера сайта (10px → 11px)', (await css(p,'html','fontSize'))==='11px', await css(p,'html','fontSize'));
  t('Только шрифт — фильтр на страницу не вешается', (await css(p,'html','filter'))==='none', await css(p,'html','filter'));
  t('Только шрифт — картинки без фильтра', (await chain(p,'#thumb')).length===0, JSON.stringify(await chain(p,'#thumb')));
  await p.reload(); await sleep(800);
  t('Шрифт 110% верный и после перезагрузки', (await css(p,'html','fontSize'))==='11px', await css(p,'html','fontSize'));
  await apply(p, { name:'tuned', rules:{ htmlFontSize:'120%' } });
  t('Старые сохранённые стили (htmlFontSize) тоже от размера сайта', (await css(p,'html','fontSize'))==='12px', await css(p,'html','fontSize'));
  await apply(p, null);

  await setSettings({ mediaTune:{ hue:90, sat:100, bright:100 } }); await sleep(500);
  t('Ползунки «Медиа» работают без стиля: картинка', (await css(p,'#thumb','filter'))==='hue-rotate(90deg)', await css(p,'#thumb','filter'));
  t('Ползунки «Медиа» работают без стиля: видео', (await css(p,'#v','filter'))==='hue-rotate(90deg)', await css(p,'#v','filter'));
  t('Ползунки «Медиа» не трогают страницу', (await css(p,'html','filter'))==='none');
  await setSettings({}); await sleep(400);
  t('Сброс «Медиа» снимает фильтр', (await css(p,'#thumb','filter'))==='none', await css(p,'#thumb','filter'));

  const RND = { name:'random', rules:{ filter:'hue-rotate(200deg) saturate(2) invert(1)', imgFilter:'invert(1)', font:'Georgia, serif', textColor:'hsl(10,85%,50%)', bg:'hsl(190,60%,10%)' } };
  await setSettings({ protectVideo:true }); await sleep(300);
  await apply(p, RND); await sleep(600);
  t('Не трогать видео: на видео и его предках нет фильтра', (await chain(p,'#v')).length===0, JSON.stringify(await chain(p,'#v')));
  t('Не трогать видео: встроенный плеер Ютуба тоже без фильтра', (await chain(p,'#emb')).length===0, JSON.stringify(await chain(p,'#emb')));
  t('Не трогать видео: описание под видео перекрашено', (await chain(p,'#desc')).some(x=>x.includes('hue-rotate(200deg)')), JSON.stringify(await chain(p,'#desc')));
  t('Не трогать видео: кнопки плеера перекрашены', (await chain(p,'#ctrl')).some(x=>x.includes('hue-rotate(200deg)')));
  t('Не трогать видео: шапка перекрашена', (await chain(p,'#title')).some(x=>x.includes('hue-rotate(200deg)')));
  const th = await chain(p,'#thumb');
  t('Не трогать видео: картинка — фильтр страницы + контр-инверсия', th.length===2 && th[0].includes('invert(1)'), JSON.stringify(th));
  t('Не трогать видео: шрифт сайта поменян', (await css(p,'#desc','fontFamily')).includes('Georgia'));
  await setSettings({ protectVideo:true, mediaTune:{ hue:0, sat:0, bright:100 } }); await sleep(500);
  t('Не трогать видео + «Медиа»: на видео только ползунки медиа', JSON.stringify(await chain(p,'#v'))===JSON.stringify(['video#v: saturate(0)']), JSON.stringify(await chain(p,'#v')));
  await setSettings({ protectVideo:false }); await sleep(500);
  t('Галочка снята: видео снова красится со страницей', (await chain(p,'#v')).some(x=>x.startsWith('html')), JSON.stringify(await chain(p,'#v')));
  t('Галочка снята: служебные метки убраны', await p.evaluate(() => !document.querySelector('[data-cvet-f],[data-cvet-video]') && !document.documentElement.hasAttribute('data-cvet-cut')));
  await apply(p, null);

  // === Попап: ползунки и галочки глазами пользователя ===
  await setSettings({});
  const pp = await ctx.newPage();
  await pp.addInitScript((target) => { const q = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = (qq, cb) => q({ url: target }, cb); }, BASE+'ytlike.html');
  await pp.goto('chrome-extension://'+extId+'/popup.html'); await sleep(500);
  const slide = async (id, v) => { await pp.$eval('#'+id, (e,v)=>{ e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); }, v); await sleep(700); };
  t('Попап: выпадающего списка медиа больше нет', !(await pp.$('#mediaFilter')));
  await pp.$eval('#tuner', d => d.open = true);
  await pp.click('button[data-id="dark-mode"]'); await sleep(600);
  await slide('fs', 110);
  t('Попап: ползунок шрифта 110% → 11px', (await css(p,'html','fontSize'))==='11px', await css(p,'html','fontSize'));
  t('Попап: шрифт поверх тёмного режима — фон остался тёмным', (await seenBg(p,'#desc'))==='rgb(27, 29, 34)', await seenBg(p,'#desc'));
  t('Попап: двигали только шрифт — фильтра нет', (await css(p,'html','filter'))==='none', await css(p,'html','filter'));
  await slide('hue', 40);
  t('Попап: оттенок добавился, шрифт сохранился', (await css(p,'html','filter'))==='hue-rotate(40deg)' && (await css(p,'html','fontSize'))==='11px', (await css(p,'html','filter'))+' / '+(await css(p,'html','fontSize')));
  await pp.reload(); await sleep(600); await pp.$eval('#tuner', d => d.open = true);
  t('Попап: после переоткрытия ползунки на своих местах', (await pp.$eval('#fs',e=>e.value))==='110' && (await pp.$eval('#hue',e=>e.value))==='40');
  await slide('sat', 150);
  t('Попап: после переоткрытия двигаем другой ползунок — прежние не слетают', (await css(p,'html','filter'))==='hue-rotate(40deg) saturate(1.5)' && (await css(p,'html','fontSize'))==='11px', (await css(p,'html','filter'))+' / '+(await css(p,'html','fontSize')));
  await pp.click('#tuneReset'); await sleep(600);
  t('Попап: «Сбросить ползунки» возвращает чистый тёмный режим', (await css(p,'html','filter'))==='none' && (await css(p,'html','fontSize'))==='10px' && (await seenBg(p,'#desc'))==='rgb(27, 29, 34)');
  await pp.$eval('#mediaBox', d => d.open = true);
  await slide('mBright', 70);
  t('Попап: ползунок яркости медиа', (await css(p,'#thumb','filter'))==='brightness(0.7)', await css(p,'#thumb','filter'));
  await pp.click('label:has(#protectVideo)'); await sleep(300);
  await pp.click('#random'); await sleep(800);
  t('Попап: галочка + рандом — видео без фильтра страницы', (await chain(p,'#v')).every(x=>x.startsWith('video')), JSON.stringify(await chain(p,'#v')));
  await pp.click('#mediaReset'); await sleep(500);
  t('Попап: «Сбросить медиа» — видео в оригинале', (await chain(p,'#v')).length===0, JSON.stringify(await chain(p,'#v')));
  const errs = []; pp.on('pageerror', e=>errs.push(e.message)); await pp.reload(); await sleep(500);
  t('Попап открывается без ошибок JS', errs.length===0, errs.join('; '));
  await pp.close(); await apply(p, null);

  // === Удобство панели ===
  await sw.evaluate(() => chrome.storage.local.set({ saved: [], hiddenPresets: [], settings: {} }));
  await sw.evaluate(async () => { const all = await chrome.storage.local.get(null); await chrome.storage.local.remove(Object.keys(all).filter(k=>k.startsWith('host:'))); });
  const ui = await ctx.newPage(); await ui.setViewportSize({ width: 352, height: 600 });
  await ui.addInitScript((target) => { const q = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = (qq, cb) => q({ url: target }, cb); }, BASE+'ytlike.html');
  await ui.goto('chrome-extension://'+extId+'/popup.html'); await ui.evaluate(() => localStorage.clear()); await ui.reload(); await sleep(600);
  const txt = (sel) => ui.$eval(sel, e => e.textContent.trim());
  t('Панель: свёрнутая помещается в 600px без прокрутки', await ui.evaluate(() => document.body.scrollHeight <= 600), String(await ui.evaluate(() => document.body.scrollHeight)));
  t('Панель: подписи пресетов не обрезаны', await ui.evaluate(() => [...document.querySelectorAll('.preset-label')].every(e => e.scrollWidth <= e.clientWidth)));
  t('Панель: карточка показывает сайт', (await txt('#curHost'))==='127.0.0.1', await txt('#curHost'));
  t('Панель: без стиля — «Без стиля», сброс неактивен', (await txt('#curStyle'))==='Без стиля' && await ui.$eval('#curReset', e=>e.disabled));
  t('Панель: пустые «Мои стили» объясняют, что делать', (await txt('#savedList')).includes('сохрани'));
  t('Панель: крестик пресета скрыт без наведения', (await ui.$eval('.preset-item .del', e=>getComputedStyle(e).opacity))==='0');
  await ui.hover('.preset[data-id="sepia"]'); await sleep(250);
  t('Панель: крестик пресета виден при наведении', (await ui.$eval('.preset[data-id="sepia"] + .del', e=>getComputedStyle(e).opacity))==='1');
  await ui.click('.preset[data-id="matrix"]'); await sleep(600);
  t('Панель: после выбора карточка показывает стиль', (await txt('#curStyle'))==='Матрица', await txt('#curStyle'));
  t('Панель: всплывашка с результатом видна', await ui.$eval('#status', e=>e.classList.contains('show') && e.textContent.includes('Матрица')));
  t('Панель: пресет подсвечен', await ui.$eval('.preset[data-id="matrix"]', e=>e.classList.contains('active')));
  await ui.click('#curSave'); await sleep(400);
  t('Панель: кнопка «Сохранить» в карточке открывает «Мои стили» и ставит курсор', await ui.evaluate(() => document.getElementById('savedBox').open && document.activeElement.id==='saveName'));
  await ui.keyboard.type('Зелёный'); await ui.keyboard.press('Enter'); await sleep(400);
  t('Панель: Enter сохраняет стиль', (await txt('#savedList')).includes('Зелёный') && (await txt('#savedCount'))==='1');
  await ui.click('#sitesBox summary'); await sleep(300);
  t('Панель: текущий сайт выделен в списке сайтов', await ui.$eval('.site-item.here .list-name', e=>e.textContent)==='127.0.0.1');
  await ui.click('.site-item.here .del'); await sleep(700);
  t('Панель: удаление правила текущего сайта снимает стиль со страницы', (await css(p,'body','backgroundColor'))==='rgba(0, 0, 0, 0)' && (await txt('#curStyle'))==='Без стиля', await css(p,'body','backgroundColor'));
  await ui.hover('.preset[data-id="comic"]'); await ui.click('.preset[data-id="comic"] + .del'); await sleep(400);
  t('Панель: пресет удаляется крестиком', !(await ui.$('.preset[data-id="comic"]')));
  await ui.reload(); await sleep(600);
  t('Панель: раскрытые блоки запоминаются', await ui.evaluate(() => document.getElementById('savedBox').open && document.getElementById('sitesBox').open && !document.getElementById('tuner').open));
  await ui.$eval('#hue', e => { e.value = 120; e.dispatchEvent(new Event('input')); }); await sleep(50);
  await ui.$eval('#hue', e => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  t('Панель: двойной клик возвращает ползунок на место', (await ui.$eval('#hue', e=>e.value))==='0' && (await txt('#hueVal'))==='0°');
  await sleep(500);
  const okeys = await ui.evaluate(() => { const r=[]; for (const b of document.querySelectorAll('button')) { const name=(b.getAttribute('aria-label')||b.textContent).trim(); if(!name) r.push(b.outerHTML.slice(0,60)); } return r; });
  t('Панель: у всех кнопок есть подпись (для скринридера)', okeys.length===0, okeys.join(' | '));
  await ui.close();
  // служебная страница
  const sp = await ctx.newPage(); await sp.goto('about:blank');
  const ui2 = await ctx.newPage();
  await ui2.addInitScript(() => { const q = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = (qq, cb) => q({ url: 'chrome-extension://*/*' }, cb); });
  await ui2.goto('chrome-extension://'+extId+'/popup.html'); await sleep(600);
  t('Панель: на служебной странице честно пишет, что не работает', (await ui2.$eval('#curStyle', e=>e.textContent))==='Здесь стили не работают');
  await ui2.click('#random'); await sleep(300);
  t('Панель: нажатие там даёт понятное сообщение', (await ui2.$eval('#status', e=>e.textContent)).includes('служебных'));
  await ui2.close(); await sp.close(); await p.close();

  // === Экспорт/импорт кода стиля ===
  p = await ctx.newPage(); await p.goto(BASE+'plain.html');
  const rt = await sw.evaluate(() => { const c={name:'Мой стиль ✨', rules:{font:"'Comic Sans MS'"}}; const d=CVET.decodeCfg(CVET.encodeCfg(c)); return JSON.stringify(d)===JSON.stringify(c); });
  t('Экспорт/импорт кода стиля с кириллицей', rt);
  t('Импорт мусора отклоняется', await sw.evaluate(() => CVET.decodeCfg('CVET1.@@@')===null && CVET.decodeCfg('abc')===null));

} catch (e) { t('Тест не упал с ошибкой', false, e.message.split('\n')[0]); }
finish();
await ctx.close(); srv.close();
