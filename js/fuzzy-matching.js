// fuzzy-matching.js
// 🔍 Módulo para detección clínica flexible usando Fuse.js

import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.esm.js';

// ✅ Normaliza texto para comparar sin acentos, espacios o mayúsculas
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\s_\-.]+/g, '');
}

// 🔎 Evalúa si hay negación antes del término en una oración
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

// 📊 Función principal exportable
export function buscarTerminosFuzzy(texto, categoria, terminologiaCategoria) {
  const encontrados = new Set();
  if (!texto || !terminologiaCategoria) return [];

  const oraciones = texto.split(/(?<=[.!?\n\r])|(?=\s*-\s*)|[,;]/);
  const fuse = new Fuse(
    Object.entries(terminologiaCategoria).flatMap(([base, sinonimos]) =>
      [base, ...sinonimos].map(s => ({ termino: s, base }))
    ),
    {
      keys: ['termino'],
      includeScore: true,
      threshold: 0.3 // más estricto
    }
  );

  for (const oracion of oraciones) {
    const tokens = oracion.split(/[\s,;.]+/);
    for (const token of tokens) {
      const resultado = fuse.search(token);
      if (resultado.length > 0 && resultado[0].score < 0.3) {
        const match = resultado[0].item;
        if (!contieneNegacion(oracion, match.termino) && !encontrados.has(match.base)) {
          encontrados.add(match.base);
        }
      }
    }
  }

  return Array.from(encontrados);
}
