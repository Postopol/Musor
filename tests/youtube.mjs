// Ручная проверка на настоящем Ютубе. Нужен интернет; Ютуб может менять вёрстку,
// поэтому это не часть основного набора. Снимки — в tests/out/.
// Запуск: npm run test:youtube
import fs from 'node:fs';
import path from 'node:path';
import { launch, reporter, sleep, OUT } from './lib.mjs';

fs.mkdirSync(OUT, { recursive: true });
const { ctx, sw } = await launch(['--autoplay-policy=no-user-gesture-required']);
const { t, finish } = reporter();
const apply = (cfg) => sw.evaluate(async (cfg) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  CVET.applyToTab(tab, cfg);
}, cfg);

try {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(6000);
  const baseFont = await p.evaluate(() => getComputedStyle(document.documentElement).fontSize);

  await apply({ name: 'tuned', rules: { fontScale: 110 } });
  await sleep(1500);
  const font = await p.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  const expected = (parseFloat(baseFont) * 1.1).toFixed(2).replace(/\.?0+$/, '') + 'px';
  t('Шрифт 110% от размера Ютуба (' + baseFont + ')', font === expected, font + ', ждали ' + expected);
  await p.screenshot({ path: path.join(OUT, 'youtube-font.png') });

  await sw.evaluate(() => chrome.storage.local.set({ settings: { protectVideo: true } }));
  await apply({ name: 'random', rules: { filter: 'hue-rotate(150deg) saturate(2.2) invert(1)', imgFilter: 'invert(1)', font: 'Georgia, serif' } });
  await sleep(2500);
  const r = await p.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    const chain = [];
    for (let x = v; x; x = x.parentElement) {
      const f = getComputedStyle(x).filter;
      if (f !== 'none') chain.push(x.tagName + ': ' + f);
    }
    return { chain, pieces: document.querySelectorAll('[data-cvet-f]').length };
  });
  t('На странице ролика есть видео', !!r);
  t('Не трогать видео: на видео нет фильтра', r && r.chain.length === 0, r && JSON.stringify(r.chain));
  t('Не трогать видео: остальная страница перекрашена', r && r.pieces > 0, r && 'кусков: ' + r.pieces);
  await p.screenshot({ path: path.join(OUT, 'youtube-protect.png') });
  console.log('Снимки: ' + OUT);
} catch (e) {
  t('Ютуб открылся и проверка прошла без ошибок', false, e.message.split('\n')[0]);
}
finish();
await ctx.close();
