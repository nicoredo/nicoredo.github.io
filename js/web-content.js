// Nuevas funciones de extracción adaptadas a terminologia_medica estructurada

import { terminologiaMedica } from './data-loader.js';

// Utilidades
function normalizarTexto(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function contieneNegacion(texto, indice) {
  const ventana = 10;
  const tokens = texto.slice(Math.max(0, indice - ventana), indice).split(/\s+/);
  return tokens.some(t => ["no", "niega", "sin"].includes(t));
}

// Detección base de términos por sinónimos
function detectarTerminosTexto(texto) {
  const resultado = [];
  const textoPlano = normalizarTexto(texto);

  for (const [nombre, data] of Object.entries(terminologiaMedica.terminos)) {
    for (const sinonimo of data.sinonimos) {
      const sinNormal = normalizarTexto(sinonimo);
      const index = textoPlano.indexOf(sinNormal);
      if (index !== -1 && !contieneNegacion(textoPlano, index)) {
        resultado.push({
          nombre,
          tipo: data.tipo,
          fuente: "texto"
        });

        // Inferencias directas
        if (data.implica) {
          for (const implicado of data.implica) {
            resultado.push({
              nombre: implicado,
              tipo: "antecedente",
              fuente: "inferencia"
            });
          }
        }

        // Equivalencias
        if (data.equivalente_a) {
          for (const eq of data.equivalente_a) {
            resultado.push({
              nombre: eq,
              tipo: data.tipo,
              fuente: "equivalente"
            });
          }
        }

        // Subtipos
        if (data.forma_parte_de) {
          for (const cat of data.forma_parte_de) {
            resultado.push({
              nombre: cat,
              tipo: "antecedente",
              fuente: "categoria"
            });
          }
        }
        break; // evitar duplicados por sinónimos
      }
    }
  }

  return resultado;
}

// Evaluar categorías compuestas
function evaluarCategorias(terminosDetectados) {
  const presentes = new Set(terminosDetectados.map(t => t.nombre));
  const categorias = [];

  for (const [cat, data] of Object.entries(terminologiaMedica.categorias)) {
    const contiene = data.incluye.every(t => presentes.has(t));
    if (contiene) {
      categorias.push({
        nombre: cat,
        tipo: data.tipo,
        fuente: "categoria"
      });
    }
  }

  return categorias;
}

// Evaluar laboratorio con criterio_valor
function evaluarLaboratorioConCategorias(valores) {
  const inferidos = [];

  for (const [cat, data] of Object.entries(terminologiaMedica.categorias)) {
    if (data.criterio_valor && data.incluye) {
      for (const relacionado of data.incluye) {
        const valorDetectado = valores[relacionado];
        if (valorDetectado !== undefined) {
          const umbral = data.criterio_valor.umbral;
          const comparador = data.criterio_valor.comparador;
          if (
            (comparador === "<=" && valorDetectado <= umbral) ||
            (comparador === "<" && valorDetectado < umbral) ||
            (comparador === ">=" && valorDetectado >= umbral) ||
            (comparador === ">" && valorDetectado > umbral)
          ) {
            inferidos.push({
              nombre: cat,
              tipo: data.tipo,
              fuente: "valor_laboratorio"
            });
          }
        }
      }
    }
  }

  return inferidos;
}


function buscarLaboratorio(texto) {
  const resultados = {};
  const textoPlano = normalizarTexto(texto);

  for (const [nombre, data] of Object.entries(terminologiaMedica.terminos)) {
    if (data.tipo === "laboratorio") {
      for (const sinonimo of data.sinonimos) {
        const sinNormal = normalizarTexto(sinonimo);
        const regex = new RegExp(`${sinNormal}[\s:]*([\d.,]+)`, "i");
        const match = textoPlano.match(regex);
        if (match && match[1]) {
          let valor = parseFloat(match[1].replace(",", "."));
          if (!isNaN(valor)) {
            resultados[nombre] = valor;
          }
          break;
        }
      }
    }
  }

  return resultados;
}



function extraerEdad(texto) {
  const textoPlano = texto.toLowerCase();
  const regex = /(?:paciente|pac|edad)[^\d]{0,10}(\d{1,3})\s?(años|a)?/i;
  const match = textoPlano.match(regex);
  if (match && match[1]) {
    const edad = parseInt(match[1]);
    if (edad > 0 && edad < 120) {
      return edad;
    }
  }
  return null;
}


// FUNCION PRINCIPAL
export function extraerDatosHC(texto) {
  const hallazgos = detectarTerminosTexto(texto);
  const categorias = evaluarCategorias(hallazgos);

  // Agrupar por tipo
  const agrupados = {
    antecedentes: [],
    riesgo: [],
    medicacion: [],
    laboratorio: {}
  };

  for (const item of [...hallazgos, ...categorias]) {
    if (item.tipo === "laboratorio") continue;
    if (!agrupados[item.tipo].includes(item.nombre)) {
      agrupados[item.tipo].push(item.nombre);
    }
  }

  // Procesar laboratorio
  agrupados.laboratorio = buscarLaboratorio(texto); // usa función existente

  // Evaluar inferencias por valor
  const categoriasDesdeValores = evaluarLaboratorioConCategorias(agrupados.laboratorio);
  for (const c of categoriasDesdeValores) {
    if (!agrupados[c.tipo].includes(c.nombre)) {
      agrupados[c.tipo].push(c.nombre);
    }
  }

  // Edad
  agrupados.edad = extraerEdad(texto); // usa función existente

  return agrupados;
}

  // Edad
  agrupados.edad = extraerEdad(texto); // usa función existente

  return agrupados;
}
