export {};
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ path: 'medreg_local_demo.html', enabled: true });
});
chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId) chrome.sidePanel.open({ tabId });
  });
});

// Passthrough de highlights al content script
chrome.runtime.onMessage.addListener((msg) => {
  const pass = ['highlight', 'highlightMany', 'highlightNegados', 'clearHighlights'];
  if (!pass.includes(msg?.action)) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, msg);
  });
});

/* ===========================
   Google Calendar (igual que antes)
   =========================== */
const GAPI = {
  token: null,
  getTokenInteractive() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (tkn) => {
        if (chrome.runtime.lastError || !tkn) return reject(chrome.runtime.lastError || new Error('no token'));
        GAPI.token = tkn; resolve(tkn);
      });
    });
  },
  async fetchJSON(url, opts = {}) {
    const token = GAPI.token || await GAPI.getTokenInteractive();
    const res = await fetch(url, {
      ...opts,
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) }
    });
    if (res.status === 401) {
      await new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
      GAPI.token = null; return GAPI.fetchJSON(url, opts);
    }
    if (!res.ok) {
      let msg = `Calendar API ${res.status}`;
      try { const j = await res.json(); msg += j?.error?.message ? `: ${j.error.message}` : ""; }
      catch { const t = await res.text(); if (t) msg += `: ${t}`; }
      throw new Error(msg);
    }
    return res.json();
  },
  listUpcoming(maxResults = 15) {
    const now = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(now)}&maxResults=${maxResults}`;
    return GAPI.fetchJSON(url);
  },
  createEvent({ summary, description, startISO, endISO }) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
    const body = { summary: summary || "(sin título)", description: description || "",
      start: { dateTime: startISO, timeZone: tz }, end: { dateTime: endISO, timeZone: tz } };
    return GAPI.fetchJSON(url, { method: "POST", body: JSON.stringify(body) });
  },
  async logout() {
    if (!GAPI.token) return;
    await new Promise(r => chrome.identity.removeCachedAuthToken({ token: GAPI.token }, r));
    GAPI.token = null;
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'GAPI_LOGIN')             { await GAPI.getTokenInteractive(); sendResponse({ ok: true }); }
      else if (msg?.type === 'GAPI_LOGOUT')       { await GAPI.logout();              sendResponse({ ok: true }); }
      else if (msg?.type === 'GAPI_LIST_EVENTS')  { const data = await GAPI.listUpcoming(15); sendResponse({ ok: true, data }); }
      else if (msg?.type === 'GAPI_CREATE_EVENT') { const data = await GAPI.createEvent(msg.payload || {}); sendResponse({ ok: true, data }); }
    } catch (e) { sendResponse({ ok: false, error: e?.message || String(e) }); }
  })();
  return true;
});

async function revokeTokenIfAny(token) {
  if (!token) return;
  try {
    await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  } catch {}
  await new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
}
async function logoutAll(clearAll) {
  try {
    if (typeof GAPI !== 'undefined' && GAPI.token) {
      await revokeTokenIfAny(GAPI.token); GAPI.token = null;
    } else {
      chrome.identity.getAuthToken({ interactive: false }, async (tkn) => { if (tkn) await revokeTokenIfAny(tkn); });
    }
    if (clearAll) { await chrome.storage.sync.clear(); await chrome.storage.local.clear(); }
    else { await chrome.storage.local.remove(['medreg.protocolos_cache','medreg.protocolos_selected','medreg.extractions']); }
    chrome.tabs.create({ url: 'https://accounts.google.com/Logout' });
  } catch (e) { throw e; }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try { if (msg?.type === 'GLOBAL_LOGOUT') { await logoutAll(!!msg.payload?.clearAll); sendResponse({ ok: true }); } }
    catch (e) { sendResponse({ ok: false, error: e?.message || String(e) }); }
  })(); return true;
});

/* ===========================
   OpenRouter – Helpers
   =========================== */
async function getOpenRouterKey() {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get(["openrouter_api_key"]),
    chrome.storage.sync.get(["openrouter_api_key", "medreg.openrouter_key"])
  ]);
  return (local.openrouter_api_key || sync.openrouter_api_key || sync["medreg.openrouter_key"] || "");
}
function getRefererForOR() {
  return { "HTTP-Referer": "https://medex.ar", "X-Title": "MedReg Deep Agent" };
}
/* ========================= AGENTE DEEP — background.js (bloque completo) ========================= */
/* ========================= AGENTE DEEP — background.js (bloque completo) ========================= */
// === Canal con el sidebar (sidePanel) ===
// === Puerto con el sidebar (UI) ===
let AGENT_UI_PORT = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "MEDREG_AGENT") return;
  AGENT_UI_PORT = port;

  port.onDisconnect.addListener(() => {
    if (AGENT_UI_PORT === port) AGENT_UI_PORT = null;
  });

  port.onMessage.addListener(async (msg) => {
    try {
      if (!msg) return;

      if (msg.type === "RUN_AGENT") {
        const mission = msg.payload?.prompt || msg.payload?.mission || "";
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { uiResult("No hay pestaña activa."); return; }

        const ok = await ensureContent(tab.id);
        if (!ok) { uiResult("No pude inyectar el content script en esta página."); return; }

        await runDeepAgent_Echo(tab.id, mission);
        return;
      }
    } catch (e) {
      uiLog("Error: " + (e?.message || String(e)));
    }
  });
});



// ===== AGENTE DEEP (mínimo, solo Evoluciones/echo) =====
function uiLog(txt) {
  try { AGENT_UI_PORT?.postMessage({ type: "LOG", message: String(txt) }); } catch(_) {}
}
function uiResult(txt) {
  try { AGENT_UI_PORT?.postMessage({ type: "RESULT_ANSWER", payload: { answer: String(txt) } }); } catch(_) {}
}


async function ensureContent(tabId) {
  try {
    // ping
    const pong = await chrome.tabs.sendMessage(tabId, { kind: 'MEDREG_PING' });
    return pong?.ok === true;
  } catch {
    // inyectar si no está
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["web-content.js"]
    });
    await new Promise(r => setTimeout(r, 120));
    try {
      const pong2 = await chrome.tabs.sendMessage(tabId, { kind: 'MEDREG_PING' });
      return pong2?.ok === true;
    } catch { return false; }
  }
}


// Enviar mensaje al content, asegurando previamente la inyección
async function agentSendToContent(tabId, payload) {
  const ok = await ensureContent(tabId);
  if (!ok) throw new Error('content_script_not_ready');
  return await chrome.tabs.sendMessage(tabId, payload);
}

async function runDeepAgent_Echo(tabId, missionText) {
  uiLog('Agente iniciado (paciente actual).');
  uiLog('LLM paso 1. Descubriendo timeline...');
await agentSendToContent(tabId, { kind: 'AGENT:OPEN_BY_LABEL', labels: ['Ecocardiograma', 'Control de resultados'] });


  if (!tl?.ok || !tl.total) {
    uiLog('No se detectó el "Historial de registros de HC".');
    uiResult('Revisión incompleta (no timeline).');
    return;
  }
  uiLog(`Timeline detectado (${tl.total} ítems).`);

  // PASO 2: abrir la 3.ª evolución (índice 2)
  const targetIndex = Math.min(2, tl.total - 1);
  uiLog(`LLM paso 2. Abriendo evolución #${targetIndex + 1}…`);
  await agentSendToContent(tabId, { kind: 'AGENT:OPEN_NTH', n: targetIndex });
  let res = await agentSendToContent(tabId, { kind: 'AGENT:SCRAPE_LAST_ECHO' });

  // Fallback 1: por etiqueta (Ecocardiograma / Control de resultados)
  if (!res?.ok || !res.echo) {
    uiLog('No se encontró ECO en esa evolución. Probando por etiqueta…');
    await agentSendToContent(tabId, { kind: 'AGENT:OPEN_BY_LABEL', labels: ['Ecocardiograma', 'Control de resultados'] });
    res = await agentSendToContent(tabId, { kind: 'AGENT:SCRAPE_LAST_ECHO' });
  }

  // Fallback 2: iterar siguientes evoluciones (hasta 6)
  if (!res?.ok || !res.echo) {
    uiLog('Sin match directo. Iterando siguientes evoluciones…');
    for (let i = targetIndex + 1; i < Math.min(targetIndex + 6, tl.total); i++) {
      await agentSendToContent(tabId, { kind: 'AGENT:OPEN_NTH', n: i });
      const probe = await agentSendToContent(tabId, { kind: 'AGENT:SCRAPE_LAST_ECHO' });
      if (probe?.ok && probe.echo) { res = probe; break; }
      await new Promise(r => setTimeout(r, 180));
    }
  }

  uiLog('LLM paso 3. Extrayendo resultado del ECO de la evolución abierta…');
  if (res?.ok && res.echo) {
    uiResult(`Último Ecocardiograma:\n• ${res.echo}`);
  } else {
    uiResult('No se identificó texto de Ecocardiograma.');
  }
}


// Hook del botón "Activar Agente"
async function onActivateAgentClicked(missionText) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { uiResult('No hay pestaña activa.'); return; }

  const ready = await ensureContent(tab.id);
  if (!ready) { uiResult('No pude inyectar el content script en esta página.'); return; }

  await runDeepAgent_Echo(tab.id, missionText || '');
}
// ===== END AGENTE DEEP =====
