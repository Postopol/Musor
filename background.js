// Chrome/Safari: service worker подтягивает общий модуль сам.
// Firefox: common.js уже подключён в manifest (background.scripts).
if (typeof importScripts === 'function') importScripts('common.js');

// горячие клавиши: Alt+R — рандом, Alt+X — сброс
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^(https?|file):/.test(tab.url)) return;
    if (command === 'random') CVET.applyToTab(tab, CVET.randomCfg());
    else if (command === 'reset') CVET.applyToTab(tab, null);
  } catch (e) { /* ignore */ }
});
