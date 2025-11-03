// ===================== MedReg Sidebar  medreg_local_demo.js =====================

let estudios = JSON.parse(localStorage.getItem("estudiosMedReg") || "{}");
let baseAutocompletado = JSON.parse(localStorage.getItem("baseAutocompletado") || "[]");
let terminologiaMedica = {};
const STORAGE_KEY_EXTRACT = "medreg.extractions";
const API_BASE = (localStorage.getItem('medreg_api') || 'https://medreg-backend.onrender.com').replace(/\/+$/,'');
const NOTAS_KEY = 'medreg_notas_v1';

// ===== Registro de casos (sesiÃ³n)
const SESSION_ROWS_KEY = 'medreg.session_rows_v1';

// ===================== Drag&Drop para Extracciones y Chat =====================
(function enableDragDropForExtractionsAndChat(){
  function normalizeText(s){
    if(!s) return '';
    return s.replace(/\u00A0/g,' ')
            .replace(/\s+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
  }
  async function getTextFromDataTransfer(dt){
    let t = dt.getData?.('text/plain');
    if(t) return t;
    if(dt.items && dt.items.length){
      for(const it of dt.items){
        if(it.kind === 'string' && it.type === 'text/plain'){
          t = await new Promise(res=>it.getAsString(res));
          if(t) return t;
        }
      }
    }
    if(dt.files && dt.files.length){
      const f = dt.files[0];
      if(f && f.type.startsWith('text/')) return await f.text();
    }
    const html = dt.getData?.('text/html');
    if(html){
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return tmp.textContent || tmp.innerText || '';
    }
    return '';
  }
  function makeDropTarget(rootEl, {onText, highlightClass='dragover'}){
    if(!rootEl) return;
    const onEnterOver = (e)=>{
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      rootEl.classList.add(highlightClass);
    };
    const onLeaveEnd = ()=> rootEl.classList.remove(highlightClass);

    rootEl.addEventListener('dragenter', onEnterOver, {capture:true});
    rootEl.addEventListener('dragover', onEnterOver, {capture:true});
    rootEl.addEventListener('dragleave', onLeaveEnd, {capture:true});
    rootEl.addEventListener('dragend', onLeaveEnd, {capture:true});
    rootEl.addEventListener('drop', async (e)=>{
      e.preventDefault(); onLeaveEnd();
      const raw = await getTextFromDataTransfer(e.dataTransfer);
      const txt = normalizeText(raw);
      if(txt) onText(txt);
    }, {capture:true});
    rootEl.addEventListener('paste', (e)=>{
      const pasted = e.clipboardData?.getData('text/plain');
      if(pasted){
        e.preventDefault();
        const txt = normalizeText(pasted);
        if(txt) onText(txt);
      }
    });
  }

  // handler real para agregar extracciÃ³n
  const addExtraction =
    window.addManualExtraction
    || window.addToExtractionList
    || function(txt){
         window.dispatchEvent(new CustomEvent('medreg:addExtraction', {detail:{ text: txt }}));
       };

  const extractionBox = document.getElementById('extractionList') || document.getElementById('extractionsList');
if (extractionBox) {
  makeDropTarget(extractionBox, { onText: (txt)=> addExtraction(txt) });


  window.makeDropTarget = makeDropTarget;
}

// Chat: permitir Pegar, pero bloquear Drag&Drop para evitar duplicados
const chatBox = document.getElementById('ai-chat-composer');
const chatInput =
  document.querySelector('#ai_question, #chatInput, #chat-textarea, textarea#chat, #iaInput, .ai-input textarea, #aiChatInput, #ai-chat-input')
  || document.querySelector('#ai-chat-composer textarea, #ai-chat-composer input[type="text"]');

if (chatBox) {
  // bloquear dragover/drop
  chatBox.addEventListener('dragover', (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='none'; }, {capture:true});
  chatBox.addEventListener('drop', (e)=>{ e.preventDefault(); }, {capture:true});

  // pero permitir Pegar (clipboard → al input)
  chatBox.addEventListener('paste', (e)=>{
    const pasted = e.clipboardData?.getData('text/plain');
    if (pasted && chatInput) {
      e.preventDefault();
      const sep = chatInput.value?.trim()?.length ? '\n\n' : '';
      chatInput.value = (chatInput.value || '') + sep + pasted.trim();
      try{ chatInput.focus(); }catch(_){}
    }
  }, {capture:true});
}})();

async function addManualExtractionImpl(txt, meta = {}) {
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    tabId: meta.tabId || null,
    title: meta.title || "Pegado / Drop manual",
    url: meta.url || "",
    timestamp: Date.now(),
    rawText: String(txt || ""),
    classified: null,
  };
  const list = await loadExtractions();
  list.unshift(item);
  await saveExtractions(list);
  renderExtractions(list);
}
window.addManualExtraction = addManualExtractionImpl;

window.addEventListener('medreg:addExtraction', async (e)=>{
  const txt = e.detail?.text;
  if(!txt) return;
  await addManualExtractionImpl(txt);
});


function syncExtractionWidth(){
  // Mantener 100% por CSS; no fuerces width en px para evitar 0px en montajes tempranos
  const panel = document.getElementById('extractionList');
  if (panel) panel.style.width = ''; // limpia cualquier width inline previo
}
window.addEventListener('resize', syncExtractionWidth);
document.addEventListener('DOMContentLoaded', syncExtractionWidth);
setTimeout(syncExtractionWidth, 200);



//////////////////////////////////////////////////////////////////////////// 01-11
// Al final del IIFE de drag&drop o en DOMContentLoaded:
(function enableDnDInvestigador(){
  const root = document.getElementById('extractionListInv');
  if (!root) return;

  function addInv(text) {
    window.dispatchEvent(new CustomEvent('medreg:addExtractionInv', { detail: { text } }));
  }
  // Reuso la infra existente de DnD/paste
  if (typeof makeDropTarget === 'function') {
    makeDropTarget(root, { onText: (txt) => addInv(txt) });
  }

  // Handler para agregar items a la lista INV
  window.addEventListener('medreg:addExtractionInv', async (e) => {
    const text = (e.detail?.text || '').trim();
    if (!text) return;
    const all = await loadInvExtractions();
    all.unshift({ id: crypto.randomUUID(), rawText: text, ts: Date.now() });
    await saveInvExtractions(all);
    renderInvExtractions(all);
  });
})();



document.getElementById('btnExtractHCInv')?.addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !isInjectableUrl(tab.url)) {
      alert('Abrí la HCE en una pestaña http/https para extraer.');
      return;
    }
    const ok = await ensureContentScript(tab.id);
    if (!ok) { alert('No pude conectar con la página. Probá recargar.'); return; }

    const resp = await new Promise(res => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'MEDREG_EXTRACT_DOM' },
        r => { void chrome.runtime.lastError; res(r || null); }
      );
    });


    
    const raw = (resp?.rawText || resp?.text || '').trim();
    if (!raw) { alert('No encontré texto en la HCE.'); return; }

const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// ...luego de obtener `raw`:
const all = await loadInvExtractions();

// 🚫 Si ya existe una extracción igual, no la agregamos
if (all.some(x => norm(x.rawText) === norm(raw))) {
  toast('Esa extracción ya estaba en la lista', 'warn');
  return;
}

all.unshift({ id: (crypto.randomUUID?.() || String(Date.now())), rawText: raw, ts: Date.now() });
await saveInvExtractions(all);
renderInvExtractions(all);

    

    // asegurar que quede visible el bloque de extracciones y el row de análisis
    document.getElementById('investigadorExtractions')?.style.removeProperty('display');
    document.getElementById('investigadorAnalisisRow')?.style.removeProperty('display');
  } catch (e) {
    console.error('[MedReg] Extraer HC (Inv):', e);
  }
});


document.getElementById('btnAnalizar')?.addEventListener('click', async () => {
  document.getElementById('investigadorExtractions')?.style.removeProperty('display');
  document.getElementById('investigadorAnalisisRow')?.style.removeProperty('display');
});

///////////////////////////////////////////////////////////////////////////////////////


// === Negaciones v3: misma lÃ­nea + â€œno â€¦, X, ni Yâ€ ===
const NEGADORES = ["niega","niega:","no","sin","descarta","niega antecedentes","niega antecedentes de"];
const ANULADORES = ["excepto","pero","aunque","salvo","sin embargo"];
function negacionListaNiega(beforeText) { return /\bniega(\s+antecedentes(\s+de)?)?\b\s*:?\s*$/i.test(beforeText); }
function negadorAntesEnMismaLinea(beforeText) {
  const rxNeg = /\b(niega(?:\s+antecedentes(?:\s+de)?)?|no|sin|descarta)\b/gi;
  let m, lastIdx = -1;
  while ((m = rxNeg.exec(beforeText)) !== null) lastIdx = m.index;
  if (lastIdx < 0) return false;
  const scope = beforeText.slice(lastIdx);
  if (/\b(excepto|pero|aunque|salvo|sin embargo)\b/i.test(scope)) return false;
  return true;
}
function isNegatedForTerm(text, matchIndex) {
  const raw = text || "";
  const lineStart = raw.lastIndexOf("\n", matchIndex);
  const lineEnd   = raw.indexOf("\n", matchIndex);
  const start = lineStart === -1 ? 0 : lineStart + 1;
  const end   = lineEnd   === -1 ? raw.length : lineEnd;
  const lineFull = raw.slice(start, end);
  const before   = sinAcentos(lineFull.slice(0, matchIndex - start));
  if (negacionListaNiega(before)) return true;
  if (negadorAntesEnMismaLinea(before)) return true;
  return false;
}

// ===================== Utils =====================
function sinAcentos(s) { return (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(); }
function fmt(ts) { try { return new Date(ts).toLocaleString(); } catch { return String(ts); } }
function lev(a, b) {
  a = sinAcentos(a); b = sinAcentos(b);
  const m = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + 1);
    }
  }
  return m[b.length][a.length];
}

// ===================== Carga de terminologÃ­a (incluye subcategorÃ­a) =====================
// ===================== Carga de terminologÃ­a (+sub2 y otros Ã­ndices) =====================
// ===== Ã­ndices globales =====
let termIndex = {
  byKey: new Map(),      // keyNorm -> { categoria, clave, sinonimos[], subcategoria, sub2 }
  byCat: new Map(),      // catNorm -> Map(keyNorm -> ref)
  bySub2: new Map(),     // sub2Norm -> Set<string> (claves y sinÃ³nimos)
  bySubcat: new Map()    // subcatNorm -> Set<string> (claves)
};
let canonIndex = new Map(); // termNorm -> clave canÃ³nica

function putCanon(term, claveCanon) {
  if (!term) return;
  const k = sinAcentos(term);
  if (!canonIndex.has(k)) canonIndex.set(k, claveCanon);
}
function resolveCanon(term) {
  return canonIndex.get(sinAcentos(term)) || term;
}

async function cargarTerminologia() {
  if (Object.keys(terminologiaMedica).length) return baseAutocompletado;

  const resp = await fetch("terminologia_medica.json");
  const lista = await resp.json();

  terminologiaMedica = {};
  termIndex = { byKey: new Map(), byCat: new Map(), bySub2: new Map(), bySubcat: new Map() };
  canonIndex = new Map();
  const base = [];

  for (const item of lista) {
    const cat = item.categoria;
    const subcat = item.subcategoria || cat;
    const sub2 = item.sub2 || "";
    const clave = item.clave;
    const sinonimos = (item.sinonimos || []).filter(Boolean);

    const catNorm = sinAcentos(cat || "");
    const keyNorm = sinAcentos(clave);
    const subcatNorm = sinAcentos(subcat);
    const sub2Norm = sinAcentos(sub2);

    // estructura para UI
    if (!terminologiaMedica[cat]) terminologiaMedica[cat] = {};
    terminologiaMedica[cat][clave] = sinonimos;
    base.push({ categoria: cat, clave, sinonimos, subcategoria: subcat, sub2 });

    // Ã­ndices
    if (!termIndex.byCat.has(catNorm)) termIndex.byCat.set(catNorm, new Map());
    termIndex.byCat.get(catNorm).set(keyNorm, { categoria: cat, clave, sinonimos, subcategoria: subcat, sub2 });

    termIndex.byKey.set(keyNorm, { categoria: cat, clave, sinonimos, subcategoria: subcat, sub2 });

    // bySub2: familia â†’ claves+sinÃ³nimos
    if (sub2) {
      if (!termIndex.bySub2.has(sub2Norm)) termIndex.bySub2.set(sub2Norm, new Set());
      termIndex.bySub2.get(sub2Norm).add(clave);
      sinonimos.forEach(s => termIndex.bySub2.get(sub2Norm).add(s));
    }

    // bySubcat: subcategorÃ­a â†’ claves
    if (!termIndex.bySubcat.has(subcatNorm)) termIndex.bySubcat.set(subcatNorm, new Set());
    termIndex.bySubcat.get(subcatNorm).add(clave);

    // canonizador: clave y sinÃ³nimos â†’ clave canÃ³nica
    putCanon(clave, clave);
    sinonimos.forEach(s => putCanon(s, clave));
  }

  baseAutocompletado = base;
  localStorage.setItem("baseAutocompletado", JSON.stringify(baseAutocompletado));
  try { if (typeof rebuildIndices === "function") rebuildIndices(); } catch(e) { console.warn("rebuildIndices error", e); }
  return baseAutocompletado;
}


// Devuelve una LISTA de claves canÃ³nicas destino para un criterio elegido
function resolverDestinosParaCriterio(categoria, elegido) {
  const out = new Set();
  const eNorm = sinAcentos(elegido || "");
  const catNorm = sinAcentos(categoria || "");

  // 1) Â¿Es una clave o sinÃ³nimo? â†’ clave canÃ³nica
  const canon = canonIndex.get(eNorm);
  if (canon) {
    out.add(canon);
    return Array.from(out);
  }

  // 2) Â¿Coincide con una subcategorÃ­a? â†’ todas sus claves
  const sBySubcat = termIndex.bySubcat.get(eNorm);
  if (sBySubcat && sBySubcat.size) {
    sBySubcat.forEach(k => out.add(k));
    return Array.from(out);
  }

  // 3) Â¿Coincide con un sub2? â†’ todas sus claves (via bySub2 pero filtrar a la categorÃ­a si querÃ©s)
  const sBySub2 = termIndex.bySub2.get(eNorm);
  if (sBySub2 && sBySub2.size) {
    // agrego SOLO claves (no sinÃ³nimos) cuando existan en la categorÃ­a
    const catMap = termIndex.byCat.get(catNorm) || new Map();
    for (const t of sBySub2) {
      const tNorm = sinAcentos(typeof t === "string" ? t : "");
      const row = catMap.get(tNorm) || termIndex.byKey.get(tNorm);
      if (row?.clave) out.add(row.clave);
    }
    if (out.size) return Array.from(out);
  }

  // 4) Fallback: si nada matchea, devolvemos el propio texto como â€œclaveâ€
  out.add(elegido);
  return Array.from(out);
}

// ===================== Reglas de cruce (inferencias) =====================
// ===================== Reglas de cruce (inferencias) =====================
let reglasInferIndex = new Map(); // destinoNorm -> Set(orÃ­genes a buscar)

async function cargarReglasCruce() {
  try {
    const r = await fetch("reglas_cruce.json", { cache: "no-store" });
    const json = await r.json();

    reglasInferIndex = new Map();

    // utilidades
    const norm = (s)=> (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const ensureSet = (dest) => {
      const d = norm(dest);
      if (!reglasInferIndex.has(d)) reglasInferIndex.set(d, new Set());
      return reglasInferIndex.get(d);
    };
    const addTerm = (set, t) => { if (t) set.add(t); };

    // expande el "if" a una lista de tÃ©rminos reales (claves + sinÃ³nimos)
    function expandIfToTerms(src){
      const out = new Set();
      if (!src?.cat) return Array.from(out);
      const catNorm = norm(src.cat);

      // 1) por clave explÃ­cita
      if (src.clave) {
        const row = termIndex.byKey.get(norm(src.clave));
        if (row) {
          addTerm(out, row.clave);
          (row.sinonimos||[]).forEach(s => addTerm(out, s));
        } else {
          addTerm(out, src.clave);
        }
      }

      // 2) por subcategoria
      const subcat = src.subcategoria || src.sub; // aceptar ambos nombres
      if (subcat) {
        const sc = termIndex.bySubcat.get(norm(subcat));
        if (sc && sc.size) {
          sc.forEach(k=>{
            const row = termIndex.byKey.get(norm(k));
            if (row && norm(row.categoria)===catNorm){
              addTerm(out, row.clave);
              (row.sinonimos||[]).forEach(s=> addTerm(out, s));
            }
          });
        }
      }

      // 3) por sub2 (familia)
      if (src.sub2) {
        const fam = termIndex.bySub2.get(norm(src.sub2));
        if (fam && fam.size) {
          fam.forEach(t=>{
            const row = termIndex.byKey.get(norm(t));
            if (row && norm(row.categoria)===catNorm){
              addTerm(out, row.clave);
              (row.sinonimos||[]).forEach(s=> addTerm(out, s));
            } else {
              addTerm(out, t);
            }
          });
        }
      }
      return Array.from(out);
    }

    // A) soporte formato if/then (el actual)
    if (Array.isArray(json)) {
      for (const rule of json) {
        if (!rule?.if || !Array.isArray(rule?.then)) continue;
        const origenes = expandIfToTerms(rule.if);
        for (const dst of rule.then) {
          if (!dst?.clave) continue;
          const set = ensureSet(dst.clave);
          origenes.forEach(t => set.add(t));
        }
      }
    }

    // B) compatibilidad con formatos viejos (opcionales)
    if (json && !Array.isArray(json)) {
      for (const [dest, arr] of Object.entries(json || {})) {
        const set = ensureSet(dest);
        (arr||[]).forEach(t => set.add(t));
      }
    }

  } catch (e) {
    console.warn("[MedReg] No pude cargar reglas_cruce.json:", e);
  }
}

// ===================== NavegaciÃ³n entre secciones =====================
function showOnly(section) {
  const map = {
    registro: document.getElementById("registroLocalSection"),
    protocolos: document.getElementById("protocolosSection"),
    chat: document.getElementById("chatSection"),
    notas: document.getElementById("notasSection"),
    agenda: document.getElementById("agendaSection"),
        agente: document.getElementById("agenteDeepSection"),
  };
  Object.values(map).forEach(el => { if (el) el.style.display = "none"; });
  if (section && map[section]) map[section].style.display = "";

  const btns = [
    ["btnRegistroLocal","registro"],
    ["btnProtocolos","protocolos"],
    ["btnChatIA","chat"],
    ["btnNotas","notas"],
    ["btnAgenda","agenda"],
       ["btnAgenteDeep","agente"],
  ];
  btns.forEach(([id, sec]) => {
    const b = document.getElementById(id);
    if (!b) return;
    if (section === sec) b.classList.add("active"); else b.classList.remove("active");
  });
}

// ===================== Extracciones (historial) =====================
async function loadExtractions() {
  const { [STORAGE_KEY_EXTRACT]: arr } = await chrome.storage.local.get(STORAGE_KEY_EXTRACT);
  return Array.isArray(arr) ? arr : [];
}
async function saveExtractions(list) { await chrome.storage.local.set({ [STORAGE_KEY_EXTRACT]: list }); }
function renderExtractions(list) {
  const cont = document.getElementById("extractionsList");
  const empty = document.getElementById("extractionsEmpty");
  if (!cont || !empty) return;

  cont.innerHTML = "";
  if (!list.length) { empty.style.display = ""; return; }
  empty.style.display = "none";

  const trimTxt = (s, n=70)=> {
    const t = String(s||'').replace(/\s+/g,' ').trim();
    return t.length>n ? t.slice(0,n) + "…" : t;
  };

  for (const item of list) {
const div = document.createElement("div");
div.className = "ex-item";
div.dataset.id = item.id;

const name = document.createElement("div");
name.className = "ex-name";
const isManual = !item.url || (item.title||"").toLowerCase().includes("pegado / drop");
const trimTxt = (s, n=70)=> {
  const t = String(s||'').replace(/\s+/g,' ').trim();
  return t.length>n ? t.slice(0,n) + "…" : t;
};
name.textContent = isManual ? trimTxt(item.rawText) : (item.title || "Extracción");
name.title = isManual ? (item.rawText||'').slice(0,500) : (item.title||'');

const actions = document.createElement("div");
actions.className = "ex-actions";
const btnDel = document.createElement("button");
btnDel.textContent = "×"; // X clara
btnDel.setAttribute('aria-label','Eliminar');
btnDel.title = "Eliminar extracción";
btnDel.addEventListener("click", async () => {
  const all = await loadExtractions();
  const next = all.filter((x) => x.id !== item.id);
  await saveExtractions(next);
  renderExtractions(next);
});

actions.appendChild(btnDel);
div.appendChild(name);
div.appendChild(actions);
cont.appendChild(div);
  }
}

(function setupLiveRefresh() {
  const KEY = "medreg.extractions";
  let rafId = null;
  function scheduleRender(list) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => { renderExtractions(Array.isArray(list) ? list : []); });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[KEY]) return;
    const next = changes[KEY].newValue || [];
    scheduleRender(next);
  });
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg && msg.type === "MEDREG_STORAGE_UPDATED") {
      const { [KEY]: arr } = await chrome.storage.local.get(KEY);
      scheduleRender(arr || []);
    }
  });
})();

