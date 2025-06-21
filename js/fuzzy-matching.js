// fuzzy-matching.js
// 🔍 Módulo para detección clínica flexible usando Fuse.js (cargado globalmente con <script>)

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function contieneNegacion(oracion, termino) {
  const negaciones = ["no", "niega", "sin", "ausencia de", "desconoce", "sin evidencia de", "negativo para"];
  const afirmaciones = ["sí", "si", "presenta", "refiere", "con", "dx de", "dx", "diagnosticado de"];
  const reversores = ["pero", "aunque", "sin embargo", "no obstante", "excepto", "salvo", "aunque luego"];

  const oracionLower = oracion.toLowerCase();
  const terminoLower = termino.toLowerCase();
  const indexTermino = oracionLower.indexOf(terminoLower);
  if (indexTermino === -1) return false;

  const antesDelTermino = oracionLower.slice(0, indexTermino);
  const tokens = antesDelTermino.split(/[\s,;\.]+/).reverse();

  for (const palabra of tokens) {
    if (reversores.includes(palabra) || afirmaciones.includes(palabra)) break;
    if (negaciones.includes(palabra)) return true;
  }
  return false;
}

function buscarTerminosFuzzy(texto, categoria, terminologiaCategoria) {
  const encontrados = new Set();
  if (!texto || !terminologiaCategoria || !window.Fuse) return [];

  const oraciones = texto.split(/(?<=[.!?\n\r])|(?=\s*-\s*)|[,;]/);

  const listaTerminos = Object.entries(terminologiaCategoria).flatMap(([base, sinonimos]) =>
    [base, ...sinonimos].map(s => ({ termino: normalizar(s), base }))
  );

  const fuse = new window.Fuse(listaTerminos, {
    keys: ['termino'],
    includeScore: true,
    threshold: 0.1
  });

  for (const oracion of oraciones) {
    const oracionNorm = normalizar(oracion);
    const resultado = fuse.search(oracionNorm);
    for (const r of resultado) {
      const { termino, base } = r.item;
      if (r.score < 0.1 && !contieneNegacion(oracion, termino) && !encontrados.has(base)) {
        encontrados.add(base);
      }
    }
  }

  return Array.from(encontrados);
}

// ✅ Exponer al ámbito global
window.buscarTerminosFuzzy = buscarTerminosFuzzy;

