// chrome-shim.js — habilita el demo fuera de la extensión (GitHub Pages)
(function () {
  const w = window;
  // pequeño sistema de eventos para simular onChanged / onMessage
  function createEvent() {
    const handlers = new Set();
    return {
      addListener(fn) { if (typeof fn === 'function') handlers.add(fn); },
      removeListener(fn) { handlers.delete(fn); },
      hasListener(fn) { return handlers.has(fn); },
      _dispatch(...args) { handlers.forEach(h => { try { h(...args); } catch(e){ console.warn(e); } }); }
    };
  }
  // storage "fake" usando localStorage
  function createStorageArea(areaName) {
    const prefix = `medreg.${areaName}.`;
    const onChanged = chrome.storage.onChanged; // compartido
    async function get(keys) {
      const out = {};
      if (!keys) { // devolver TODO lo que tenga ese prefijo
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k));
          }
        }
        return out;
      }
      const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
      for (const k of list) {
        const v = localStorage.getItem(prefix + k);
        out[k] = v != null ? JSON.parse(v) : (typeof keys === 'object' ? keys[k] : undefined);
      }
      return out;
    }
    async function set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj || {})) {
        const full = prefix + k;
        const oldRaw = localStorage.getItem(full);
        const oldValue = oldRaw != null ? JSON.parse(oldRaw) : undefined;
        localStorage.setItem(full, JSON.stringify(v));
        changes[k] = { oldValue, newValue: v };
      }
      if (Object.keys(changes).length) onChanged._dispatch(changes, areaName);
    }
    async function remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      for (const k of list) {
        const full = prefix + k;
        const oldRaw = localStorage.getItem(full);
        const oldValue = oldRaw != null ? JSON.parse(oldRaw) : undefined;
        localStorage.removeItem(full);
        changes[k] = { oldValue, newValue: undefined };
      }
      if (Object.keys(changes).length) chrome.storage.onChanged._dispatch(changes, areaName);
    }
    async function clear() {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      for (const k of toRemove) localStorage.removeItem(k);
      // no disparamos cambios masivos aquí
    }
    return { get, set, remove, clear };
  }

  // Asegurá/extendé window.chrome sin pisar lo que ya exista
  if (!w.chrome) w.chrome = {};
  const c = w.chrome;

  if (!c.runtime) c.runtime = { lastError: null, onMessage: createEvent(), sendMessage: () => {} };
  if (!c.scripting) c.scripting = { executeScript: async () => {} };
  if (!c.tabs) c.tabs = {
    async query(){ return [{ id: 1, url: location.href, active: true }]; },
    sendMessage(){ /* noop en demo */ }
  };

  if (!c.storage) c.storage = {};
  if (!c.storage.onChanged) c.storage.onChanged = createEvent();
  if (!c.storage.local) c.storage.local = createStorageArea('local');
  if (!c.storage.sync) c.storage.sync = createStorageArea('sync');
  if (!c.storage.session) c.storage.session = createStorageArea('session');

  console.info('[MedReg Demo] shim chrome.* activo (modo web).');
})();