//////////////////////////////////////////////////////////////////////////////////////////////// 01-11 - Investigador

// --- Investigador: storage y helpers independientes del chat ---
const STORAGE_KEY_EXTRACT_INV = "medreg.extractions.inv";

async function loadInvExtractions() {
  const { [STORAGE_KEY_EXTRACT_INV]: arr } = await chrome.storage.local.get(STORAGE_KEY_EXTRACT_INV);
  return Array.isArray(arr) ? arr : [];
}
async function saveInvExtractions(list) {
  await chrome.storage.local.set({ [STORAGE_KEY_EXTRACT_INV]: Array.isArray(list) ? list : [] });
  // NO disparamos MEDREG_STORAGE_UPDATED para no mezclar con el chat
}

function renderInvExtractions(list) {
  const cont = document.getElementById('extractionsListInv');
  const empty = document.getElementById('extractionsEmptyInv');
  if (!cont || !empty) return;

  cont.innerHTML = '';
  const arr = Array.isArray(list) ? list : [];
  if (arr.length === 0) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  arr.forEach(item => {
    const row = document.createElement('div');
    row.className = 'extraction-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between';

    const txt = document.createElement('div');
    txt.textContent = (item.rawText || '').slice(0, 200);
    txt.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Eliminar';
    del.style.cssText = 'width:auto;background:#ef4444;border:none;color:#fff;padding:2px 8px;border-radius:6px';
    del.addEventListener('click', async () => {
      const all = await loadInvExtractions();
      const next = all.filter(x => x.id !== item.id);
      await saveInvExtractions(next);
      renderInvExtractions(next);
    });

    row.appendChild(txt);
    row.appendChild(del);
    cont.appendChild(row);
  });
}


// ===================== Protocolos (backend) =====================
const PROTO_URL = "https://raw.githubusercontent.com/nicoredo/medex-backend/main/criterios_estudios_textual.json";
const PROTO_CACHE_KEY = "medreg.protocolos_cache";
const PROTO_TTL_MS = 60 * 60 * 1000;
const PROTO_SEL_KEY = "medreg.protocolos_selected";

async function getSelectedProtocolos() {
  const { [PROTO_SEL_KEY]: arr } = await chrome.storage.local.get(PROTO_SEL_KEY);
  return new Set(Array.isArray(arr) ? arr : []);
}
async function setSelectedProtocolos(setIds) { await chrome.storage.local.set({ [PROTO_SEL_KEY]: Array.from(setIds || []) }); }
async function getCachedProtocolos() {
  const { [PROTO_CACHE_KEY]: cache } = await chrome.storage.local.get(PROTO_CACHE_KEY);
  if (!cache) return null;
  if (!cache.ts || Date.now() - cache.ts > PROTO_TTL_MS) return null;
  return cache.data || null;
}
async function setCachedProtocolos(data) { await chrome.storage.local.set({ [PROTO_CACHE_KEY]: { ts: Date.now(), data } }); }
function normalizeEstudio(item, idx = 0) {
  const nombre = item?.nombre || item?.name || item?.titulo || item?.title || `Estudio ${idx + 1}`;
  const descripcion = item?.descripcion || item?.descripcion_larga || item?.description || item?.detalle || "";
  return { nombre: String(nombre), descripcion: String(descripcion) };
}
async function renderProtocolosList(data) {
  const cont = document.getElementById("protocolosSection");
  if (!cont) return;
  if (!cont.querySelector("#protoHeader")) {
    const header = document.createElement("div");
    header.id = "protoHeader";
    header.className = "categoria";
    header.innerHTML = `
      <label style="display:flex;align-items:center;justify-content:space-between">
        <span>Estudios vigentes</span>
        <span style="display:flex;gap:6px;align-items:center">
          <span id="protoCount" style="font-size:12px;color:#475569"></span>
          <button id="btnProtoRefresh" title="Recargar">âŸ³</button>
        </span>
      </label>
      <div style="display:flex;gap:8px;margin:6px 0 0 0">
        <button id="btnProtoAll">Seleccionar todo</button>
        <button id="btnProtoNone">Ninguno</button>
      </div>
      <div id="protoList" style="margin-top:6px;"></div>
    `;
    cont.prepend(header);
    header.querySelector("#btnProtoRefresh").addEventListener("click", async () => { await loadProtocolos({ force: true }); });
    header.querySelector("#btnProtoAll").addEventListener("click", async () => {
      const setSel = new Set(data.map((_, i) => i));
      await setSelectedProtocolos(setSel);
      await renderProtocolosList(data);
    });
    header.querySelector("#btnProtoNone").addEventListener("click", async () => {
      await setSelectedProtocolos(new Set());
      await renderProtocolosList(data);
    });
  }
  const list = cont.querySelector("#protoList");
  const counter = cont.querySelector("#protoCount");
  list.innerHTML = "";
  const selected = await getSelectedProtocolos();

  if (!Array.isArray(data) || data.length === 0) {
    list.innerHTML = `<div style="font-size:13px;color:#64748b">No se encontraron estudios.</div>`;
    if (counter) counter.textContent = "";
    return;
  }
  const normalized = data
    .map((item, i) => ({ i, ...normalizeEstudio(item, i) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

  normalized.forEach((est) => {
    const card = document.createElement("label");
    card.style.cssText =
      "display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin:8px 0; cursor:pointer;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selected.has(est.i);
    cb.setAttribute("data-idx", String(est.i));
    cb.style.marginTop = "3px";
    const info = document.createElement("div");
    info.style.flex = "1";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;color:#0d47a1;margin-bottom:4px";
    title.textContent = est.nombre;
    const desc = document.createElement("div");
    desc.style.cssText = "font-size:13px;color:#475569;white-space:pre-wrap";
    desc.textContent = est.descripcion || "<sin descripciÃ³n>";
    info.appendChild(title); info.appendChild(desc);
    card.appendChild(cb); card.appendChild(info); list.appendChild(card);
    cb.addEventListener("change", async (e) => {
      const idx = Number(e.currentTarget.getAttribute("data-idx"));
      const setSel = await getSelectedProtocolos();
      if (e.currentTarget.checked) setSel.add(idx); else setSel.delete(idx);
      await setSelectedProtocolos(setSel);
      if (counter) counter.textContent = `${setSel.size} seleccionado(s)`;
    });
  });
  if (counter) counter.textContent = `${selected.size} seleccionado(s)`;
}
async function fetchProtocolosRaw() {
  const resp = await fetch(PROTO_URL, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  const arr = Array.isArray(json) ? json : Array.isArray(json?.estudios) ? json.estudios : [];
  return arr;
}
async function loadProtocolos({ force = false } = {}) {
  const cont = document.getElementById("protoList");
  if (cont) cont.innerHTML = `<div style="font-size:13px;color:#64748b">Cargandoâ€¦</div>`;
  try {
    let data = null;
    if (!force) data = await getCachedProtocolos();
    if (!data) { data = await fetchProtocolosRaw(); await setCachedProtocolos(data); }
    renderProtocolosList(data);
  } catch (e) {
    console.error("[MedReg] Error cargando protocolos:", e);
    if (cont) {
      cont.innerHTML = `
        <div style="font-size:13px;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;padding:8px;border-radius:8px">
          No se pudo cargar la lista desde el backend.<br/>
          RevisÃ¡ permisos de red o abrÃ­ el JSON en otra pestaÃ±a para confirmar:
          <a href="${PROTO_URL}" target="_blank" rel="noreferrer">criterios_estudios_textual.json</a>
        </div>`;
    }
  }
}

// ===================== IntegraciÃ³n con la HCE =====================
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
function isInjectableUrl(url = "") { return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url); }
function pingContentScript(tabId, timeoutMs = 600) {
  return new Promise((resolve) => {
    let done = false;
    try {
      chrome.tabs.sendMessage(tabId, { type: "MEDREG_PING" }, () => {
        if (!done) { done = true; resolve(true); }
      });
    } catch (_) {}
    setTimeout(() => { if (!done) resolve(false); }, timeoutMs);
  });
}
async function ensureContentScript(tabId) {
  const okPing1 = await pingContentScript(tabId);
  if (okPing1) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["web-content.js", "highlight-content.js"] });
  } catch (e) { console.warn("[MedReg] executeScript no permitido en esta URL:", e); }
  const okPing2 = await pingContentScript(tabId);
  return okPing2;
}

// ===================== Autocompletado (DATALIST) clave â€” subcategorÃ­a =====================
function cargarDatalistPorCategoria(categoriaActual) {
  const lista = document.getElementById("sugerencias");
  if (!lista) return;
  lista.innerHTML = "";

  const { claves, subcats, sub2s } = getTermSetsByCategory(categoriaActual);

  // â€” Claves (primero)
  for (const k of claves) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.setAttribute("label", `ðŸ§© ${k} â€” Clave`);
    opt.dataset.kind = "clave";
    lista.appendChild(opt);
  }

  // â€” SubcategorÃ­as (Ãºnicas)
  for (const s of subcats) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.setAttribute("label", `ðŸ“š ${s} â€” SubcategorÃ­a`);
    opt.dataset.kind = "subcat";
    lista.appendChild(opt);
  }

  // â€” Familias (sub2)
  for (const s2 of sub2s) {
    const opt = document.createElement("option");
    opt.value = s2;
    opt.setAttribute("label", `ðŸ§ª ${s2} â€” Sub2`);
    opt.dataset.kind = "sub2";
    lista.appendChild(opt);
  }

  // Extras fijos
  if (sinAcentos(categoriaActual) === "datos personales") {
    for (const val of ["edad","sexo"]) {
      if (![...lista.children].some(o => o.value === val)) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.setAttribute("label", `${val} â€” Datos Personales`);
        opt.dataset.kind = "clave";
        lista.appendChild(opt);
      }
    }
  }
}


// === Desactivar autocompletado nativo (datalist / autocomplete) ===
(function disableNativeAutocomplete(){
  const inp = document.getElementById("claveInput");
  if (!inp) return;

  // apagar sugerencias del navegador
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  inp.setAttribute("autocorrect", "off");
  inp.setAttribute("spellcheck", "false");

  // si venÃ­a con list="sugerencias", lo removemos
  if (inp.hasAttribute("list")) inp.removeAttribute("list");

  // limpiar o remover el datalist si existe
  const dl = document.getElementById("sugerencias");
  if (dl) {
    // opciÃ³n A (recomendado): remover del DOM
    dl.remove();
    // opciÃ³n B: si preferÃ­s dejarlo, lo vaciamos
    // dl.innerHTML = "";
  }
})();


document.getElementById("categoriaSelect")?.addEventListener("change", ()=>{
  const inp = document.getElementById("claveInput");
  if (inp) {
    inp.removeAttribute("list");
    inp.setAttribute("autocomplete", "off");
  }
});

function normalizarEntradaCriterio(categoria, valor) {
  const v = (valor || "").trim();
  if (!v) return v;

  // 1) si es clave (o sinÃ³nimo) â†’ clave canÃ³nica
  const can = canonIndex?.get(sinAcentos(v)); // canonIndex lo armamos al cargar terminologÃ­a
  if (can) return can;

  // 2) si coincide con subcat o sub2 vÃ¡lidos para la categorÃ­a â†’ dejar tal cual
  const { subcats, sub2s } = getTermSetsByCategory(categoria);
  if (subcats.some(s => sinAcentos(s) === sinAcentos(v))) return v;
  if (sub2s.some(s => sinAcentos(s) === sinAcentos(v))) return v;

  // 3) si no lo conocemos, lo devolvemos igual (o podrÃ­as bloquearlo con un aviso)
  return v;
}

// ===================== SinÃ³nimos y detecciÃ³n (laxa) =====================
function getSinonimos(categoria, clave) {
  const row = baseAutocompletado.find(t =>
    sinAcentos(t.categoria) === sinAcentos(categoria) &&
    sinAcentos(t.clave) === sinAcentos(clave)
  );
  return (row?.sinonimos || []).filter(Boolean);
}


