// Общий запуск: Chromium с загруженным расширением + локальный сервер тестовых страниц.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXT = process.env.EXT || path.resolve(HERE, '..');
export const OUT = path.join(HERE, 'out');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Браузер: CHROME_PATH → браузер этой версии Playwright → любой Chromium из кэша Playwright.
function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const own = chromium.executablePath();
  if (fs.existsSync(own)) return own;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)) : [];
  dirs.sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
  for (const d of dirs) {
    const exe = path.join(cache, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('Не нашёл Chromium. Поставь его: npx playwright install chromium');
}

export async function serve(dir = path.join(HERE, 'pages')) {
  const srv = http.createServer((q, r) => {
    const f = path.join(dir, path.normalize(q.url.split('?')[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    r.end(fs.readFileSync(f));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return { srv, base: 'http://127.0.0.1:' + srv.address().port + '/' };
}

export async function launch(extraArgs = []) {
  const ctx = await chromium.launchPersistentContext('', {
    headless: !process.env.HEADED,
    executablePath: findBrowser(),
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, ...extraArgs]
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  return { ctx, sw, extId: new URL(sw.url()).host };
}

// Счётчик результатов: печатает PASS/FAIL и ставит код выхода 1 при падениях.
export function reporter() {
  const results = [];
  const t = (name, ok, info = '') => {
    results.push({ name, ok: !!ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  — ' + info : ''));
  };
  const finish = () => {
    const failed = results.filter((r) => !r.ok);
    console.log('\nИтого: ' + (results.length - failed.length) + '/' + results.length + ' прошло');
    if (failed.length) {
      console.log('Упали:\n' + failed.map((r) => '  - ' + r.name).join('\n'));
      process.exitCode = 1;
    }
  };
  return { t, finish };
}
