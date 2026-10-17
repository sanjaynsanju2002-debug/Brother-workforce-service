import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../frontend/public/language.js', import.meta.url), 'utf8');

function page(initial = {}, blocked = false) {
  const storage = new Map(Object.entries(initial));
  const element = (dataset) => ({ dataset, attributes: {}, textContent: '', setAttribute(name, value) { this.attributes[name] = value; } });
  const heading = element({ i18n: 'I need workers' });
  const title = element({ i18nTitle: 'Brothers App · Workforce Solutions' });
  const selector = { value: '', attributes: {}, listeners: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; } };
  const document = { documentElement: { lang: '' }, querySelectorAll: key => ({ '[data-i18n]': [heading], '[data-i18n-title]': [title], '[data-language-selector]': [selector] })[key] ?? [] };
  const handlers = {};
  const window = { addEventListener: (name, fn) => { handlers[name] = fn; }, dispatchEvent: () => {} };
  const localStorage = { getItem(key) { if (blocked) throw new Error('blocked'); return storage.get(key) ?? null; }, setItem(key, value) { if (blocked) throw new Error('blocked'); storage.set(key, value); } };
  vm.runInNewContext(source, { window, document, localStorage, Event });
  return { window, document, heading, title, selector, storage, handlers };
}

test('static pages default to English and share the explicit Kannada choice', () => {
  const p = page({ 'bws-candidate-language': 'kn' });
  assert.equal(p.document.documentElement.lang, 'en');
  assert.equal(p.heading.textContent, 'I need workers');
  p.selector.listeners.change({ target: { value: 'kn' } });
  assert.equal(p.document.documentElement.lang, 'kn');
  assert.equal(p.heading.textContent, 'ನನಗೆ ಕೆಲಸಗಾರರು ಬೇಕು');
  assert.equal(p.selector.value, 'kn');
  assert.equal(p.storage.get('bws-site-language'), 'kn');
  assert.match(p.title.textContent, /ಬ್ರದರ್ಸ್/);
  assert.equal(p.window.bwsLanguage.text('Install app'), 'ಆ್ಯಪ್ ಸ್ಥಾಪಿಸಿ');
  p.window.bwsLanguage.set('en');
  assert.equal(p.heading.textContent, 'I need workers');
});

test('remembered choice, storage events and blocked storage all work', () => {
  const remembered = page({ 'bws-site-language': 'kn' });
  assert.equal(remembered.selector.value, 'kn');
  remembered.handlers.storage({ key: 'bws-site-language', newValue: 'en' });
  assert.equal(remembered.heading.textContent, 'I need workers');
  const blocked = page({}, true);
  blocked.window.bwsLanguage.set('kn');
  assert.equal(blocked.selector.value, 'kn');
});

test('app and offline pages include the selector and its offline-safe script', () => {
  for (const file of ['app.html', 'offline.html']) {
    const html = readFileSync(new URL(`../frontend/public/${file}`, import.meta.url), 'utf8');
    assert.match(html, /data-language-selector/);
    assert.match(html, /src="\/language\.js"/);
  }
  const serviceWorker = readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8');
  assert.match(serviceWorker, /'\/language\.js'/);
});