// ====== ÃNDICES SIN SINÃ“NIMOS + REDES SUBCAT/SUB2 (A) ======
window.idx = {
  byCat: new Map(),          // cat -> { baseClaves:Set, subcats:Set, sub2s:Set }
  subcatToCanon: new Map(),  // cat -> (subcatNorm -> Set<canon>)
  sub2ToCanon: new Map(),    // cat -> (sub2Norm   -> Set<canon>)
  canonToTerms: new Map(),   // (catNorm|canonNorm) -> Set( canon + sinÃ³nimos )
  canonSetByCat: new Map(),  // cat -> Set<canon>
};
function norm(s){ return (s||"").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").trim(); }

function rebuildIndices() {
  const byCat = new Map();
  const subcatToCanon = new Map();
  const sub2ToCanon = new Map();
  const canonToTerms = new Map();
  const canonSetByCat = new Map();

  (baseAutocompletado || []).forEach(t => {
    const cat = t.categoria || "Otros";
    if (!byCat.has(cat)) byCat.set(cat, { baseClaves:new Set(), subcats:new Set(), sub2s:new Set() });
    if (!canonSetByCat.has(cat)) canonSetByCat.set(cat, new Set());

    if (t.clave) byCat.get(cat).baseClaves.add(t.clave);
    if (t.subcategoria && sinAcentos(t.subcategoria) !== sinAcentos(cat)) byCat.get(cat).subcats.add(t.subcategoria);
    if (t.sub2) byCat.get(cat).sub2s.add(t.sub2);

    const key = `${norm(cat)}|${norm(t.clave)}`;
    if (!canonToTerms.has(key)) canonToTerms.set(key, new Set());
    canonToTerms.get(key).add(t.clave);
    (t.sinonimos || []).forEach(s => canonToTerms.get(key).add(s));
  });

  (baseAutocompletado || []).forEach(t => {
    const cat = t.categoria || "Otros";
    const can = t.clave;

    if (!subcatToCanon.has(cat)) subcatToCanon.set(cat, new Map());
    if (!sub2ToCanon.has(cat)) sub2ToCanon.set(cat, new Map());

    if (t.subcategoria) {
      const sN = norm(t.subcategoria);
      const m = subcatToCanon.get(cat);
      if (!m.has(sN)) m.set(sN, new Set());
      m.get(sN).add(can);
    }
    if (t.sub2) {
      const s2N = norm(t.sub2);
      const m2 = sub2ToCanon.get(cat);
      if (!m2.has(s2N)) m2.set(s2N, new Set());
      m2.get(s2N).add(can);
    }

    if (!canonSetByCat.has(cat)) canonSetByCat.set(cat, new Set());
    canonSetByCat.get(cat).add(can);
  });

  window.idx.byCat = byCat;
  window.idx.subcatToCanon = subcatToCanon;
  window.idx.sub2ToCanon = sub2ToCanon;
  window.idx.canonToTerms = canonToTerms;
  window.idx.canonSetByCat = canonSetByCat;
}
function getAllTermsForEnhanced(categoria, claveCanon) {
  const pack = new Set([claveCanon, ...getSinonimos(categoria, claveCanon)]);

  const row = termIndex.byKey.get(sinAcentos(claveCanon));
  if (row?.sub2) {
    const fam = termIndex.bySub2.get(sinAcentos(row.sub2));
    if (fam) fam.forEach(t => pack.add(t));
  }

  const infer = reglasInferIndex.get(sinAcentos(claveCanon));
  if (infer) infer.forEach(t => pack.add(t));

  return Array.from(pack);
}


// ===================== PRE-MATCH =====================
function setPillNegado(div) {
  div.classList.remove("cumple", "parcial");
  div.classList.add("nocumple");
  const pill = div.querySelector(".resultado");
  if (pill) { pill.textContent = "Verificar"; pill.title = "Negado en el texto"; }
}
function setPillHallazgo(div, texto) {
  div.classList.remove("cumple", "nocumple", "parcial");
  const pill = div.querySelector(".resultado");
  if (texto) {
    div.classList.add("parcial");
    if (pill) { pill.textContent = "Hallazgo"; pill.title = texto; }
  } else {
    if (pill) { pill.textContent = "“"; pill.removeAttribute("title"); }
  }
}

function setPillNeutral(div, title) {
  div.classList.remove("cumple", "nocumple", "parcial");
  const pill = div.querySelector(".resultado");
  if (pill) {
    pill.textContent = "";
    if (title) pill.title = title; else pill.removeAttribute("title");
  }
}

function foundIn(texto, terminos, opts = {}) {
  const tRaw = texto || "";
  const t = sinAcentos(tRaw);
  const ranges = [];
  let negado = false, hit = false;

  // sufijos clÃ­nicos frecuentes pegados a acrÃ³nimos: IAMCEST, SCASEST, STEMI/NSTEMI
  const ACR_SUFFIX = "(?:[-/ ]?(?:c?est|s?est|est|stemi|nstemi))?";

  // helper para pushear rango + negaciÃ³n si aplica
  function pushMatch(idx, len) {
    hit = true;
    ranges.push({ i: idx, len });
    if (isNegatedForTerm(tRaw, idx)) negado = true;
  }

  for (const raw of (terminos || [])) {
    const clean = sinAcentos(raw || "");
    if (!clean) continue;

    // 1) patrÃ³n base (respeta espacios como \s+)
    const patBase = clean
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");

    // 2) Â¿acrÃ³nimo corto? (IAM, SCA, ATC)
    const isAcr = clean.length <= 3;

    // 3) variantes â€œpegadasâ€ y con separadores (IAMCEST, IAM-CEST, IAM/CEST)
    //    - si es acrÃ³nimo: permitir sufijo clÃ­nico
    //    - si no es acrÃ³nimo: palabra completa
    const rxBase = isAcr
      ? new RegExp(`\\b${patBase}${ACR_SUFFIX}\\b`, "ig")
      : new RegExp(`\\b${patBase}\\b`, "ig");

    // 4) patrÃ³n mÃ¡s permisivo con separadores en el medio (ej: "sindrome/coronario agudo")
    const patLoose = clean
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "[\\s\\-/]+"); // permite espacio, -, /

    const rxLoose = isAcr
      ? new RegExp(`\\b${patLoose}${ACR_SUFFIX}\\b`, "ig")
      : new RegExp(`\\b${patLoose}\\b`, "ig");

    // 5) patrÃ³n para ICD-10 de IAM (I21, I21.x, I2111)
    //    Lo activamos solo si el tÃ©rmino sugiere infarto (iam / infarto agudo de miocardio)
    const isIAM =
      clean === "iam" ||
      clean.includes("infarto agudo de miocardio") ||
      clean === "stemi" || clean === "nstemi";

    const rxICD = isIAM ? new RegExp(`\\bI21[0-9A-Za-z\\.]*\\b`, "ig") : null;

    // ---- ejecutar todos los patrones posibles sobre el texto normalizado ----
    const scanners = [rxBase, rxLoose].concat(rxICD ? [rxICD] : []);
    for (const rx of scanners) {
      let m;
      while ((m = rx.exec(t)) !== null) {
        const i0 = m.index, i1 = m.index + m[0].length;
        pushMatch(i0, i1 - i0);
        // avanzar de a 1 para encontrar solapados sin loops infinitos
        rx.lastIndex = m.index + 1;
      }
    }
  }

  // Fuzzy opcional (igual que antes)
  if (!hit && (opts?.allowFuzzy ?? true)) {
    const toks = t.split(/\W+/).filter(w => w.length > 2);
    outer: for (const tk of toks) {
      for (const raw of (terminos || [])) {
        const clean = sinAcentos(raw || "");
        if (clean.length <= 3) continue;
        if (lev(tk, clean) <= 1) { hit = true; break outer; }
      }
    }
  }

  return { hit, negado, ranges };
}



// ==== LAB: helpers de anÃ¡lisis numÃ©rico ====
function normUnit(u){return (u||"").toLowerCase().replace(/\s+/g,"")}
function isLipid(baseCanon){
  const b = sinAcentos(baseCanon);
  return ["colesterol total","colesterol ldl","ldl","colesterol hdl","hdl","trigliceridos","triglicÃ©ridos"].includes(b);
}
function isGlucose(baseCanon){
  const b = sinAcentos(baseCanon);
  return ["glucosa","glucemia","glucemia en ayunas"].includes(b);
}
function isHbA1c(baseCanon){
  const b = sinAcentos(baseCanon);
  return ["hba1c","hemoglobina glicosilada","hemoglobina glucosilada"].includes(b);
}
function convertValor(baseCanon, valor, fromU, toU) {
  const f = normUnit(fromU), t = normUnit(toU);
  if (!t || f===t) return valor;
  if (isLipid(baseCanon)) {
    const isTG = ["trigliceridos","triglicÃ©ridos"].includes(sinAcentos(baseCanon));
    const k = isTG ? 88.57 : 38.67;
    if (f==="mg/dl" && t==="mmol/l") return valor / k;
    if (f==="mmol/l" && t==="mg/dl") return valor * k;
  }
  if (isGlucose(baseCanon)) {
    const k = 18.02;
    if (f==="mg/dl" && t==="mmol/l") return valor / k;
    if (f==="mmol/l" && t==="mg/dl") return valor * k;
  }
  return valor;
}
function buildAnalitoRegex(variants) {
  const or = (variants || [])
    .map(v => v && v.trim())
    .filter(Boolean)
    .map(v => v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g,"\\$&")
      .replace(/\s+/g,"\\s+"))
    .join("|");

  // conectores comunes entre el analito y el valor (priorizados)
  const connectors = "(?:\\s*(?:=|:|es\\s+de|de|â†’|->)\\s*)";

  // permitÃ­ tambiÃ©n texto intermedio genÃ©rico (hasta 40 chars) como fallback
  const gapOrConn = `(?:${connectors}|[^\\d]{0,40}?)`;

  // analito + (conector o pequeÃ±o gap) + nÃºmero (+ unidad opcional)
  return new RegExp(
    `(?:^|\\b|[^\\p{L}\\d])(?:${or})${gapOrConn}` +
    `(\\d+(?:[\\.,]\\d+)?)(?:\\s*(%|mg\\/dl|mmol\\/l|g\\/l|u\\/l|ui\\/l|mg\\/l))?`,
    "iu"
  );
}

function extraerValorLab(textoPlano, variants) {
  const plano = sinAcentos(textoPlano);
  const rx = buildAnalitoRegex(variants);
  const m = plano.match(rx);
  if (!m) return null;
  const valor = parseFloat((m[1]||"").replace(",", "."));
  const unidad = (m[2]||"").toLowerCase();
  return { valor, unidad };
}
function cumpleCondicionValor(baseCanon, med, cond) {
  const v = convertValor(baseCanon, med.valor, med.unidad, cond.unidadObjetivo);
  if (cond.operador === "entre") {
    return v >= cond.min && v <= cond.max;
  }
  const x = cond.umbral;
  switch (cond.operador) {
    case ">":  return v >  x;
    case ">=": return v >= x;
    case "<":  return v <  x;
    case "<=": return v <= x;
    case "=":  return Math.abs(v - x) < 1e-9;
    default:   return false;
  }
}


function getTermSetsByCategory(cat) {
  const catNorm = sinAcentos(cat);
  const claves = new Set();
  const subcats = new Set();
  const sub2s = new Set();

  for (const t of baseAutocompletado || []) {
    if (sinAcentos(t.categoria) !== catNorm) continue;
    // solo CLAVES (no sinÃ³nimos)
    claves.add(t.clave);
    // subcategorÃ­a (evitar repetir el nombre de la categorÃ­a)
    if (t.subcategoria && sinAcentos(t.subcategoria) !== catNorm) subcats.add(t.subcategoria);
    // familias sub2 (si existen)
    if (t.sub2) sub2s.add(t.sub2);
  }
  return {
    claves: Array.from(claves).sort((a,b)=>a.localeCompare(b)),
    subcats: Array.from(subcats).sort((a,b)=>a.localeCompare(b)),
    sub2s: Array.from(sub2s).sort((a,b)=>a.localeCompare(b)),
  };
}

///////////////////////////////////PREMATCH///////////////////////////////
async function preMatch() {
  // --- helpers locales para LAB (auto-contenidos) ---
  const normUnit = (u) => (u || "").toLowerCase().replace(/\s+/g, "");
  const isLipid = (baseCanon) => {
    const b = sinAcentos(baseCanon);
    return ["colesterol total","colesterol ldl","ldl","colesterol hdl","hdl","trigliceridos","triglicÃ©ridos"].includes(b);
  };
  const isGlucose = (baseCanon) => {
    const b = sinAcentos(baseCanon);
    return ["glucosa","glucemia","glucemia en ayunas"].includes(b);
  };
  const isHbA1c = (baseCanon) => {
    const b = sinAcentos(baseCanon);
    return ["hba1c","hemoglobina glicosilada","hemoglobina glucosilada"].includes(b);
  };
  function convertValor(baseCanon, valor, fromU, toU) {
    const f = normUnit(fromU), t = normUnit(toU);
    if (!t || f === t) return valor;
    if (isLipid(baseCanon)) {
      const isTG = ["trigliceridos","triglicÃ©ridos"].includes(sinAcentos(baseCanon));
      const k = isTG ? 88.57 : 38.67; // TG y resto de lÃ­pidos
      if (f === "mg/dl" && t === "mmol/l") return valor / k;
      if (f === "mmol/l" && t === "mg/dl") return valor * k;
    }
    if (isGlucose(baseCanon)) {
      const k = 18.02;
      if (f === "mg/dl" && t === "mmol/l") return valor / k;
      if (f === "mmol/l" && t === "mg/dl") return valor * k;
    }
    return valor;
  }
  function buildAnalitoRegex(variants) {
    const or = (variants || [])
      .map(v => v && v.trim())
      .filter(Boolean)
      .map(v => v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+"))
      .join("|");
    // Captura un nÃºmero a <= 40 caracteres del analito, con unidad opcional
    return new RegExp(`(?:^|\\b|[^\\p{L}\\d])(?:${or})(?:[^\\d]{0,40}?)(\\d+(?:[\\.,]\\d+)?)(?:\\s*(%|mg\\/dl|mmol\\/l|g\\/l|u\\/l|ui\\/l|mg\\/l))?`, "iu");
  }
  function extraerValorLab(textoPlano, variants) {
    const plano = sinAcentos(textoPlano || "");
    const rx = buildAnalitoRegex(variants);
    const m = plano.match(rx);
    if (!m) return null;
    const valor = parseFloat((m[1] || "").replace(",", "."));
    const unidad = (m[2] || "").toLowerCase();
    return { valor, unidad };
  }
  function cumpleCondicionValor(baseCanon, med, cond) {
    const v = convertValor(baseCanon, med.valor, med.unidad, cond.unidadObjetivo);
    if (cond.operador === "entre") {
      return v >= cond.min && v <= cond.max;
    }
    const x = cond.umbral;
    switch (cond.operador) {
      case ">":  return v >  x;
      case ">=": return v >= x;
      case "<":  return v <  x;
      case "<=": return v <= x;
      case "=":  return Math.abs(v - x) < 1e-9;
      default:   return false;
    }
  }
  // --- fin helpers LAB ---

  const estudioActivo = document.getElementById("estudio").value;
  if (!estudioActivo || !estudios[estudioActivo]) { alert("SeleccionÃ¡ un estudio primero."); return; }

  const tab = await getActiveTab();
  if (!tab?.id || !isInjectableUrl(tab.url)) { alert("AbrÃ­ una HCE http/https para usar Pre-Match."); return; }
  const ready = await ensureContentScript(tab.id);
  if (!ready) { alert("No pude conectar con la pÃ¡gina. RecargÃ¡ la HCE e intentÃ¡ de nuevo."); return; }

  const payload = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: "MEDREG_EXTRACT_DOM" }, (resp) => {
      void chrome.runtime.lastError; resolve(resp || null);
    });
  });
  if (!payload?.rawText) { alert("Recargar la pÃ¡gina."); return; }
  const texto = payload.rawText;

  // reset de â€œpillsâ€
  document.querySelectorAll("#contenedorCriterios .criterio").forEach(div => setPillHallazgo(div, null));

  const datosEstudio = estudios[estudioActivo];
  const termsForHighlight = new Set();
  const termsNegadosForHighlight = new Set();

  // Si existe una versiÃ³n extendida de expansor de tÃ©rminos (con sub2/inferencias), usarla.
  const expandTerms = (typeof getAllTermsForEnhanced === "function")
    ? (cat, clave) => getAllTermsForEnhanced(cat, clave)
    : (cat, clave) => getAllTermsFor(cat, clave);

  document.querySelectorAll("#contenedorCriterios .categoria").forEach(catDiv => {
    const catNombre = catDiv.querySelector(".categoria-nombre")?.textContent?.trim();
    if (!catNombre) return;

    const criteriosCat = Array.isArray(datosEstudio[catNombre]) ? datosEstudio[catNombre] : [];

    catDiv.querySelectorAll(".criterio").forEach(itemDiv => {
      const idx = parseInt(itemDiv.getAttribute("data-idx"), 10);
      const c = criteriosCat[idx]; if (!c) return;

      // --- BLOQUE: Laboratorio con valores (>=, >, <=, <, =, entre) ---
      if (sinAcentos(catNombre) === "laboratorio" && c?.tipo === "valor" && c?.operador) {
        const baseCanon = c.clave; // usamos la clave del criterio como analito base
        // variantes para encontrar el analito en el texto: clave + sinÃ³nimos
        const variants = (() => {
          try { return [baseCanon, ...getSinonimos(catNombre, baseCanon)]; }
          catch { return [baseCanon]; }
        })();

        const med = extraerValorLab(texto, variants);

        // unidad objetivo por default segÃºn analito
        const unidadObjetivo =
          (isHbA1c(baseCanon) ? "%" : (isGlucose(baseCanon) || isLipid(baseCanon) ? "mg/dL" : (med?.unidad || "")));

        const cond = (c.operador === "entre")
          ? { operador: "entre", min: Number(c.min), max: Number(c.max), unidadObjetivo }
          : { operador: c.operador, umbral: Number(c.umbral), unidadObjetivo };

        if (!med || !Number.isFinite(med.valor)) {
          setPillNeutral(itemDiv, "No se encontrÃ³ valor numÃ©rico para " + baseCanon);
          return;
        }

        const cumple = cumpleCondicionValor(baseCanon, med, cond);
        const foundLabel = `${baseCanon}: ${med.valor}${med.unidad ? " " + med.unidad : ""}`;

        if (cumple) {
          setPillHallazgo(itemDiv, foundLabel);
          termsForHighlight.add(baseCanon);
          termsForHighlight.add(String(med.valor));
        } else {
          setPillNeutral(itemDiv, `${foundLabel} â€” no cumple ${c.operador} ${c.operador==="entre" ? c.min+" y "+c.max : c.umbral}`);
        }
        return;
      }
      // --- FIN BLOQUE LAB ---

      // ===== EXPANSIÃ“N COMPLETA (D) =====
      const modo = (c.modo || itemDiv.getAttribute("data-modo") || "clave");
      let canones = [];
      if (modo === "clave") {
        canones = [c.clave];
      } else {
        try { canones = resolverDestinosParaCriterio(catNombre, c.clave) || []; } catch { canones = [c.clave]; }
      }
      const pack = new Set();
      for (const k of canones) {
        let terms = null;
        try { terms = getAllTermsForEnhanced(catNombre, k); } catch { terms = [k]; }
        (terms || [k]).forEach(t => pack.add(t));
        const row = (baseAutocompletado||[]).find(x => x.categoria===catNombre && sinAcentos(x.clave)===sinAcentos(k));
        if (row?.sub2) pack.add(row.sub2);
      }
      const det = foundIn(texto, Array.from(pack), { allowFuzzy: true });

      if (det.hit) {
        if (det.negado) {
          setPillNegado(itemDiv);
          det.ranges.forEach(r => {
            const frag = texto.slice(r.i, r.i + r.len);
            if (frag && frag.trim()) termsNegadosForHighlight.add(frag);
          });
        } else {
          setPillHallazgo(itemDiv, c.clave);
          det.ranges.forEach(r => {
            const frag = texto.slice(r.i, r.i + r.len);
            if (frag && frag.trim()) termsForHighlight.add(frag);
          });
        }
      }
    });
  });

  // Resaltado en pÃ¡gina
  chrome.tabs.sendMessage(tab.id, { action: "clearHighlights" });
  const termsOK  = Array.from(termsForHighlight);
  const termsNEG = Array.from(termsNegadosForHighlight);
  if (termsOK.length)  chrome.tabs.sendMessage(tab.id, { action: "highlightMany", terms: termsOK, scroll: true });
  if (termsNEG.length) chrome.tabs.sendMessage(tab.id, { action: "highlightNegados", terms: termsNEG });
}

function analizar() { preMatch(); }
function limpiarTodo() {
  document.querySelectorAll(".valorOperador").forEach((i) => (i.value = ""));
  document.querySelectorAll(".resultado").forEach((s) => { s.textContent = "-"; s.removeAttribute("title"); });
  document.querySelectorAll(".chk").forEach((cb) => (cb.checked = false));
  document.querySelectorAll(".criterio").forEach((div) => div.classList.remove("cumple", "nocumple", "parcial"));
  getActiveTab().then(t => { if (t?.id) chrome.tabs.sendMessage(t.id, { action: "clearHighlights" }); });
}

