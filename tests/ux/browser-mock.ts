/**
 * Injected into every page before load.
 * Provides a minimal mock of the Firefox browser.* extension API
 * so translation.html, popup.html, settings.html run in plain Chromium.
 */
export const BROWSER_MOCK_SCRIPT = `
(function() {
  const listeners = [];
  const sentMessages = [];

  window.__mockBrowser = {
    sentMessages,
    // Dispatch a fake incoming message to the page
    dispatch(msg) {
      listeners.forEach(cb => cb(msg, {}, () => {}));
    },
  };

  window.browser = {
    runtime: {
      onMessage: {
        addListener(cb) { listeners.push(cb); },
        removeListener(cb) { const i = listeners.indexOf(cb); if (i > -1) listeners.splice(i,1); },
      },
      getURL(path) { return '/' + path; },
      sendMessage(msg) { sentMessages.push({dir:'outbound', msg}); return Promise.resolve(); },
      openOptionsPage() { sentMessages.push({dir:'openOptions'}); return Promise.resolve(); },
    },
    tabs: {
      sendMessage(_id, msg) { sentMessages.push({dir:'toTab', msg}); return Promise.resolve(); },
      query() { return Promise.resolve([{id:1, url:'https://example.com'}]); },
      create(opts) { sentMessages.push({dir:'create', opts}); return Promise.resolve({id:2}); },
    },
    storage: {
      local: {
        _store: {
          config: {
            apiUrl: 'http://localhost:11434/v1/chat/completions',
            model: 'llama3.1', temperature: 0.1, requestTimeout: 120,
            maxRPS: 5, maxTextLengthPerRequest: 1800, maxParagraphsPerRequest: 10,
            systemPrompt: 'You are a translator.',
            multiplePrompt: 'Translate {{from}} to {{to}}:\\n{{json}}',
            singlePrompt: 'Translate {{from}} to {{to}}:\\n{{text}}',
            aiContextAware: false, sourceLang: 'auto', apiKey: '',
          }
        },
        get(key) {
          if (key === null) return Promise.resolve({ ...this._store });
          const result = {};
          const keys = typeof key === 'string' ? [key] : (Array.isArray(key) ? key : Object.keys(key));
          keys.forEach(k => { if (this._store[k] !== undefined) result[k] = this._store[k]; });
          return Promise.resolve(result);
        },
        set(obj) { Object.assign(this._store, obj); return Promise.resolve(); },
        remove(keys) {
          const arr = typeof keys === 'string' ? [keys] : keys;
          arr.forEach(k => delete this._store[k]);
          return Promise.resolve();
        },
      }
    },
  };
})();
`
