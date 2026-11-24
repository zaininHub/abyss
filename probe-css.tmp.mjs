import puppeteer from 'puppeteer-core';
import { chromePath } from './tests/_chrome.mjs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const b = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox','--disable-gpu','--allow-file-access-from-files'] });
const p = await b.newPage();
const msgs = [];
p.on('console', m => msgs.push('[console] ' + m.type() + ': ' + m.text().slice(0,300)));
p.on('pageerror', e => msgs.push('[pageerror] ' + String(e).slice(0,300)));
p.on('requestfailed', r => msgs.push('[reqfail] ' + r.url().slice(-60) + ' :: ' + (r.failure()?.errorText||'')));
await p.goto('file://' + root + 'dist/index.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1500));
const res = await p.evaluate(() => ({
  sheets: document.styleSheets.length,
  cssRules: (() => { try { return document.styleSheets[0].cssRules.length; } catch (e) { return 'ERR:' + e.message.slice(0,80); } })(),
  bodyBg: getComputedStyle(document.body).backgroundColor,
  bodyFont: getComputedStyle(document.body).fontFamily.slice(0,40),
  appDisplay: getComputedStyle(document.getElementById('app')).display,
  qa: typeof window.__qa,
  scriptTags: [...document.querySelectorAll('script')].map(s => 'type=' + (s.type||'(none)') + ' crossOrigin=' + s.crossOrigin + ' src=' + s.src.slice(-30)),
  linkTags: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => 'crossOrigin=' + l.getAttribute('crossorigin') + ' href=' + l.href.slice(-30)),
}));
console.log(JSON.stringify(res, null, 2));
console.log('--- msgs ---');
console.log(msgs.join('\n') || '(none)');
await b.close();