// ===================== ABM de estudios (modal) =====================
let tempEstudio = {};
function abrirModal() { tempEstudio = {}; document.getElementById("modal").style.display = "flex"; document.getElementById("preview").innerHTML = ""; limpiarCamposModal(); }
function cerrarModal() { document.getElementById("modal").style.display = "none"; }
function actualizarSelector() {
  const sel = document.getElementById("estudio"); sel.innerHTML = "";
  for (let nombre in estudios) { const opt = document.createElement("option"); opt.textContent = nombre; sel.appendChild(opt); }
}
function eliminarEstudio() {
  const nombre = document.getElementById("estudio").value;
  if (!nombre) return;
  if (confirm(`¿Eliminar estudio "${nombre}"?`)) {
    delete estudios[nombre];
    localStorage.setItem("estudiosMedReg", JSON.stringify(estudios));
    actualizarSelector();
    renderCriterios();
  }
}
function limpiarCamposModal() {
  document.getElementById("categoriaSelect").value = "";
  document.getElementById("claveInput").value = "";
  document.getElementById("valor1").value = "";
  document.getElementById("valor2").value = "";
  document.getElementById("valor2").classList.add("oculto");
  document.getElementById("valorSexo").value = "todos";
  document.getElementById("opcionesValor").classList.add("oculto");
  document.getElementById("opcionesSexo").classList.add("oculto");
  document.getElementById("catNueva").value = "";
  document.getElementById("claveNueva").value = "";
  document.getElementById("sinonimosNuevos").value = "";
  mostrarOpcionesPorClaveYCategoria();
  document.getElementById("claveInput").value = "";
}
function mostrarOpcionesPorClaveYCategoria() {
  const categoria = (document.getElementById("categoriaSelect").value || "").toLowerCase();
  const clave = (document.getElementById("claveInput").value || "").trim().toLowerCase();
  document.getElementById("opcionesValor").classList.add("oculto");
  document.getElementById("opcionesSexo").classList.add("oculto");
  if (categoria === "datos personales" && clave === "edad") document.getElementById("opcionesValor").classList.remove("oculto");
  else if (categoria === "datos personales" && clave === "sexo") document.getElementById("opcionesSexo").classList.remove("oculto");
  else if (categoria === "laboratorio") document.getElementById("opcionesValor").classList.remove("oculto");
}

function agregarCriterio() {
  const cat = document.getElementById("categoriaSelect").value;
  const inp = document.getElementById("claveInput");
  const clave = (inp.value || "").trim();
  const modoUI = inp.dataset.modo || "";
  const claveLower = sinAcentos(clave);
  const op = document.getElementById("operador").value;
  const val1 = document.getElementById("valor1").value;
  const val2 = document.getElementById("valor2").value;
  const sexo = document.getElementById("valorSexo").value;
  if (!cat || !clave) return alert("Complete todos los campos.");

  // Si no clickeó sugerencia, intentamos clasificar por índices
  let modo = modoUI;
  if (!modo) {
    const catObj = window.idx.byCat.get(cat);
    const inSubcat = !!Array.from(catObj?.subcats||[]).find(s=>sinAcentos(s)===claveLower);
    const inSub2 = !!Array.from(catObj?.sub2s||[]).find(s=>sinAcentos(s)===claveLower);
    modo = inSubcat ? "subcat" : (inSub2 ? "sub2" : "clave");
  }

  // alta rápida sólo si es "clave" desconocida y no es Datos Personales
  const encontrado = baseAutocompletado.find(t =>
    (t.categoria || "").toLowerCase() === (cat || "").toLowerCase() &&
    sinAcentos(t.clave) === claveLower
  );
  if (!encontrado && cat !== "Datos Personales" && modo === "clave") {
    document.getElementById("formNuevoCriterio").classList.remove("oculto");
    document.getElementById("claveNueva").value = clave;
    return;
  }
  let criterio = { clave, modo, tipo: "booleano" };
  if ((cat === "Datos Personales" && claveLower === "edad") || cat === "Laboratorio") {
    criterio.tipo = "valor"; criterio.operador = op;
    if (op === "entre") { criterio.min = parseFloat(val1); criterio.max = parseFloat(val2); }
    else if (val1 !== "") { criterio.umbral = parseFloat(val1); }
  }
  if (cat === "Datos Personales" && claveLower === "sexo") {
    criterio.tipo = "valor"; criterio.valor = sexo;
  }
  if (!tempEstudio[cat]) tempEstudio[cat] = [];
  tempEstudio[cat].push(criterio);
  renderPreview();
  document.getElementById("valor1").value = "";
  document.getElementById("valor2").value = "";
  document.getElementById("valor2").classList.add("oculto");
  document.getElementById("valorSexo").value = "todos";
  document.getElementById("opcionesValor").classList.add("oculto");
  document.getElementById("opcionesSexo").classList.add("oculto");
  mostrarOpcionesPorClaveYCategoria();
  inp.value = ""; inp.dataset.modo = "";
  const panel = document.getElementById("suggestPanel"); if (panel) panel.innerHTML = "";
}

function nuevoEstudio() {
  tempEstudio = {};
  document.getElementById("modal").style.display = "flex";
  document.getElementById("preview").innerHTML = "";
  document.getElementById("nombreEstudio").value = "";
  document.getElementById("nombreEstudio").disabled = false;
  limpiarCamposModal();
}
function editarEstudio() {
  const nombre = document.getElementById("estudio").value;
  if (!nombre || !estudios[nombre]) return;
  tempEstudio = JSON.parse(JSON.stringify(estudios[nombre]));
  document.getElementById("modal").style.display = "flex";
  document.getElementById("nombreEstudio").value = nombre;
  document.getElementById("nombreEstudio").disabled = true;
  renderPreview();
  limpiarCamposModal();
}
function renderPreview() {
  const preview = document.getElementById("preview");
  preview.innerHTML = "";
  for (let cat in tempEstudio) {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${cat}</strong><br>`;
    tempEstudio[cat].forEach((c, i) => {
      let texto = c.clave;
      if (c.tipo === "valor") {
        if (c.operador === "entre") texto += ` entre ${c.min} y ${c.max}`;
        else if (c.umbral !== undefined) texto += ` ${c.operador} ${c.umbral}`;
        else if (c.valor !== undefined) texto += ` = ${c.valor}`;
      }
      texto += ` <button class="btnEliminarCriterio" data-cat="${cat}" data-idx="${i}" title="Quitar">❌</button>`;
      div.innerHTML += `<span class="tag">${texto}</span>`;
    });
    preview.appendChild(div);
  }
}
function eliminarCriterio(cat, idx) {
  if (!tempEstudio[cat]) return;
  tempEstudio[cat].splice(idx, 1);
  if (tempEstudio[cat].length === 0) delete tempEstudio[cat];
  renderPreview();
}
function guardarNuevoCriterio() {
  const cat = document.getElementById("catNueva").value;
  const clave = document.getElementById("claveNueva").value.trim();
  const sinonimos = document.getElementById("sinonimosNuevos").value.trim().split(",").map(s => s.trim()).filter(Boolean);
  if (!clave || !cat) return;
  baseAutocompletado.push({ categoria: cat, clave, sinonimos, subcategoria: cat });
  localStorage.setItem("baseAutocompletado", JSON.stringify(baseAutocompletado));
  cargarDatalistPorCategoria(cat);
  document.getElementById("formNuevoCriterio").classList.add("oculto");
  document.getElementById("claveInput").value = clave;
  agregarCriterio();
}
function guardarEstudio() {
  const nombre = document.getElementById("nombreEstudio").value.trim();
  if (!nombre || Object.keys(tempEstudio).length === 0) return alert("Falta nombre o criterios.");
  estudios[nombre] = tempEstudio;
  localStorage.setItem("estudiosMedReg", JSON.stringify(estudios));
  actualizarSelector();
  cerrarModal();
  renderCriterios();
}
function renderCriterios() {
  const cont = document.getElementById("contenedorCriterios");
  cont.innerHTML = "";
  const nombre = document.getElementById("estudio").value;
  if (!nombre || !estudios[nombre]) return;
  const datos = estudios[nombre];
  for (let cat in datos) {
    const div = document.createElement("div");
    div.className = "categoria";
    const header = document.createElement("label");
    header.className = "categoria-nombre";
    header.textContent = cat;
    div.appendChild(header);
    datos[cat].forEach((c, i) => {
      let texto = c.clave;
      if (c.tipo === "valor") {
        if (c.operador === "entre") texto += ` entre ${c.min} y ${c.max}`;
        else if (c.umbral !== undefined) texto += ` ${c.operador} ${c.umbral}`;
        else if (c.valor !== undefined) texto += ` = ${c.valor}`;
      }
      const item = document.createElement("div");
      item.className = "criterio";
      item.setAttribute("data-cat", cat);
      item.setAttribute("data-idx", i.toString());
      item.setAttribute("data-clave", c.clave);
      item.innerHTML = `
        <input type="checkbox" class="chk" title="Marcar">
        <span class="texto-clave">${texto}</span>
        <input type="text" class="valorOperador" placeholder="Comentario o valor">
        <span class="resultado">–</span>
      `;
      div.appendChild(item);
    });
    cont.appendChild(div);
  }
}


function obtenerCriteriosVisiblesINV(){
  // Intenta con contenedores típicos; si cambian, añadí otro selector acá.
  const sel = '#proto-criterios .criterio, #inv-criterios .criterio, .criterio-chip, .criterio';
  const chips = Array.from(document.querySelectorAll(sel));
  return chips
    .map(ch => (ch.getAttribute('data-clave') || ch.textContent || '').trim())
    .filter(Boolean);
}


async function getContextFromExtractionsOnly(){
  // Recupera el texto tal como está listado en la caja de Extracciones (INV)
  const items = Array.from(document.querySelectorAll('#inv-extracciones .item, #inv-extracciones li, .inv-extraccion'));
  if (items.length){
    return items.map(el => (el.getAttribute('data-texto') || el.textContent || '').trim()).filter(Boolean).join('\n\n');
  }
  // Fallback a tu store en memoria si lo usás:
  if (window.__INV_EXTRACCIONES && Array.isArray(window.__INV_EXTRACCIONES)){
    return window.__INV_EXTRACCIONES.map(x => (x.texto || x) ).join('\n\n');
  }
  return '';
}


async function runAnalisisIA_INV(){
  try{
    // --- 1) Criterios visibles en #contenedorCriterios como texto plano
    const criterios = [];
    document.querySelectorAll('#contenedorCriterios .criterio').forEach((div, i) => {
      const cat   = div.getAttribute('data-cat') || '';
      const base  = div.querySelector('.texto-clave')?.textContent?.trim() || '';
      const coment= div.querySelector('.valorOperador, .comentario, textarea')?.value?.trim() || '';
      if (base) criterios.push(`${cat ? `[${cat}] ` : ''}${base}${coment ? ` — ${coment}` : ''}`);
    });
    if (!criterios.length) throw new Error('No hay criterios visibles para analizar.');

    // --- 2) Tomo SOLO el texto del box de Extracciones (INV)
    const items = await loadInvExtractions();
    const raw = items.map(x => x.rawText || '').filter(Boolean).join('\n\n---\n\n').slice(0, 8000).trim();
    if (!raw) throw new Error('No hay texto extraído en la caja de Extracciones.');

    // --- 3) Prompt compacto
    const prompt =
`Analiza el siguiente TEXTO EXTRAÍDO de la historia clinica del paciente y crúzalo con estos CRITERIOS.
Responde SOLO con una lista numerada (1., 2., 3., ...). Para cada criterio:
- Marca ✅ si se cumple el criterio en forma positiva, ❌ si no lo cumple o esta negado, o "insuficiente" si falta info o no es concluyente sobre ese criterio en particular.
- Cita ENTRE COMILLAS la frase exacta del TEXTO que lo evidencia cuando el dato esta presente, sino indica "no encontrado". Ejemplo: criterio enfermedad coronaria -> "El paciente tuvo un infarto agudo de miocardio en 2020" cumple con el criterio.
- Si el criterio es numérico (ej. "LDL > 130 mg/dL"), cita el valor exacto encontrado que justifica tu respuesta.
- Explica brevemente el porqué de tu decisión en cada punto (máx. 20 palabras).
- Ignora lineas vacias que sólo contienen el título del item sin estar completadas, tales como "Enfermedades:""", líneas duplicadas o repetidas del texto.

Guías de INFERENCIA CLÍNICA (ligera, no forzada):
- "Enfermedad coronaria" ≈ DAC/cardiopatía isquémica/IAM. La presencia de ATC/angioplastia/stent coronario, lesiones/estenosis en CCG o antecedentes de IAM sustentan coronaria, salvo negación explícita.
- Correlacionar valores de laboratorio con diagnósticos: ej. HbA1c alta sugiere diabetes, LDL alto sugiere dislipidemia, etc.
- Considera sinónimos médicos comunes (ej. HTA = hipertensión arterial).
- Considera signos vitales relevantes (ej. TA mayor a 140/90 sugiere HTA).
- Tené en cuenta negaciones explícitas (ej. "no tiene diabetes" invalida diabetes).
- Si el criterio es de tipo valor (ej. "LDL > 130 mg/dL"), buscá el valor numérico y comparalo.
- Usá sinónimos habituales y abreviaturas clínicas en español.
- Si solo hay mención parcial o indirecta, marcá "insuficiente" y explica breve por qué.

CRITERIOS:
${criterios.map((c,i)=>`${i+1}. ${c}`).join('\n')}

TEXTO:
${raw}`.slice(0,12000);

    // --- 4) Intento 1: backend /evaluar_ia (si lo tenés preparado para INV)
    try{
      const r1 = await fetchJSONorThrow(`${API_BASE}/evaluar_ia`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ modo:'INV', criterios, texto: raw })
      });
      const salida = r1?.analisis || r1?.resultado || r1?.text || (typeof r1 === 'string' ? r1 : JSON.stringify(r1));
      renderResultadoINV(salida);
      console.info('[MedReg] Análisis IA (INV) OK vía /evaluar_ia');
      return;
    }catch(e1){
      console.warn('[MedReg] /evaluar_ia no disponible:', e1?.message || e1);
    }

    // --- 5) Intento 2: backend /chat_ia (schema simple)
    try{
      const r2 = await fetchJSONorThrow(`${API_BASE}/chat_ia`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          message: prompt,
          context_raw: raw,
          estudios: [{ nombre:'Estudio local', descripcion:'Cruce de criterios visibles del Investigador' }],
          session_id: 'inv-' + (await getActiveTab())?.id
        })
      });
      const salida = r2?.text || r2?.answer || r2?.output || (typeof r2 === 'string' ? r2 : JSON.stringify(r2));
      renderResultadoINV(salida);
      console.info('[MedReg] Análisis IA (INV) OK vía /chat_ia');
      return;
    }catch(e2){
      console.warn('[MedReg] /chat_ia rechazó:', e2?.message || e2);
    }

    // --- 6) Intento 3: OpenRouter directo (usa tu key/model del Chat IA)
    try{
      const out = await callOpenRouterInvestigador(prompt);
      renderResultadoINV(out);
      console.info('[MedReg] Análisis IA (INV) OK vía OpenRouter');
      return;
    }catch(eOR){
      console.warn('[MedReg] OpenRouter falló:', eOR?.message || eOR);
      throw eOR;
    }


    // cuando tengas el string final en 'salida' u 'out':
if (typeof renderResultadoINV === 'function') {
  renderResultadoINV(salida /* o out */);
} else {
  const outBox = document.getElementById('iaAnalisisOutInv');
  if (outBox) {
    const txt = (salida || out || '').toString();
    if (outBox.tagName === 'TEXTAREA' || outBox.tagName === 'INPUT') outBox.value = txt;
    else outBox.textContent = txt;
    outBox.style.display = 'block';
  }
}

  }catch(e){
    console.error('[MedReg] Análisis IA (INV) falló:', e);
    toast(`❌ Error al contactar IA: ${e?.message || e}`, 'error');
  }
}



// ===== Export / Import de estudios =====
const MEDREG_SCHEMA = "medreg-study";
const MEDREG_SCHEMA_VERSION = 1;

// Arma el paquete exportable (uno o todos)
function buildStudyPackage({ onlyName = null } = {}) {
  const payload = {
    schema: MEDREG_SCHEMA,
    version: MEDREG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    app: "MedReg",
    // opcional: podés guardar hash/versión de terminología para trazabilidad
    // terminoVersion: window.__terminologiaHash || null,
    estudios: {}
  };
  if (onlyName) {
    if (!estudios[onlyName]) throw new Error("Estudio inexistente: " + onlyName);
    payload.estudios[onlyName] = estudios[onlyName];
  } else {
    payload.estudios = JSON.parse(JSON.stringify(estudios));
  }
  return payload;
}

document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("estudio");
  if (!sel) return;
  sel.addEventListener("change", () => {
    if (typeof cargarEstudioSeleccionado === "function") {
      cargarEstudioSeleccionado(sel.value);
    } else if (typeof renderCriterios === "function") {
      renderCriterios(sel.value);
    } else if (typeof renderEstudio === "function") {
      renderEstudio(sel.value);
    }
  });
});


function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

// Exportar el estudio actualmente seleccionado en el selector #estudio
async function exportEstudioActual() {
  const nombre = document.getElementById("estudio")?.value;
  if (!nombre || !estudios[nombre]) { alert("Elegí un estudio válido para exportar."); return; }
  const pkg = buildStudyPackage({ onlyName: nombre });
  const safe = nombre.replace(/[^\p{L}\p{N}\-_]+/gu, "_");
  downloadJSON(pkg, `${safe}.medreg.json`);
}

// Exportar todos los estudios
async function exportTodosLosEstudios() {
  if (!estudios || !Object.keys(estudios).length) { alert("No hay estudios cargados."); return; }
  const pkg = buildStudyPackage({});
  downloadJSON(pkg, `medreg_todos_${new Date().toISOString().slice(0,10)}.medreg.json`);
}

// Validar paquete importado
function validateImportedPackage(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Archivo inválido.");
  if (obj.schema !== MEDREG_SCHEMA) throw new Error("Esquema desconocido.");
  if (typeof obj.version !== "number" || obj.version < 1) throw new Error("Versión de esquema no soportada.");
  if (!obj.estudios || typeof obj.estudios !== "object") throw new Error("Contenido de estudios faltante.");
  // validación suave de cada estudio (estructura mínima)
  for (const [name, data] of Object.entries(obj.estudios)) {
    if (typeof name !== "string" || !name.trim()) throw new Error("Nombre de estudio inválido.");
    if (!data || typeof data !== "object") throw new Error(`Estudio "${name}" mal formado.`);
    // podés agregar checks de tus campos: data.Antecedentes, data.Riesgo, etc.
  }
  return true;
}

// Importar paquete y mergear/overwrittear
async function importEstudiosFromFile(file) {
  const txt = await file.text();
  let obj = null;
  try { obj = JSON.parse(txt); } catch { throw new Error("JSON inválido."); }
  validateImportedPackage(obj);

  const nombres = Object.keys(obj.estudios);
  if (!nombres.length) { alert("El archivo no contiene estudios."); return; }

  // Resolver colisiones (mismo nombre)
  let overwritten = 0, created = 0;
  for (const name of nombres) {
    const exists = !!estudios[name];
    if (exists) {
      const ok = confirm(`El estudio "${name}" ya existe. ¿Querés reemplazarlo?`);
      if (!ok) continue;
      estudios[name] = obj.estudios[name]; // overwrite
      overwritten++;
    } else {
      estudios[name] = obj.estudios[name]; // create
      created++;
    }
  }

  // Persistir (si venías usando chrome.storage)
  try { await chrome.storage.local.set({ estudios }); } catch {}
// -- refrescar UI para que se vea enseguida --
const sel = document.getElementById("estudio");
if (sel) {
  const current = sel.value;                       // lo que estaba seleccionado
  const importados = Object.keys(obj.estudios);    // nombres importados
  // si se reemplazó el actual, lo dejamos seleccionado; si no, mostramos el primero importado
  const prefer = importados.includes(current) ? current : (importados[0] || current);
  sel.value = prefer;
  // dispara el render que ya tenés enganchado al 'change'
  // REFRESH sin inline handlers (CSP-friendly)
if (typeof cargarEstudioSeleccionado === "function") {
  cargarEstudioSeleccionado(sel.value);
} else if (typeof renderCriterios === "function") {
  renderCriterios(sel.value);
} else if (typeof renderEstudio === "function") {
  renderEstudio(sel.value);
} else {
  console.warn("No encontré función de refresco. Quitá el onchange inline y usá addEventListener.");
}

}

  // Refrescar UI: selector y panel
  try {
    const sel = document.getElementById("estudio");
    if (sel) {
      // repoblar opciones
      sel.innerHTML = "";
      Object.keys(estudios).sort().forEach(n => {
        const opt = document.createElement("option");
        opt.value = n; opt.textContent = n;
        sel.appendChild(opt);
      });
    }
  } catch {}


  
// fallback opcional si no existe listener al 'change'
if (typeof cargarEstudioSeleccionado === "function") {
  cargarEstudioSeleccionado(sel.value);
} else if (typeof renderCriterios === "function") {
  renderCriterios(sel.value);
}

  alert(`Importación lista. Creados: ${created} · Reemplazados: ${overwritten}`);
}


////////////////////////////////////////////////////////////////////// 01-11

function collectAllCriteriosForIA() {
  const out = [];
  document.querySelectorAll('#contenedorCriterios .criterio').forEach(div => {
    const clave = div.querySelector('.texto-clave')?.textContent?.trim() ||
                  div.querySelector('.label')?.textContent?.trim() || '';
    const cat = div.getAttribute('data-cat') || '';
    const comentario = div.querySelector('.coment, .comentario, textarea')?.value?.trim() || '';
    const operador = div.querySelector('.operador')?.value || div.querySelector('.operadorSelect')?.value || '';
    const v1 = div.querySelector('.valor1, .valorOperador')?.value || '';
    const v2 = div.querySelector('.valor2')?.value || '';
    if (clave) out.push({ categoria: cat, clave, operador, v1, v2, comentario });
  });
  return out;
}

async function getRawFromInvExtractions() {
  const items = await loadInvExtractions();
  return items.map(x => x.rawText || '').filter(Boolean).join('\n\n---\n\n').slice(0, 8000);
}


// ===================== IA (stub) =====================
// ===================== IA – BLOQUE COMPLETO (Chat IA separado de Protocolos) =====================

// ---------- Helpers de "Protocolos/Estudio local" (se mantienen para esas secciones) ----------
async function getSelectedProtocolosData() {
  let data = await getCachedProtocolos();
  if (!data) { try { data = await fetchProtocolosRaw(); } catch { data = []; } }
  const setSel = await getSelectedProtocolos();
  return Array.from(setSel).sort((a, b) => a - b).map((idx) => normalizeEstudio(data[idx], idx));
}

async function getRawFromExtractions() {
  const KEY = "medreg.extractions";
  const { [KEY]: arr } = await chrome.storage.local.get(KEY);
  const items = Array.isArray(arr) ? arr : [];
  return items.map((x) => x.rawText || "").filter(Boolean).join("\n\n---\n\n");
}

async function armarPayloadCruce() {
  const estudiosSel = await getSelectedProtocolosData();
  const raw = await getRawFromExtractions();
  return { estudios: estudiosSel, raw };
}


async function fetchJSONorThrow(url, opts){
  const res = await fetch(url, opts);
  const txt = await res.text();
  if (!res.ok){
    const msg = txt ? `HTTP ${res.status}: ${txt}` : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  try { return JSON.parse(txt); } catch { return txt; }
}

// ---------- Envío para PROTOCOLOS (usa estudios + contexto). NO se usa en Chat IA ----------

async function sendToBackendInvestigadorIA() {
  try {
    // --- 1) Recolectar texto extraído ---
    const items = await loadInvExtractions();
    const raw = items.map(x => x.rawText || '').join('\n\n---\n\n').slice(0, 8000);
    if (!raw) throw new Error('No hay texto en el box de extracciones.');

    // --- 2) Recolectar criterios visibles ---
    const criterios = [];
    document.querySelectorAll('#contenedorCriterios .criterio').forEach(div => {
      const clave = div.querySelector('.texto-clave')?.textContent?.trim() || '';
      const cat = div.getAttribute('data-cat') || '';
      const obs = div.querySelector('textarea, .comentario')?.value?.trim() || '';
      if (clave) criterios.push({ categoria: cat, clave, observacion: obs });
    });

    // --- 3) Armar prompt para la IA ---
    const prompt = `
Analizá el texto clínico siguiente y cruzalo con los criterios listados.
Indicá para cada criterio si:
- se cumple (✓)
- no se cumple (×)
- o es dudoso (?)
Incluí una breve evidencia o frase que justifique tu evaluación.

=== TEXTO CLÍNICO ===
${raw}

=== CRITERIOS ===
${criterios.map((c, i) => `${i + 1}. ${c.clave}${c.observacion ? ' — ' + c.observacion : ''}`).join('\n')}
`;

    // --- 4) Enviar al backend /chat_ia ---
    const res = await fetch(`${API_BASE}/chat_ia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        context_raw: raw,
        estudios: [{ nombre: 'Estudio local', descripcion: 'Evaluación de criterios visibles del investigador' }],
        session_id: 'inv-' + (await getActiveTab())?.id
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.answer || '(sin respuesta)';
  } catch (err) {
    console.error('[MedReg] Análisis IA (INV) falló:', err);
    throw err;
  }
}


