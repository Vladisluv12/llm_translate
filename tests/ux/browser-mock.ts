/**
 * Injected into every page before load.
 * Provides a minimal mock of the Firefox browser.* extension API
 * so translation.html, popup.html, settings.html run in plain Chromium.
 */
export const BROWSER_MOCK_SCRIPT = `
(function() {
  const listeners = [];
  const sentMessages = [];
  const contextMenuListeners = [];
  const commandListeners = [];

  window.__mockBrowser = {
    sentMessages,
    contextMenuItems: [],
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
      onInstalled: {
        addListener(cb) { /* no-op */ },
        removeListener(cb) { /* no-op */ },
      },
    },
    tabs: {
      sendMessage(_id, msg) { sentMessages.push({dir:'toTab', msg}); return Promise.resolve(); },
      query() { return Promise.resolve([{id:1, url:'https://example.com'}]); },
      create(opts) { sentMessages.push({dir:'create', opts}); return Promise.resolve({id:2}); },
    },
    windows: {
      getCurrent() { return Promise.resolve({ id: 1, width: 1920, height: 1080 }); },
      update(id, opts) { sentMessages.push({dir:'updateWindow', id, opts}); return Promise.resolve({ id }); },
      create(opts) { sentMessages.push({dir:'createWindow', opts}); return Promise.resolve({ id: 2 }); },
      remove(id) { return Promise.resolve(); },
    },
    scripting: {
      executeScript({ target, func, args }) {
        const result = typeof func === 'function' ? func(...(args || [])) : undefined;
        return Promise.resolve([{ result, frameId: 0 }]);
      }
    },
    commands: {
      onCommand: {
        addListener(cb) { commandListeners.push(cb); },
        removeListener(cb) { const i = commandListeners.indexOf(cb); if (i > -1) commandListeners.splice(i,1); },
      }
    },
    contextMenus: {
      items: [],
      create(opts) { this.items.push(opts); window.__mockBrowser.contextMenuItems.push(opts); return Promise.resolve(); },
      removeAll() { this.items = []; window.__mockBrowser.contextMenuItems = []; return Promise.resolve(); },
      onClicked: {
        addListener(cb) { contextMenuListeners.push(cb); },
        removeListener(cb) { const i = contextMenuListeners.indexOf(cb); if (i > -1) contextMenuListeners.splice(i,1); },
      }
    },
    storage: {
      local: {
        _store: {
          config: {
            temperature: 0.1, requestTimeout: 120,
            maxRPS: 5, maxTextLengthPerRequest: 1800, maxParagraphsPerRequest: 10,
            systemPrompt: 'You are a translator.',
            multiplePrompt: 'Translate {{from}} to {{to}}:\\n{{json}}',
            singlePrompt: 'Translate {{from}} to {{to}}:\\n{{text}}',
            aiContextAware: false, sourceLang: 'auto',
            scrollSyncEnabled: true,
            profiles: [
              { id: 'nvidia', name: 'NVIDIA NIM', apiUrl: 'https://integrate.api.nvidia.com/v1/chat/completions', apiKey: 'test-key', model: 'meta/llama-3.1-8b-instruct' },
              { id: 'llama-local', name: 'Llama Local (Ollama)', apiUrl: 'http://localhost:11434/v1/chat/completions', apiKey: '', model: 'llama3.1' },
              { id: 'mistral-local', name: 'Mistral Local (Ollama)', apiUrl: 'http://localhost:11434/v1/chat/completions', apiKey: '', model: 'mistral:7b' },
            ],
            activeProfileId: 'nvidia',
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
`;

// TypeScript augmentation for test files
declare global {
  interface Window {
    __mockBrowser: {
      sentMessages: Array<{ dir: string; msg?: any; opts?: any; id?: any }>;
      contextMenuItems: any[];
      dispatch(msg: any): void;
    };
    browser: {
      runtime: {
        onMessage: {
          addListener(cb: (msg: any, sender: any, sendResponse: any) => void): void;
          removeListener(cb: (msg: any, sender: any, sendResponse: any) => void): void;
        };
        getURL(path: string): string;
        sendMessage(msg: any): Promise<any>;
        openOptionsPage(): Promise<void>;
        onInstalled: {
          addListener(cb: () => void): void;
          removeListener(cb: () => void): void;
        };
      };
      tabs: {
        sendMessage(id: number, msg: any): Promise<any>;
        query(queryInfo: any): Promise<any[]>;
        create(opts: any): Promise<any>;
      };
      storage: {
        local: {
          _store: Record<string, any>;
          get(key: string | string[] | null): Promise<Record<string, any>>;
          set(obj: Record<string, any>): Promise<void>;
          remove(keys: string | string[]): Promise<void>;
        };
      };
    };
  }
}
export {};