// ---------- Chat IA: solo contexto de EXTRACCIONES/DROP (nada de estudios) ----------
async function getContextFromExtractionsOnly() {
  const raw = await getRawFromExtractions();
  return (raw || '').slice(0, 8000);
}

async function sendToBackendChat(message){
  const body = {
    message,
    context_raw: await getContextFromExtractionsOnly(),
    session_id: 'tab-' + (await getActiveTab())?.id
  };
  const res = await fetch(`${API_BASE}/chat_ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.answer || '(sin respuesta)';
}

// ---------- OpenRouter (Chat IA conversacional) ----------
const OPENROUTER_KEY_STORAGE = 'medreg.openrouter_key';
const OPENROUTER_MODEL_STORAGE = 'medreg.openrouter_model';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function setOpenRouterKeySecure(key){
  await chrome.storage.sync.set({ [OPENROUTER_KEY_STORAGE]: key || '' });
}
async function getOpenRouterKeySecure(){
  const st = await chrome.storage.sync.get(OPENROUTER_KEY_STORAGE);
  return st[OPENROUTER_KEY_STORAGE] || '';
}
async function setOpenRouterModel(model){
  await chrome.storage.sync.set({ [OPENROUTER_MODEL_STORAGE]: model || 'openai/gpt-4o-mini' });
}
async function getOpenRouterModel(){
  const st = await chrome.storage.sync.get(OPENROUTER_MODEL_STORAGE);
  return st[OPENROUTER_MODEL_STORAGE] || 'openai/gpt-4o-mini';
}

// ---------- Historial por pestaña (no duplicar estas funciones en el archivo) ----------
function chatSessionKey(tabId) { return `medreg.chat.history.tab.${tabId || 'na'}`; }
async function getCurrentTabId() {
  try { const tab = await getActiveTab(); return tab?.id || 'na'; } catch { return 'na'; }
}
async function loadChatHistory() {
  const key = chatSessionKey(await getCurrentTabId());
  const st = await chrome.storage.session.get(key);
  return Array.isArray(st[key]) ? st[key] : [];
}
async function saveChatHistory(history) {
  const key = chatSessionKey(await getCurrentTabId());
  await chrome.storage.session.set({ [key]: Array.isArray(history) ? history : [] });
}
async function renderStoredChatHistory() {
  const box = document.getElementById('ai-chat-messages');
  if (!box) return;
  const hist = await loadChatHistory();
  box.innerHTML = '';
  for (const m of hist) aiPushMessage(m.role, m.content);
}

// ---------- UI helpers (Chat tipo conversación) ----------
// ---------- UI helpers (Chat tipo conversación) ----------
function aiPushMessage(role, text){
  const box = document.getElementById('ai-chat-messages');
  if (!box) return;

  // Usuario: simple (sin botón de copiar)
  if (role !== 'assistant') {
    const msg = document.createElement('div');
    msg.className = `chat-bubble ${role}`;
    msg.textContent = text;
    box.appendChild(msg);
    return;
  }

  // Assistant: con copiar y drag
  ensureChatCopyStyles();
  const el = document.createElement('div');
  el.className = 'chat-bubble assistant';

  const content = document.createElement('div');
  content.className = 'chat-content';
  content.textContent = String(text || '');

  const btn = document.createElement('span');
  btn.className = 'chat-copy';
  btn.title = 'Copiar respuesta';
  btn.setAttribute('role','button');
  btn.setAttribute('tabindex','0');
  btn.textContent = '⧉';

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(content.textContent || '');
      const old = btn.textContent; btn.textContent = '✓';
      setTimeout(() => btn.textContent = old, 900);
    } catch (err) { console.error('[MedReg] No pude copiar:', err); }
  };
  btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); doCopy(); });
  btn.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter' || ev.key===' ') { ev.preventDefault(); doCopy(); } });

  const setDragData = (ev) => {
    try {
      ev.dataTransfer?.setData('text/plain', content.textContent || '');
      ev.dataTransfer.effectAllowed = 'copy';
    } catch {}
  };
  el.setAttribute('draggable','true');
  btn.setAttribute('draggable','true');
  el.addEventListener('dragstart', setDragData);
  btn.addEventListener('dragstart', setDragData);

  el.appendChild(content);
  el.appendChild(btn);
  box.appendChild(el);
}


function aiSetPending(p=true){
  const btn = document.getElementById('btnEnviarIA');
  if (btn){ btn.disabled = !!p; btn.textContent = p ? 'Enviando…' : 'Enviar'; }
}


// ---------- Estilos visuales (burbujas de chat) ----------
(function ensureChatStyles(){
  if (document.getElementById('medreg-chat-style')) return;
  const st = document.createElement('style');
  st.id = 'medreg-chat-style';
  st.textContent = `
  #ai-chat-messages {
    display:flex;
    flex-direction:column;
    gap:8px;
    max-height:420px;
    overflow-y:auto;
    padding:6px;
    border:1px solid #1c2a4d;
    border-radius:6px;
    background:#1c2a4d;
  }
  .chat-bubble {
    max-width:85%;
    padding:8px 10px;
    border-radius:10px;
    white-space:pre-wrap;
    word-wrap:break-word;
    line-height:1.4;
  }
  .chat-bubble.user {
    align-self:flex-end;
    background:#007bff;
    color:#fff;
  }
  .chat-bubble.assistant {
    align-self:flex-start;
    background:#e8e8e8;
    color:#000;
  }`;
  document.head.appendChild(st);
})();

// ---------- Chat IA interactivo ---------
// // ---------- Construcción de mensajes (Chat IA) — versión sin "clinical intent" ----------
async function buildOpenRouterMessages(userMessage){
  const contexto = await getContextFromExtractionsOnly();

  const systemPrompt = `
Sos un asistente clínico en español para un cardiólogo que trabaja con varias historias clinicas.
POLÍTICA DE RESPUESTA
- Respondé de forma amable y profesional, con pensamiento y razonamiento medico.
- Usá el contexto extraído/dropeado y lo que el médico escriba en el chat. No inventes datos. Sino pregunta.
- Segui la linea de razonamiento del médico, y la conversación previa si la hay. Sos su copiloto.
- Responde con datos precisos y explica tu decision con fundamento justificado.
- No repitas el texto del médico ni el contexto.
- Cita el nivel de indicacion que tiene tu respuesta (p. ej., clase I, IIa, IIb, III) si aplica.
- Basá las recomendaciones en consensos/guidelines vigentes (p. ej., SAC/SAHA/ESC/ACC/AHA) menciona la cita en los casos que correspondan.
- Si no tenés suficiente información, pedí más datos específicos.
- No hagas suposiciones sin fundamento.
- Evitá respuestas genéricas o vagas. Usa lenguaje clínico tecnico y preciso.
  `.trim();

  const history = await loadChatHistory();
  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  if (contexto) {
    messages.push({
      role: 'system',
      content: `Contexto del paciente (NO lo repitas en la respuesta):\n${contexto}`
    });
  }

  // Historial previo del chat
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }

  // Turno actual del médico
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

// === Burbujas en vivo (streaming) ===
function aiStartAssistantBubble() {
  ensureChatCopyStyles();

  const box = document.getElementById('ai-chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-bubble assistant';

  const content = document.createElement('div');
  content.className = 'chat-content';
  content.textContent = '';

  const btn = document.createElement('span'); // ← span, no button
  btn.className = 'chat-copy';
  btn.title = 'Copiar respuesta';
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.textContent = '⧉';

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(content.textContent || '');
      const old = btn.textContent; btn.textContent = '✓';
      setTimeout(() => btn.textContent = old, 900);
    } catch (err) { console.error('[MedReg] No pude copiar:', err); }
  };
  btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); doCopy(); });
  btn.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter' || ev.key===' ') { ev.preventDefault(); doCopy(); } });

  // Drag → “Extracciones”
  const setDragData = (ev) => {
    try {
      ev.dataTransfer?.setData('text/plain', content.textContent || '');
      ev.dataTransfer.effectAllowed = 'copy';
    } catch {}
  };
  el.setAttribute('draggable','true');
  btn.setAttribute('draggable','true');
  el.addEventListener('dragstart', setDragData);
  btn.addEventListener('dragstart', setDragData);

  el.appendChild(content);
  el.appendChild(btn);
  box.appendChild(el);
  return el;
}

function aiAppendToBubble(el, chunk) {
  if (!el || !chunk) return;
  const tgt = el.querySelector?.('.chat-content') || el;
  tgt.textContent += chunk;
}

function aiFinishAssistantBubble(_el) { /* noop */ }


function aiShowTypingIndicator(show=true){
  let tip = document.getElementById('ai-typing-dot');
  if (show) {
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'ai-typing-dot';
      tip.className = 'chat-bubble assistant';
      tip.textContent = '…';
      const box = document.getElementById('ai-chat-messages');
      box.appendChild(tip);
      // ⛔️ sin auto-scroll
    }
  } else {
    tip?.remove();
  }
}

// === Streaming SSE con OpenRouter ===
// Formato SSE compatible con chat.completions (delta.content)
async function sendToOpenRouterMessagesStream(messages, {
  onToken, onDone, onError,
  temperature = 0.1, top_p = 0.9, max_tokens = 600
} = {}) {
  const key = await getOpenRouterKeySecure();
  if (!key) throw new Error('Falta configurar la API key de OpenRouter.');
  const model = (document.getElementById('openrouterModel')?.value) || await getOpenRouterModel();
  setOpenRouterModel(model).catch(()=>{});

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'HTTP-Referer': 'https://medex.ar',
      'X-Title': 'MedReg - Sidebar'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p,
      max_tokens,
      stream: true
    })
  });

  if (!res.ok || !res.body) {
    const errTxt = await res.text().catch(()=>String(res.status));
    throw new Error(`OpenRouter HTTP ${res.status}: ${errTxt}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE llega separado por \n\n
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || ''; // queda resto

      for (const chunk of parts) {
        // líneas "data: <json>" (o "data: [DONE]")
        const lines = chunk.split('\n').map(s => s.trim());
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const dataStr = line.replace(/^data:\s?/, '');
          if (dataStr === '[DONE]') {
            onDone?.();
            return;
          }
          try {
            const obj = JSON.parse(dataStr);
            // OpenAI-like delta
            const delta = obj?.choices?.[0]?.delta?.content
                       ?? obj?.choices?.[0]?.message?.content // por si algún proveedor manda chunks completos
                       ?? '';
            if (delta) onToken?.(delta);
          } catch(e) {
            // ignorar JSON parcial
          }
        }
      }
    }
    onDone?.();
  } catch (e) {
    onError?.(e);
    throw e;
  }
}

// ---- Scroll helpers del sidebar ----
function _scrollContainer(){
  // El panel de la extensión scrollea el documento, no #chatSection
  return document.scrollingElement || document.documentElement || document.body;
}
function scrollSidebarToTop(){ const sc = _scrollContainer(); sc.scrollTo({ top: 0, behavior: 'smooth' }); }
function scrollSidebarToBottom(){ const sc = _scrollContainer(); sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }); }





async function callOpenRouterInvestigador(prompt){
  const key   = await getOpenRouterKeySecure();          // ya lo tenés
  const model = await getOpenRouterModel();              // ya lo tenés
  if (!key) throw new Error('Falta configurar OpenRouter API key (Chat IA).');

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://medex.ar',
      'X-Title': 'MedReg Investigador'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Eres un asistente clínico. Devuelve SOLO una lista numerada breve y clara, con ✅/❌/insuficiente y una cita breve de evidencia.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });

  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(data)}`);

  const msg = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.delta?.content || '';
  return (msg || '').trim();
}



// === Renderiza el resultado del análisis INV en la caja de salida ===
function renderResultadoINV(contenido){
  const out = document.getElementById('iaAnalisisOutInv');
  if (!out) {
    console.warn('[MedReg] iaAnalisisOutInv no encontrado');
    return;
  }
  const txt = (contenido || '').toString().trim();
  // Soporta <textarea>, <pre> o <div>
  if (out.tagName === 'TEXTAREA' || out.tagName === 'INPUT') {
    out.value = txt;
  } else {
    out.textContent = txt;
  }
  // Asegura que quede visible
  out.style.display = 'block';
}



// ---- Hook: al extraer HC => scroll al final ----
async function onExtractClick() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    if (!isInjectableUrl(tab.url)) { alert("No puedo extraer de esta página (chrome://, Web Store o visor PDF). Abrí una HCE http/https."); return; }
    const ready = await ensureContentScript(tab.id);
    if (!ready) { alert("No pude conectar con la página. Recargá la HCE e intentá de nuevo."); return; }

    const payload = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: "MEDREG_EXTRACT_DOM" }, (resp) => {
        void chrome.runtime.lastError; resolve(resp || null);
      });
    });
    if (!payload || !payload.rawText) { alert("No se pudo extraer texto desde esta página. Probá recargar la HCE."); return; }

    await addManualExtractionImpl(payload.rawText, {
      tabId: tab.id,
      title: payload.title || tab.title || "Ventana",
      url: payload.url || tab.url || ""
    });

    // ✅ al terminar la extracción, llevar al final del sidebar
    setTimeout(scrollSidebarToBottom, 50);

  } catch (e) {
    console.error("[MedReg] Error en extracción:", e);
    alert("Error al extraer. Revisá permisos y consola.");
  }
}

// ---- Hook: al enviar prompt del chat => scroll al inicio ----
(function wireChatScroll(){
  const btn = document.getElementById('btnEnviarIA');
  if (btn) btn.addEventListener('click', ()=> { scrollSidebarToTop(); }, {capture:true});
  const textarea = document.getElementById('ai_question') 
                || document.querySelector('#ai-chat-composer textarea, #ai-chat-input, #chatInput');
  if (textarea) {
    textarea.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' && !e.shiftKey) { // envío “enter” sin shift
        setTimeout(scrollSidebarToTop, 10);
      }
    }, {capture:true});
  }
})();


// ---------- Llamada OpenRouter (ajustada para respuestas concisas y poco "preguntonas") ----------
async function sendToOpenRouterMessages(messages){
  const key = await getOpenRouterKeySecure();
  if (!key) throw new Error('Falta configurar la API key de OpenRouter.');
  const model = (document.getElementById('openrouterModel')?.value) || await getOpenRouterModel();
  setOpenRouterModel(model).catch(()=>{});

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://medex.ar',
      'X-Title': 'MedReg - Sidebar'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,         // menos divagación
      top_p: 0.9,
      frequency_penalty: 0.4,   // reduce repeticiones/eco
      presence_penalty: 0.0,
      max_tokens: 1000
    })
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(()=>String(res.status));
    throw new Error(`OpenRouter HTTP ${res.status}: ${errTxt}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '(sin respuesta)';
  return content;
}

// ---------- Unificado: OpenRouter primero → fallback backend CHAT (no Protocolos) ----------
// ---------- Unificado: OpenRouter primero → fallback backend CHAT (sin duplicar burbujas) ----------
async function sendAIUnified(message){
  // 1) Intento streaming con OpenRouter
  try {
    const messages = await buildOpenRouterMessages(message);
    const bubble = aiStartAssistantBubble();
    aiShowTypingIndicator(true);

    await sendToOpenRouterMessagesStream(messages, {
      onToken: (t) => aiAppendToBubble(bubble, t),
      onDone: async () => {
        aiShowTypingIndicator(false);
        aiFinishAssistantBubble(bubble);
        // guardar en historial la respuesta ya renderizada
        const histA = await loadChatHistory();
        histA.push({ role: 'assistant', content: bubble.textContent });
        await saveChatHistory(histA);
      },
      onError: () => { aiShowTypingIndicator(false); }
    });

    // Como ya streameamos y guardamos, devolvemos text + flag
    return { text: document.querySelector('#ai-chat-messages .chat-bubble.assistant:last-child')?.textContent || '', streamed: true };
  } catch (e) {
    console.warn('[MedReg] Streaming OpenRouter falló, intento no-stream:', e);
  }

  // 2) Fallback: OpenRouter sin streaming
  try {
    const ans = await sendToOpenRouterMessages(await buildOpenRouterMessages(message));
    return { text: ans, streamed: false };
  } catch (e2) {
    console.warn('[MedReg] OpenRouter no-stream falló, intento backend /chat_ia:', e2);
  }

  // 3) Fallback final: backend local /chat_ia (sin streaming)
  const ans = await sendToBackendChat(message);
  return { text: ans, streamed: false };
}

// ---------- Wiring de UI del Chat IA (único listener; sin duplicados) ----------
(function initAIChatUI(){
  if (window._aiChatInit) return;          // <-- evita listeners duplicados
  window._aiChatInit = true;

  const btnSend  = document.getElementById('btnEnviarIA');
  const btnClr   = document.getElementById('btnLimpiarIA');
  const txt      = document.getElementById('ai_question');
  const btnKey   = document.getElementById('btnSetOpenRouterKey');
  const selModel = document.getElementById('openrouterModel');

  // Modelo preferido
  getOpenRouterModel().then((m)=>{ if (selModel) selModel.value = m; }).catch(()=>{});

  // Guardar / pedir API key
  btnKey && btnKey.addEventListener('click', async ()=>{
    const old = await getOpenRouterKeySecure();
    const k = prompt('Pegá tu API key de OpenRouter', old || '');
    if (k !== null) {
      await setOpenRouterKeySecure(k.trim());
      alert('API key guardada en Chrome (sync).');
    }
  });

  // Función de envío unificada (usa streaming si está disponible)
async function sendMsg(q, showUser=true){
  scrollSidebarToTop();              // ⬅️ forzamos scroll al inicio SIEMPRE que se dispara un envío
  const box = document.getElementById('ai-chat-messages');
  if (!q || !box) return;

  aiSetPending(true);
  try {
    const { text, streamed } = await sendAIUnified(q);
    if (!streamed) {
      aiPushMessage('assistant', text || '(sin respuesta)');
      const histA = await loadChatHistory();
      histA.push({ role: 'assistant', content: text || '(sin respuesta)' });
      await saveChatHistory(histA);
    }
  } catch (e) {
    aiPushMessage('assistant', `⚠️ ${e?.message || e}`);
  } finally {
    aiSetPending(false);
    const txt = document.getElementById('ai_question');
    if (txt) txt.value = '';
  }
}

async function sendMsg(q, showUser=true){
  scrollSidebarToTop();
  const box = document.getElementById('ai-chat-messages');
  if (!q || !box) return;

  // 👇 MOSTRAR burbuja del usuario y persistir en historial
  if (showUser) {
    aiPushMessage('user', q);
    const histU = await loadChatHistory();
    histU.push({ role: 'user', content: q });
    await saveChatHistory(histU);
  }

  aiSetPending(true);
  try {
    const { text, streamed } = await sendAIUnified(q);
    if (!streamed) {
      aiPushMessage('assistant', text || '(sin respuesta)');
      const histA = await loadChatHistory();
      histA.push({ role: 'assistant', content: text || '(sin respuesta)' });
      await saveChatHistory(histA);
    }
  } catch (e) {
    aiPushMessage('assistant', `⚠️ ${e?.message || e}`);
  } finally {
    aiSetPending(false);
    const txt = document.getElementById('ai_question');
    if (txt) txt.value = '';
  }
}


  // después de definir async function sendMsg(q, showUser=true){...}
window.medregSendMsg = sendMsg;


  // Enviar por botón
  btnSend && btnSend.addEventListener('click', ()=> sendMsg((txt?.value || '').trim(), true));

  // Enter para enviar (sin Shift)
  txt && txt.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendMsg((txt?.value || '').trim(), true);
    }
  });

  // Botones rápidos (no mostrar el prompt del usuario)
// ——— Prompts rápidos: un solo listener, sin duplicados ———
// ——— Prompts rápidos: un solo listener (sin duplicados) ———
(function wireQuickPrompts(){
  const root = document.getElementById('ai-quick-prompts');
  if (!root || root._wired) return;
  root._wired = true;

  root.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-prompt]');
    if (!b) return;

    const label = (b.textContent || '').toLowerCase();
    const base  = (b.getAttribute('data-prompt') || '').trim();
    const title = b.getAttribute('data-title') || (b.textContent || '').trim();

    // Resto: enviar directo (sin burbuja del usuario)
    if (base) sendMsg(base, false);
  }, { passive: true });
})();



  // Limpiar chat + historial de esta pestaña
  btnClr && btnClr.addEventListener('click', async ()=>{
    const box = document.getElementById('ai-chat-messages');
    if (box) box.innerHTML = '';
    if (txt) txt.value = '';
    const tabId = await getCurrentTabId();
    await chrome.storage.session.remove(chatSessionKey(tabId));
  });



// === Prompts parametrizados: config ===
// === Prompts parametrizados: config ===
const PARAM_PROMPTS = {
  'riesgo-prequirurgico': {
    title: 'Riesgo prequirúrgico',
    fields: [
      { key:'procedimiento', label:'Procedimiento/Cirugía', type:'text', placeholder:'p.ej., colecistectomía laparoscópica' },
      { key:'urgencia', label:'Urgencia', type:'select', options:['Programada','Urgente'] }
    ],
    template: ({procedimiento, urgencia}) =>
      `Valoración de riesgo prequirúrgico para **${procedimiento}** (${urgencia}). ` +
      `Responde con: 1) Clasificación de riesgo clínico-quirúrgico según guía Consenso Argentino de Evaluación de Riesgo Cardiovascular en Cirugía no Cardiaca 2020: devolver si es Leve, Moderado o Alto, ` +
      `2) Si el paciente evaluado requiere: ajustes (anticoagulantes/antiagregantes, antibiótico profilaxis, hipoglucemiantes, etc.), ` +
      `3) Si requiere algun examen complementario extra ademas de los presentados o no. ` +
      `Máx. 1 repregunta sólo si es crítica.`
  },

  'justificativo-os': {
    title: 'Justificativo para Obra Social',
    fields: [
      { key:'tipo', label:'Tipo de justificativo', type:'select', options:['Medicación','Estudio/Procedimiento'] },
      { key:'item', label:'Nombre de la medicación/estudio', type:'text', placeholder:'p.ej., Finerenona 10 mg' },
      { key:'objetivo', label:'Objetivo clínico', type:'text', placeholder:'p.ej., reducir progresión ERC diabética' }
    ],
    template: ({tipo, item, objetivo}) =>
      `Redactar justificativo para Obra Social por **${tipo}**: **${item}**. ` +
      `Incluir: indicación clínica (1–2 líneas), beneficio esperado (“${objetivo}”), ` +
      `riesgo de no otorgarlo, y cierre tipo “Se solicita cobertura según guías vigentes (citar)”.`
  },
    'scores-de-riesgo': {
    title: 'Scores de Riesgo',
    fields: [
      { key:'score', label:'Score', type:'select', options:['Framingham Risk Score','GRACE Score','ASCVD Risk Score','CHADS2-Vasc','Score Revised Cardiac Risk Index','HAS-BLED score','STS ACSD Operative Risk Calculator','EuroSCORE II','TIMI Risk Score','CHA2DS2-VASc Score','Wells Score for DVT','Wells Score for PE','MELD Score','APACHE II Score','SOFA Score','CAPRA Score'] }
    ],
    template: ({score}) =>
      `Calcular con el Score de riesgo seleccionado utilizando los datos proveidos en la extraccion, si falta un item para el calculo pedirlo.`
  },

  'evolucion': {
    title: 'Evolución diaria',
    fields: [
      { key:'motivointernacion', label:'Motivo de internación', type:'text', placeholder:'p.ej., insuficiencia cardíaca descompensada' },
      { key:'examenfisico', label:'Examen físico', type:'text', placeholder:'p.ej., FC/PA, hallazgos relevantes'  },
      { key:'observacion', label:'Observaciones / Plan', type:'text', placeholder:'p.ej., continuar balance negativo, día 3 ATB' }
    ],
    template: ({motivointernacion, examenfisico, observacion}) =>
      `Armá una evolución diaria de internación. ` +
      `Motivo: **${motivointernacion}**. ` +
      `Incluí: signos vitales, balance hídrico, examen físico (${examenfisico}), resultados recientes de laboratorio/imágenes, ` +
      `conducta/plan (${observacion}). ` +
      `Cerrá con 1 línea de interpretación/impresión clínica de IA.`
  },
};

// === Heurística básica: intentar precompletar desde el contexto ===
// === Heurística básica para precompletar desde contexto (ya la tenías)
async function prefillFromContext(keysNeeded){
  const ctx = (await getContextFromExtractionsOnly()) || '';
  const out = {};
  if (keysNeeded.includes('procedimiento')) {
    const m = ctx.match(/(cirug[ií]a|procedimiento|intervenci[oó]n)\s*[:\-]\s*([^\n\.]{5,80})/i);
    if (m) out.procedimiento = m[2].trim();
  }
  // Podés ir sumando heurísticas simples para otras claves si querés
  return out;
}

// === Recientes (ya los usás más abajo; los dejo acá por si los moviste)
async function getPromptRecent(key){
  const k = `medreg.prompt.recent.${key}`;
  const st = await chrome.storage.local.get(k);
  return st[k] || {};
}
async function setPromptRecent(key, data){
  const k = `medreg.prompt.recent.${key}`;
  await chrome.storage.local.set({ [k]: data || {} });
}

// =================== UI del Modal Parametrizable ===================
function ensureParamPromptStyles(){
  if (document.getElementById('pp2-style')) return;
  const st = document.createElement('style');
  st.id = 'pp2-style';
  st.textContent = `
    #pp2-root{position:fixed;inset:0;z-index:9999;display:none}
    #pp2-root .pp2-backdrop{position:absolute;inset:0;background:rgba(16,24,40,.68)}
    #pp2-root .pp2-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:min(560px,95vw);background:#fff;border-radius:12px;padding:14px;box-shadow:0 20px 40px rgba(0,0,0,.28);
      display:flex;flex-direction:column;gap:10px}
    #pp2-root .pp2-title{font-weight:700;color:#0d47a1}
    #pp2-form .pp2-row{display:flex;flex-direction:column;gap:6px;margin:6px 0}
    #pp2-form label{font-size:13px;color:#334155;font-weight:600}
    #pp2-form input, #pp2-form select, #pp2-form textarea{
      border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:14px;width:100%;
    }
    #pp2-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}
    #pp2-actions .btn{background:#0d47a1;color:#fff;border:none;border-radius:8px;padding:8px 12px;cursor:pointer}
    #pp2-actions .btn.muted{background:#e2e8f0;color:#0f172a}
  `;
  document.head.appendChild(st);
}
function ensureParamPromptDOM(){
  if (document.getElementById('pp2-root')) return;
  const root = document.createElement('div');
  root.id = 'pp2-root';
  root.innerHTML = `
    <div class="pp2-backdrop"></div>
    <div class="pp2-card" role="dialog" aria-modal="true" aria-labelledby="pp2-title">
      <div id="pp2-title" class="pp2-title">Completar</div>
      <div id="pp2-desc" style="font-size:13px;color:#475569"></div>
      <form id="pp2-form"></form>
      <div id="pp2-actions">
        <button type="button" id="pp2-cancel" class="btn muted">Cancelar</button>
        <button type="button" id="pp2-ok" class="btn">Generar</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  root.querySelector('.pp2-backdrop').addEventListener('click', ()=> root.style.display='none');
  document.getElementById('pp2-cancel').addEventListener('click', ()=> root.style.display='none');
}
function pp2Show(){ document.getElementById('pp2-root').style.display='block'; }
function pp2Hide(){ document.getElementById('pp2-root').style.display='none'; }

function renderParamRow(f, val=''){
  const id = `pp2-${f.key}`;
  if (f.type === 'select') {
    const opts = (f.options||[]).map(o=>`<option value="${o}">${o}</option>`).join('');
    return `<div class="pp2-row">
      <label for="${id}">${f.label}</label>
      <select id="${id}">${opts}</select>
    </div>`;
  }
  const ph = f.placeholder ? `placeholder="${f.placeholder}"` : '';
  const isLong = (f.type === 'textarea');
  const tag = isLong ? 'textarea' : 'input';
  const attrs = isLong ? `rows="3"` : `type="text"`;
  return `<div class="pp2-row">
    <label for="${id}">${f.label}</label>
    <${tag} id="${id}" ${attrs} ${ph}></${tag}>
  </div>`;
}


function resolveParamKey(raw){
  const s = (raw || '').toLowerCase();
  if (s.includes('riesgo'))      return 'riesgo-prequirurgico';
  if (s.includes('justific'))    return 'justificativo-os';
    if (s.includes('scores'))    return 'scores-de-riesgo';
  if (s.includes('evolu'))       return 'evolucion';
  return (raw || '').trim();
}



// === Apertura del modal + armado del prompt final
async function openParamPrompt(keyLike){
  const k = resolveParamKey(keyLike);
  const cfg = PARAM_PROMPTS[k];
  if (!cfg) {
    alert('Prompt no configurado: ' + keyLike);
    return;
  }

  ensureParamPromptStyles();
  ensureParamPromptDOM();

  const titleEl = document.getElementById('pp2-title');
  const descEl  = document.getElementById('pp2-desc');
  const formEl  = document.getElementById('pp2-form');
  const okBtn   = document.getElementById('pp2-ok');

  titleEl.textContent = cfg.title;
  descEl.textContent  = 'Completá los datos. Usaremos también el contexto extraído de la HCE que ya tengas en “Extracciones”.';

  const keys = (cfg.fields||[]).map(f=>f.key);
  const fromCtx = await prefillFromContext(keys);
  const recent  = await getPromptRecent(k);
  const initVals = Object.assign({}, recent, fromCtx);

  formEl.innerHTML = (cfg.fields||[]).map(f => renderParamRow(f)).join('');
  (cfg.fields||[]).forEach(f => {
    const el = document.getElementById(`pp2-${f.key}`);
    if (!el) return;
    const v = (initVals[f.key] ?? '');
    if (f.type === 'select' && v && Array.from(el.options).some(o => o.value === v)) el.value = v;
    else el.value = v;
  });

  okBtn.onclick = async () => {
    const data = {};
    for (const f of (cfg.fields||[])) {
      const el = document.getElementById(`pp2-${f.key}`);
      data[f.key] = (el?.value || '').trim();
    }
    await setPromptRecent(k, data);
    const finalPrompt = cfg.template(data);

    const sender = window.medregSendMsg || window.sendMsg;
    if (typeof sender === 'function') {
      pp2Hide();
      sender(finalPrompt, false);
    } else {
      alert('No pude enviar el prompt. Recargá el sidebar.');
    }
  };

  pp2Show();
}

// === Wiring: clicks en botones con data-pprompt="..." ===
(function wireParamPromptButtons(){
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-pprompt]');
    if (!b) return;

    // robustez: intentar inferir la key aunque el atributo tenga un texto largo
    const raw = b.dataset.pprompt || b.getAttribute('data-pprompt') || b.textContent || '';
    const key = resolveParamKey(raw);

    // si el botón está en un form, evitá submit
    if (b.tagName === 'BUTTON' && !b.getAttribute('type')) b.setAttribute('type','button');

    // este listener NO es passive, así que se puede prevenir default
    e.preventDefault();
    openParamPrompt(key);
  }, { capture:true }); // <- sin "passive:true"
})();


// === Guardar “últimos usados” por tipo de prompt (para autocompletar la próxima vez) ===
async function getPromptRecent(key){
  const k = `medreg.prompt.recent.${key}`;
  const st = await chrome.storage.local.get(k);
  return st[k] || {};
}
async function setPromptRecent(key, data){
  const k = `medreg.prompt.recent.${key}`;
  await chrome.storage.local.set({ [k]: data || {} });
}

})();

renderStoredChatHistory().catch(()=>{});


// ===================== Export / CSV helpers (sesión) =====================
function toCSV(rows) {
  if (!rows?.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (s) => {
    const str = (s ?? '').toString();
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(','));
  return lines.join('\n');
}
async function loadSessionRows() {
  const { [SESSION_ROWS_KEY]: arr } = await chrome.storage.local.get(SESSION_ROWS_KEY);
  return Array.isArray(arr) ? arr : [];
}
async function saveSessionRows(arr) {
  await chrome.storage.local.set({ [SESSION_ROWS_KEY]: Array.isArray(arr) ? arr : [] });
}
function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ===== Obtener lista de criterios visibles en orden (para armar columnas)
function getCurrentCriteriosList() {
  const list = [];
  document.querySelectorAll("#contenedorCriterios .criterio").forEach((item, idx) => {
    const texto = item.querySelector(".texto-clave")?.textContent?.trim() || `Item ${idx+1}`;
    const chk = item.querySelector(".chk");
    const val = item.querySelector(".valorOperador");
    list.push({
      texto,                                     // descripción del criterio (no se usa en el header, solo por si querés auditar)
      checked: !!(chk && chk.checked),
      comentario: (val?.value || "").trim()
    });
  });
  return list;
}

// ===== Arma UNA fila por caso con columnas ID, Apellido, Nombre, DNI, Observacion, Item1/Comentario1, ...
function collectCaseRow(paciente) {
  const obs = document.getElementById("obs")?.value?.trim() || "";
  const criterios = getCurrentCriteriosList();

  // Cabecera fija:
  const row = {
    "ID":        paciente.id       || "",
    "Apellido":  paciente.apellido || "",
    "Nombre":    paciente.nombre   || "",
    "DNI":       paciente.dni      || "",
    "Observacion": obs
  };

  // Agregamos pares Item N / Comentario N
  criterios.forEach((c, i) => {
    const n = i + 1;
    row[`Item ${n}`] = c.checked ? "✔" : "";
    row[`Comentario ${n}`] = c.comentario || "";
  });

  return row;
}




// ===================== Modal de REGISTRO =====================
function openRegistroModal() {
  document.getElementById('registroModal').style.display = 'flex';
}
function closeRegistroModal() {
  document.getElementById('registroModal').style.display = 'none';
  // no limpiamos campos para poder repetir rápidamente (opcional)
}
async function acceptRegistroModal() {
  const paciente = {
    apellido: document.getElementById('reg_apellido')?.value?.trim() || '',
    nombre:   document.getElementById('reg_nombre')?.value?.trim() || '',
    dni:      document.getElementById('reg_dni')?.value?.trim() || '',
    id:       document.getElementById('reg_id')?.value?.trim() || ''
  };

  // Construye UNA fila por caso con headers = nombre real de cada ítem
  const fila = buildCaseRowForCSV(paciente);

  // Validación mínima: que haya columnas de ítems/campos (no hace falta que estén tildados)
  const tieneAlgunaColumnaDeItem = Object.keys(fila).some(
    k => /\(comentario\)$/.test(k) || (!["ID","Apellido","Nombre","DNI","Observacion"].includes(k))
  );
  if (!tieneAlgunaColumnaDeItem) { alert('No hay criterios en el estudio activo.'); return; }

  // Acumular
  const current = await loadSessionRows();
  current.push(fila);
  await saveSessionRows(current);

  // Feedback + contador
  updateSessionCount(current.length);
  alert(`Caso registrado. Total en la sesión: ${current.length}.`);

  // Cerrar modal (dejamos campos por comodidad)
  closeRegistroModal();
}


function getCurrentCriteriosForCSV() {
  // Lee del DOM lo que se está viendo en #contenedorCriterios
  const items = [];
  document.querySelectorAll("#contenedorCriterios .criterio").forEach((div) => {
    const claveBase = div.getAttribute("data-clave") || ""; // nombre puro del ítem
    const chk = div.querySelector(".chk");
    const comment = div.querySelector(".valorOperador")?.value?.trim() || "";
    items.push({
      header: claveBase,                   // <-- esto será el encabezado de columna
      checked: !!(chk && chk.checked),
      comentario: comment
    });
  });
  return items;
}

function updateSessionCount(n) {
  const sp = document.getElementById('sessionCount');
  if (sp) sp.textContent = n ? `${n} caso(s) en la sesión` : `Sin casos registrados`;
}

// Aplana las filas para CSV, generando encabezados dinámicos compatibles entre sí
function buildCSVFromSessionRows(rows) {
  if (!rows?.length) return '';

  // 1) Descubrir todos los headers en orden de primera aparición
  const headers = [];
  const seen = new Set();

  // Orden base siempre primero:
  const base = ["ID","Apellido","Nombre","DNI","Observacion"];
  base.forEach(h => { seen.add(h); headers.push(h); });

  // Recolecto el resto en orden de aparición por fila
  for (const r of rows) {
    Object.keys(r).forEach((k) => {
      if (!seen.has(k)) { seen.add(k); headers.push(k); }
    });
  }

  // 2) Escapado CSV
  const esc = (s) => {
    const str = (s ?? '').toString();
    return /[",\n]/.test(str) ? `"${str.replace(/"/g,'""')}"` : str;
  };

  // 3) Construcción
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => esc(r[h] ?? "")).join(','));
  }
  return lines.join('\n');
}



/////contador

document.addEventListener("DOMContentLoaded", async () => {
  // ... (lo que ya tenías)
  const list = await loadExtractions();
  renderExtractions(list);

  // contador inicial de casos de sesión
  const rows = await loadSessionRows();
  updateSessionCount(rows.length);

  // listeners ya existentes...
});

// ===== Campos libres dinámicos en modal REGISTRO
function addRegistroFieldRow(labelVal = "", valueVal = "") {
  const wrap = document.createElement('div');
  wrap.className = 'inline-group';
  wrap.innerHTML = `
    <input class="reg_field_label" placeholder="Etiqueta (ej. Centro)" value="${labelVal}">
    <input class="reg_field_value" placeholder="Valor" value="${valueVal}">
    <button class="reg_field_del" style="width:auto;background:#ef4444">✕</button>
  `;
  wrap.querySelector('.reg_field_del').addEventListener('click', () => wrap.remove());
  document.getElementById('reg_fields').appendChild(wrap);
}

document.getElementById('reg_add_field')?.addEventListener('click', (e) => {
  e.preventDefault();
  addRegistroFieldRow();
});

function collectRegistroExtraFields() {
  const out = [];
  document.querySelectorAll('#registroModal .reg_field_label').forEach((labEl, i) => {
    const label = (labEl.value || '').trim();
    const valEl = labEl.parentElement.querySelector('.reg_field_value');
    const value = (valEl?.value || '').trim();
    if (label) out.push([label, value]);   // pares [Etiqueta, Valor]
  });
  return out;
}

function getCurrentCriteriosForCSV() {
  // Lee del DOM lo que se está viendo en #contenedorCriterios
  const items = [];
  document.querySelectorAll("#contenedorCriterios .criterio").forEach((div) => {
    const claveBase = div.getAttribute("data-clave") || ""; // nombre puro del ítem
    const chk = div.querySelector(".chk");
    const comment = div.querySelector(".valorOperador")?.value?.trim() || "";
    items.push({
      header: claveBase,                   // <-- encabezado de columna
      checked: !!(chk && chk.checked),
      comentario: comment
    });
  });
  return items;
}

function buildCaseRowForCSV(paciente) {
  const obs = document.getElementById("obs")?.value?.trim() || "";
  const criterios = getCurrentCriteriosForCSV();     // ítems visibles ahora
  const extras = collectRegistroExtraFields();       // pares [Etiqueta, Valor]

  // Cabecera fija
  const row = {
    "ID":        paciente.id       || "",
    "Apellido":  paciente.apellido || "",
    "Nombre":    paciente.nombre   || "",
    "DNI":       paciente.dni      || "",
    "Observacion": obs
  };

  // Campos libres (cada etiqueta se vuelve una columna)
  for (const [label, value] of extras) {
    row[label] = value || "";
  }

  // Ítems: 2 columnas por ítem -> [Nombre] y [Nombre] (comentario)
  criterios.forEach((c) => {
    const colItem = c.header || "Ítem";
    row[colItem] = c.checked ? "✔" : "";
    row[`${colItem} (comentario)`] = c.comentario || "";
  });

  return row;
}
// ===================== Eventos UI principales =================================================================================================================================================================================
const _btnAnalizar = document.getElementById("btnAnalizar"); if (_btnAnalizar) _btnAnalizar.addEventListener("click", analizar);
const _btnPreMatch = document.getElementById("btnPreMatch"); if (_btnPreMatch) _btnPreMatch.addEventListener("click", preMatch);
const _btnLimpiar = document.getElementById("btnLimpiar"); if (_btnLimpiar) _btnLimpiar.addEventListener("click", limpiarTodo);
const _btnRegistrar = document.getElementById("btnRegistrar"); if (_btnRegistrar) _btnRegistrar.addEventListener("click", openRegistroModal);
const _btnConfirmarRegistro = document.getElementById("btnConfirmarRegistro"); if (_btnConfirmarRegistro) _btnConfirmarRegistro.addEventListener("click", acceptRegistroModal);
const _btnAbrirModal = document.getElementById("btnAbrirModal"); if (_btnAbrirModal) _btnAbrirModal.addEventListener("click", abrirModal);
const _btnEditarEstudio = document.getElementById("btnEditarEstudio"); if (_btnEditarEstudio) _btnEditarEstudio.addEventListener("click", editarEstudio);
const _btnEliminarEstudio = document.getElementById("btnEliminarEstudio"); if (_btnEliminarEstudio) _btnEliminarEstudio.addEventListener("click", eliminarEstudio);
const _btnGuardarEstudio = document.getElementById("btnGuardarEstudio"); if (_btnGuardarEstudio) _btnGuardarEstudio.addEventListener("click", guardarEstudio);
const _btnCerrarModal = document.getElementById("btnCerrarModal"); if (_btnCerrarModal) _btnCerrarModal.addEventListener("click", cerrarModal);
const _btnAgregarCriterio = document.getElementById("btnAgregarCriterio"); if (_btnAgregarCriterio) _btnAgregarCriterio.addEventListener("click", agregarCriterio);
const _estudioEl = document.getElementById("estudio"); if (_estudioEl) _estudioEl.addEventListener("change", renderCriterios);

// Modal registro
document.getElementById('reg_cancel')?.addEventListener('click', closeRegistroModal);
document.getElementById('reg_accept')?.addEventListener('click', acceptRegistroModal);

// Delegación chips ❌ del preview del modal
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btnEliminarCriterio");
  if (!btn) return;
  const cat = btn.getAttribute("data-cat");
  const idx = parseInt(btn.getAttribute("data-idx"), 10);
  if (Number.isInteger(idx)) eliminarCriterio(cat, idx);
});
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("chk")) { /* sólo toggle visual */ }
});

// Descargar listado (toda la sesión)
document.getElementById('btnExportListado')?.addEventListener('click', async () => {
  const rows = await loadSessionRows();
  if (!rows.length) { alert('No hay casos en la sesión.'); return; }
  const csv = buildCSVFromSessionRows(rows);
  const fname = `medreg_listado_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  downloadCSV(fname, csv);
});

// Borrar listado (resetea)
document.getElementById('btnClearListado')?.addEventListener('click', async () => {
  if (!confirm('¿Borrar todo el listado de esta sesión?')) return;
  await saveSessionRows([]);
  updateSessionCount(0);
});


//////////////////////////////////////////////////////////////////////////////////////////////////////// 01-11
document.getElementById('btnAnalisisIAInv')?.addEventListener('click', async () => {
  const out = document.getElementById('iaAnalisisOutInv');
  if (out) { out.style.display = 'block'; out.value = 'Analizando…'; }
  await runAnalisisIA_INV();   // ← arma prompt con criterios + extracciones y compara
});



// ===================== Notas (UI) =====================
async function loadNotas() {
  const st = await chrome.storage.sync.get(NOTAS_KEY);
  const notas = Array.isArray(st[NOTAS_KEY]) ? st[NOTAS_KEY] : [];
  renderNotas(notas);
}
function renderNotas(notas) {
  const cont = document.getElementById('notas-list');
  if (!cont) return;
  cont.innerHTML = '';
  notas
    .slice()
    .sort((a,b)=> new Date(b.ts) - new Date(a.ts))
    .forEach((n, idx) => {
      const el = document.createElement('div');
      el.className = 'card p-2';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600">${n.title || '(sin tÃ­tulo)'}</div>
            <div style="font-size:12px;opacity:.7">${new Date(n.ts).toLocaleString()}</div>
          </div>
          <button data-idx="${idx}" class="btn muted" style="width:auto">Eliminar</button>
        </div>
        <div style="margin-top:6px;white-space:pre-wrap">${n.text || ''}</div>
      `;
      el.querySelector('button').addEventListener('click', async (e) => {
        const i = Number(e.currentTarget.dataset.idx);
        const st = await chrome.storage.sync.get(NOTAS_KEY);
        const arr = Array.isArray(st[NOTAS_KEY]) ? st[NOTAS_KEY] : [];
        arr.splice(i,1);
        await chrome.storage.sync.set({ [NOTAS_KEY]: arr });
        loadNotas();
      });
      cont.appendChild(el);
    });
}
(function initNotasUI(){
  const addBtn = document.getElementById('nota-add');
  const clrBtn = document.getElementById('nota-clear');
  addBtn && addBtn.addEventListener('click', async () => {
    const titleEl = document.getElementById('nota-title');
    const textEl  = document.getElementById('nota-text');
    const title = (titleEl?.value || '').trim();
    const text  = (textEl?.value || '').trim();
    if (!title && !text) return;
    const st = await chrome.storage.sync.get(NOTAS_KEY);
    const arr = Array.isArray(st[NOTAS_KEY]) ? st[NOTAS_KEY] : [];
    arr.push({ title, text, ts: new Date().toISOString() });
    await chrome.storage.sync.set({ [NOTAS_KEY]: arr });
    if (titleEl) titleEl.value = '';
    if (textEl)  textEl.value  = '';
    loadNotas();
  });
  clrBtn && clrBtn.addEventListener('click', () => {
    const titleEl = document.getElementById('nota-title');
    const textEl  = document.getElementById('nota-text');
    if (titleEl) titleEl.value = '';
    if (textEl)  textEl.value  = '';
  });
  loadNotas();
})();

// ===================== Agenda (Google Calendar) =====================
async function gCall(type, payload) {
  return new Promise((resolve) => { chrome.runtime.sendMessage({ type, payload }, resolve); });
}
async function refreshEvents() {
  const res = await gCall('GAPI_LIST_EVENTS');
  const box = document.getElementById('events-list');
  if (!res?.ok) {
    box.innerHTML = `<div class="text-red-600">Error: ${res?.error || 'No se pudo listar eventos'}</div>`;
    return;
  }
  if (!res.data?.items?.length) {
    box.innerHTML = `<div class="opacity-70">No hay eventos prÃ³ximos.</div>`;
    return;
  }
  box.innerHTML = '';
  res.data.items.forEach(ev => {
    const start = ev.start?.dateTime || ev.start?.date;
    const end = ev.end?.dateTime || ev.end?.date;
    const el = document.createElement('div');
    el.className = 'card p-2';
    el.innerHTML = `
      <div class="font-semibold">${ev.summary || '(Sin tÃ­tulo)'}</div>
      <div>${start} â†’ ${end || ''}</div>
      <div class="opacity-70">${ev.description || ''}</div>
    `;
    box.appendChild(el);
  });
}
document.getElementById('glogin').addEventListener('click', async () => {
  const res = await gCall('GAPI_LOGIN');
  if (!res?.ok) { alert('Error al conectar con Google: ' + (res?.error || 'desconocido')); return; }
  refreshEvents();
});
document.getElementById('glogout').addEventListener('click', async () => {
  await gCall('GAPI_LOGOUT');
  document.getElementById('events-list').innerHTML = '<div class="opacity-70">SesiÃ³n cerrada.</div>';
});
document.getElementById('evt-create')?.addEventListener('click', async () => {
  const summary = document.getElementById('evt-title')?.value?.trim();
  const description = document.getElementById('evt-desc')?.value?.trim();
  const startStr = document.getElementById('evt-start')?.value;
  const endStr   = document.getElementById('evt-end')?.value;
  if (!summary || !startStr || !endStr) { alert('CompletÃ¡ tÃ­tulo, inicio y fin.'); return; }
  const start = new Date(startStr);
  const end   = new Date(endStr);
  if (isNaN(start) || isNaN(end)) { alert('Fechas invÃ¡lidas.'); return; }
  if (end <= start) { alert('La hora de fin debe ser posterior al inicio.'); return; }
  const res = await gCall('GAPI_CREATE_EVENT', {
    summary, description, startISO: start.toISOString(), endISO: end.toISOString()
  });
  if (!res?.ok) { alert('No se pudo crear el evento: ' + (res?.error || 'error')); return; }
  document.getElementById('evt-title').value = '';
  document.getElementById('evt-desc').value  = '';
  document.getElementById('evt-start').value = '';
  document.getElementById('evt-end').value   = '';
  refreshEvents();
});

// ===================== Init general =====================
function mostrarLoader(_) {}
function habilitarUI(_) {}
function inicializarApp() {
  mostrarLoader(true);
  Promise.all([cargarTerminologia(), cargarReglasCruce()])
    .then(() => { mostrarLoader(false); habilitarUI(true); })
    .catch((e) => { console.error(e); mostrarLoader(false); habilitarUI(false); });
}
actualizarSelector();
renderCriterios();
inicializarApp();

document.addEventListener("DOMContentLoaded", async () => {
  const list = await loadExtractions();
  renderExtractions(list);
  document.getElementById("btnExtractHC").addEventListener("click", onExtractClick);
  document.getElementById("btnRegistroLocal")?.addEventListener("click", () => showOnly("registro"));
  document.getElementById("btnProtocolos")?.addEventListener("click", async () => {
    showOnly("protocolos");
    if (!document.getElementById("protoList") || !document.getElementById("protoList").children.length) {
      await loadProtocolos();
    }
  });
  document.getElementById("btnChatIA")?.addEventListener("click", () => showOnly("chat"));
  document.getElementById("btnNotas")?.addEventListener("click", () => showOnly("notas"));
  document.getElementById("btnAgenda")?.addEventListener("click", () => showOnly("agenda"));
  showOnly(null);
});

document.getElementById("btnAgenteDeep")?.addEventListener("click", () => showOnly("agente"));

function ensureChatCopyStyles(){
  let st = document.getElementById('medreg-chat-copy-style');
  const css = `
    .chat-bubble{ position: relative; padding-right: 10px; padding-bottom: 32px; }
    .chat-bubble .chat-content{ white-space: pre-wrap; }
    .chat-bubble .chat-copy{
      position:absolute; bottom:6px; right:6px;
      display:inline-flex !important; align-items:center; justify-content:center;
      width:auto !important; height:24px; min-width:24px;
      padding:2px 6px; border-radius:6px; border:1px solid rgba(0,0,0,.2);
      background:#fff; opacity:.9; cursor:pointer; user-select:none;
      font-size:12px; line-height:1;
    }
    .chat-bubble .chat-copy:hover{ opacity:1 }
  `;
  if (st) { st.textContent = css; return; }
  st = document.createElement('style');
  st.id = 'medreg-chat-copy-style';
  st.textContent = css;
  document.head.appendChild(st);
}



// ===== Atajo de teclado para "Extraer HC" (Alt+R) =====
document.addEventListener('keydown', (e) => {
  const t = (e.target && e.target.tagName || '').toLowerCase();
  if (t === 'input' || t === 'textarea' || (e.target && e.target.isContentEditable)) return;
  if (e.altKey && (e.key || '').toLowerCase() === 'r') {
    e.preventDefault();
    document.getElementById('btnExtractHC')?.click();
  }
}, { capture:true });

document.getElementById('btnExtractHC')?.setAttribute('title', 'Atajo: Alt+R');

// Agente Deep
// ================== AGENTE DEEP — Wiring UI (bloque completo) ==================// ================== AGENTE DEEP — Wiring UI (bloque completo) ==================
(() => {
  const agentStream   = document.getElementById("agentLive");    // <pre> transmisión
  const agentOutput   = document.getElementById("agentResult");  // <pre> resultado
  const agentPrompt   = document.getElementById("agentMission"); // <textarea> misión
  const agentStatusEl = document.getElementById("agentStatus");  // <span> estado

  let agentPort = null;

  function setStatus(s){ if (agentStatusEl) agentStatusEl.textContent = s; }
  function appendLog(line){
    if (!agentStream) return;
    const wasEmpty = !agentStream.textContent;
    agentStream.textContent += (wasEmpty ? "" : "\n") + String(line || "");
    agentStream.scrollTop = agentStream.scrollHeight;
  }
  function showAnswerText(txt){
    if (!agentOutput) return;
    agentOutput.textContent = (txt || "").trim() || "(sin salida)";
  }
  function showJson(obj){
    if (!agentOutput) return;
    try { agentOutput.textContent = JSON.stringify(obj, null, 2); }
    catch { agentOutput.textContent = String(obj || ""); }
  }

  function ensureAgentPort(){
    if (agentPort) return agentPort;
    try {
      agentPort = chrome.runtime.connect({ name: "MEDREG_AGENT" });
    } catch(e){
      appendLog("⚠️ No pude abrir puerto al background: " + (e?.message || e));
      return null;
    }

    agentPort.onMessage.addListener((msg) => {
      try {
        if (msg?.type === "LOG") {
          appendLog(msg.message || "");
          return;
        }
        if (msg?.type === "RESULT_ANSWER") {
          const ans = msg.payload?.answer || "";
          showAnswerText(ans);
          setStatus("listo");
          return;
        }
        if (msg?.type === "ERROR") {
          appendLog("⚠️ " + (msg.message || "Error"));
          setStatus("error");
          return;
        }
      } catch(_){}
    });

    agentPort.onDisconnect.addEventListener?.("disconnect", ()=>{}); // compat
    agentPort.onDisconnect.addListener(() => {
      try {
        appendLog("[port desconectado]");
      } catch(_){}
      setStatus("idle");
      agentPort = null;
    });

    return agentPort;
  }

  // Botón: START (decide si es Macro o Individual según la misión)
  document.getElementById("btnAgentStart")?.addEventListener("click", async () => {
    const port = ensureAgentPort();
    if (!port) return;

    if (agentStream) agentStream.textContent = "";
    if (agentOutput) agentOutput.textContent = "";
    setStatus("en ejecución…");

    const prompt = (agentPrompt?.value || "").trim();
    let tabId = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id || null;
    } catch(_){}

    // Heurística simple: si la misión sugiere “lista/mis pacientes/páginas” ⇒ Macro
    const isMacro = /\b(lista|mis\s+pacientes|p[aá]g(?:ina|inas)?)\b/i.test(prompt);

    try {
      if (isMacro) {
        // Macro clínico: por defecto 3 páginas / 45 pacientes
        port.postMessage({ type: "RUN_MACRO", payload: { tabId, prompt, pages: 3, max: 45 } });
        appendLog("Macro Clínico iniciado (3 páginas, máx 45).");
      } else {
        // Caso individual en la HCE activa
        port.postMessage({ type: "RUN_AGENT", payload: { tabId, prompt } });
        appendLog("Agente iniciado (paciente actual).");
      }
    } catch (e) {
      appendLog("⚠️ No pude iniciar: " + (e?.message || e));
      setStatus("error");
    }
  });

  // Botón: STOP
  document.getElementById("btnAgentStop")?.addEventListener("click", () => {
    try { ensureAgentPort()?.postMessage({ type: "STOP_AGENT" }); } catch(_){}
  });

  // Botón: Agregar al Contexto (usa tu pipeline existente si está disponible)
  document.getElementById("btnAgentToContext")?.addEventListener("click", () => {
    try {
      const txt = (agentOutput?.textContent || "").trim();
      if (!txt) return;
      if (typeof window.addManualExtraction === "function") {
        window.addManualExtraction(txt, { title: "Agente Deep", url: location.href });
        appendLog("➕ Agregado al Contexto (Extracciones).");
      } else {
        appendLog("ℹ️ No encontré addManualExtraction(); copiá/pegá manual.");
      }
    } catch(_){}
  });
})();



document.getElementById("btnExportEstudio")?.addEventListener("click", exportEstudioActual);
document.getElementById("btnExportTodo")?.addEventListener("click", exportTodosLosEstudios);
document.getElementById("fileImportEstudio")?.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  importEstudiosFromFile(f).catch(err => alert("Error al importar: " + (err?.message || err)));
  e.target.value = ""; // reset input
});



// Select categoría => refresca datalist (“clave — subcategoría”)
const categoriaSelect = document.getElementById("categoriaSelect");
const claveInput = document.getElementById("claveInput");
categoriaSelect.onchange = () => {
  mostrarOpcionesPorClaveYCategoria();
  document.getElementById("claveInput").value = "";
  const categoria = categoriaSelect.value;
  if (categoria) cargarDatalistPorCategoria(categoria);
};
claveInput.addEventListener("input", mostrarOpcionesPorClaveYCategoria);
const operadorEl = document.getElementById("operador");
if (operadorEl) operadorEl.onchange = () =>
  document.getElementById("valor2").classList.toggle("oculto", operadorEl.value !== "entre");

// ====== SUGERENCIAS RICAS (B) ======
(function ensureSuggestPanel(){
  const inp = document.getElementById("claveInput");
  if (!inp) return;
  let panel = document.getElementById("suggestPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "suggestPanel";
    panel.style.cssText = "border:1px solid #e5e7eb;border-radius:8px;margin-top:6px;padding:8px;max-height:220px;overflow:auto;background:#fff";
    inp.insertAdjacentElement("afterend", panel);
  }
})();

function renderSuggestPanel(){
  const panel = document.getElementById("suggestPanel");
  const cat = document.getElementById("categoriaSelect")?.value || "";
  const q = (document.getElementById("claveInput")?.value || "").trim().toLowerCase();
  if (!panel || !cat) return;
  panel.innerHTML = "";
  const catObj = window.idx.byCat.get(cat);
  if (!catObj) return;
  const items = [];
  Array.from(catObj.subcats || []).forEach(sub => {
    const canSet = window.idx.subcatToCanon.get(cat)?.get(norm(sub)) || new Set();
    const sub2Prev = new Set();
    canSet.forEach(canon=>{
      const row = (baseAutocompletado||[]).find(x=>x.categoria===cat && sinAcentos(x.clave)===sinAcentos(canon));
      if (row?.sub2) sub2Prev.add(row.sub2);
    });
    items.push({ tipo:"subcat", label:sub, previewSub2:Array.from(sub2Prev).sort() });
  });
  Array.from(catObj.sub2s || []).forEach(s2 => items.push({ tipo:"sub2", label:s2 }));
  Array.from(catObj.baseClaves || []).forEach(c => items.push({ tipo:"clave", label:c }));
  const filtered = items.filter(it => it.label.toLowerCase().includes(q));
  filtered.forEach(it=>{
    const div = document.createElement("div");
    div.className = "suggest-item";
    div.style.cssText = "padding:6px 8px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:4px";
    div.addEventListener("mouseenter", ()=> div.style.background="#f3f4f6");
    div.addEventListener("mouseleave", ()=> div.style.background="transparent");
    const icon = it.tipo==="subcat" ? "📚" : it.tipo==="sub2" ? "🧪" : "🧩";
    const title = document.createElement("div");
    title.style.cssText = "display:flex;gap:8px;align-items:center;font-weight:600";
    title.innerHTML = `<span>${icon}</span><span>${it.label}</span>`;
    div.appendChild(title);
    if (it.tipo==="subcat" && it.previewSub2?.length){
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
      it.previewSub2.slice(0,8).forEach(s2=>{
        const b = document.createElement("span");
        b.style.cssText = "border:1px solid #c7d2fe;border-radius:9999px;padding:2px 8px;font-size:12px;background:#eef2ff";
        b.textContent = s2;
        row.appendChild(b);
      });
      if (it.previewSub2.length>8){
        const more = document.createElement("span");
        more.style.cssText = "border:1px solid #d1d5db;border-radius:9999px;padding:2px 8px;font-size:12px";
        more.textContent = `+${it.previewSub2.length-8} más`;
        row.appendChild(more);
      }
      div.appendChild(row);
    }
    div.addEventListener("click", ()=>{
      const inp = document.getElementById("claveInput");
      if (!inp) return;
      inp.value = it.label;
      inp.dataset.modo = it.tipo;
      panel.innerHTML = "";
      if (typeof mostrarOpcionesPorClaveYCategoria === "function") mostrarOpcionesPorClaveYCategoria();
    });
    panel.appendChild(div);
  });
}
document.getElementById("categoriaSelect")?.addEventListener("change", ()=>{
  const inp = document.getElementById("claveInput"); if (inp){ inp.value=""; inp.dataset.modo=""; }
  renderSuggestPanel();
});
document.getElementById("claveInput")?.addEventListener("focus", renderSuggestPanel);
document.getElementById("claveInput")?.addEventListener("input", renderSuggestPanel);


// === Bloc simple para completar una frase y anexarla al prompt ===
// === Bloc simple para completar una frase y anexarla al prompt ===
function ensurePromptPadDOM(){
  if (document.getElementById('prompt-pad')) return;
  const wrap = document.createElement('div');
  wrap.id = 'prompt-pad';
  wrap.style.display = 'none';
  wrap.innerHTML = `
    <div class="pp-backdrop"></div>
    <div class="pp-card">
      <div class="pp-title" id="pp-title">Agregar detalle</div>
      <textarea id="pp-input" rows="2" placeholder="Complementa para que…"></textarea>
      <div class="pp-actions">
          <button id="pp-ok" class="btn">Continuar</button>
        <button id="pp-cancel" class="btn muted">Cancelar</button>
    
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

(function ensurePromptPadStyles(){
  if (document.getElementById('pp-style')) return;
  const st = document.createElement('style');
  st.id = 'pp-style';
  st.textContent = `
    #prompt-pad{position:fixed;inset:0;z-index:9999}
    #prompt-pad .pp-backdrop{position:absolute;inset:0;background:rgba(54, 67, 179, 0.59)}
    #prompt-pad .pp-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      width:min(520px,92vw);background:#fff;border-radius:10px;padding:10px;box-shadow:0 12px 28px rgba(0,0,0,.2);display:flex;flex-direction:column;gap:8px}
    #prompt-pad .pp-title{font-weight:600}
    #prompt-pad textarea{border:1px solid #1a375cff;border-radius:8px;padding:8px;font-size:14px;resize:none;min-height:54px;max-height:140px}
    #prompt-pad .pp-actions{display:flex;gap:8px;justify-content:flex-end}
  `;
  document.head.appendChild(st);
})();



// Abre bloc, pide una sola frase y la anexa al prompt base
function openPromptPadAndSend({ basePrompt, title = 'Agregar detalle', joiner = '\n\nContexto adicional: ' }){
  ensurePromptPadDOM();
  const root = document.getElementById('prompt-pad');
  const titleEl = document.getElementById('pp-title');
  const input = document.getElementById('pp-input');
  const ok = document.getElementById('pp-ok');
  const cancel = document.getElementById('pp-cancel');

  function close(){ root.style.display='none'; ok.onclick=null; cancel.onclick=null; root.querySelector('.pp-backdrop').onclick=null; }
  function autoGrow(){ input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,140)+'px'; }

  titleEl.textContent = title;
  input.value = '';
  root.style.display = 'block';
  input.focus();
  input.oninput = autoGrow; autoGrow();

 ok.onclick = ()=>{
  const extra = (input.value || '').trim();
  const final = extra ? (basePrompt + joiner + extra) : basePrompt;
  close();

  // usar la función global expuesta por el chat
  const sender = window.medregSendMsg || window.sendMsg;
  if (typeof sender === 'function') {
    sender(final, false);  // SIN burbuja del usuario
  } else {
    console.warn('[MedReg] sendMsg no disponible');
    alert('No pude enviar el prompt. Recargá el sidebar e intentá de nuevo.');
  }
};

  cancel.onclick = ()=> close();
  root.querySelector('.pp-backdrop').onclick = ()=> close();
}



function renderSuggestPanel(){
  const panel = document.getElementById("suggestPanel");
  const cat = document.getElementById("categoriaSelect")?.value || "";
  const q = (document.getElementById("claveInput")?.value || "").trim().toLowerCase();
  if (!panel || !cat) return;
  panel.innerHTML = "";
  const catObj = window.idx.byCat.get(cat);
  if (!catObj) return;
  const items = [];
  Array.from(catObj.subcats || []).forEach(sub => {
    const canSet = window.idx.subcatToCanon.get(cat)?.get(norm(sub)) || new Set();
    const sub2Prev = new Set();
    canSet.forEach(canon=>{
      const row = (baseAutocompletado||[]).find(x=>x.categoria===cat && sinAcentos(x.clave)===sinAcentos(canon));
      if (row?.sub2) sub2Prev.add(row.sub2);
    });
    items.push({ tipo:"subcat", label:sub, previewSub2:Array.from(sub2Prev).sort() });
  });
  Array.from(catObj.sub2s || []).forEach(s2 => items.push({ tipo:"sub2", label:s2 }));
  Array.from(catObj.baseClaves || []).forEach(c => items.push({ tipo:"clave", label:c }));
  const filtered = items.filter(it => it.label.toLowerCase().includes(q));
  filtered.forEach(it=>{
    const div = document.createElement("div");
    div.className = "suggest-item";
    div.style.cssText = "padding:6px 8px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:4px";
    div.addEventListener("mouseenter", ()=> div.style.background="#f3f4f6");
    div.addEventListener("mouseleave", ()=> div.style.background="transparent");
    const icon = it.tipo==="subcat" ? "ðŸ“š" : it.tipo==="sub2" ? "ðŸ§ª" : "ðŸ§©";
    const title = document.createElement("div");
    title.style.cssText = "display:flex;gap:8px;align-items:center;font-weight:600";
    title.innerHTML = `<span>${icon}</span><span>${it.label}</span>`;
    div.appendChild(title);
    if (it.tipo==="subcat" && it.previewSub2?.length){
      const row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
      it.previewSub2.slice(0,8).forEach(s2=>{
        const b = document.createElement("span");
        b.style.cssText = "border:1px solid #c7d2fe;border-radius:9999px;padding:2px 8px;font-size:12px;background:#eef2ff";
        b.textContent = s2;
        row.appendChild(b);
      });
      if (it.previewSub2.length>8){
        const more = document.createElement("span");
        more.style.cssText = "border:1px solid #d1d5db;border-radius:9999px;padding:2px 8px;font-size:12px";
        more.textContent = `+${it.previewSub2.length-8} mÃ¡s`;
        row.appendChild(more);
      }
      div.appendChild(row);
    }
    div.addEventListener("click", ()=>{
      const inp = document.getElementById("claveInput");
      if (!inp) return;
      inp.value = it.label;
      inp.dataset.modo = it.tipo;
      panel.innerHTML = "";
      if (typeof mostrarOpcionesPorClaveYCategoria === "function") mostrarOpcionesPorClaveYCategoria();
    });
    panel.appendChild(div);
  });
}
document.getElementById("categoriaSelect")?.addEventListener("change", ()=>{
  const inp = document.getElementById("claveInput"); if (inp){ inp.value=""; inp.dataset.modo=""; }
  renderSuggestPanel();
});
document.getElementById("claveInput")?.addEventListener("focus", renderSuggestPanel);
document.getElementById("claveInput")?.addEventListener("input", renderSuggestPanel);



