let terminologia = null;

// Cargar terminología médica de forma asíncrona
async function cargarTerminologia() {
  try {
    const response = await fetch('https://cdn.jsdelivr.net/gh/nicoredo/medex@main/terminologia_medica.json');  // Ruta del archivo JSON
    if (!response.ok) throw new Error('Error al cargar terminología médica');
    terminologia = await response.json();  // Guardar los datos cargados
  } catch (error) {
    console.error("Error al cargar terminología médica:", error);
    alert("Terminología médica aún no cargada. Espera unos segundos y vuelve a intentar.");
  }
}

// Llamar a la función para cargar terminología al cargar la página
document.addEventListener('DOMContentLoaded', cargarTerminologia);

let criterios = null;  // Nueva variable

async function cargarCriterios() {
  try {
    const response = await fetch('https://cdn.jsdelivr.net/gh/nicoredo/medex@main/criterios_estudios.json');
    if (!response.ok) throw new Error('Error al cargar criterios de estudios');
    criterios = await response.json();
  } catch (error) {
    console.error("Error al cargar criterios de estudios:", error);
  }
}

// Cargar ambos al iniciar
document.addEventListener('DOMContentLoaded', () => {
  cargarTerminologia();
  cargarCriterios();
});


// Funciones auxiliares
function contieneNegacion(oracion, termino) {
  const negaciones = ["no", "niega", "sin", "ausencia de", "negativo para"];
  const afirmaciones = ["sí", "si", "presenta", "refiere", "con", "diagnosticado de"];
  const reversores = ["pero", "aunque", "sin embargo", "no obstante"];
  
  const separadores = /[,;]|(?:\bpero\b|\baunque\b|\bsin embargo\b|\bno obstante\b)/i;
  const partes = oracion.toLowerCase().split(separadores);
  const terminoLower = termino.toLowerCase();
  
  let negado = false;
  for (const parte of partes) {
    const palabras = parte.trim().split(/\s+/);
    for (let palabra of palabras) {
      if (negaciones.includes(palabra)) {
        negado = true;
      } else if (afirmaciones.includes(palabra) || reversores.includes(palabra)) {
        negado = false;
      }
      if (palabra === terminoLower) {
        return negado;
      }
    }
  }
  return false;
}

function extraerEdad(texto) {
  const regexEdad = /(?:Edad|Años|Paciente)\s*[:=]?\s*(\d+)|(\d+)\s*(?:años|y)/i;
  const match = texto.match(regexEdad);
  return match ? (match[1] || match[2]) : "No detectada";
}

function extraerBloquesPorEncabezado(texto) {
  const encabezados = {
    antecedentes: /\b(AP:|Antec(?:edentes)?(?: de)?:)/i,
    riesgo: /\b(FR:|Factores de riesgo:)/i,
    medicacion: /\b(MH:|Med(?:icación)?(?: habitual)?:)/i,
    laboratorio: /\b(Lab:|Labo:)/i
  };
  const bloques = {};
  let actual = null;
  texto.split(/\n|\r/).forEach(linea => {
    linea = linea.trim();
    if (!linea) return;
    for (const [cat, regex] of Object.entries(encabezados)) {
      if (regex.test(linea)) {
        actual = cat;
        bloques[cat] = [];
        linea = linea.replace(regex, "").trim();
        break;
      }
    }
    if (actual && linea) bloques[actual].push(linea);
  });
  return bloques;
}

function buscarTerminos(texto, categoria) {
  const encontrados = new Set();
  if (!texto) return [];
  texto.split(/(?<=[.!?])/).forEach(oracion => {
    for (const [base, sinonimos] of Object.entries(terminologia[categoria])) {
      const patrones = [base, ...sinonimos];
      patrones.forEach(termino => {
        const regex = new RegExp(`\\b${termino}\\b`, "i");
        if (regex.test(oracion) && !contieneNegacion(oracion, termino)) {
          encontrados.add(base);
        }
      });
    }
  });
  return Array.from(encontrados);
}

function buscarLaboratorio(texto) {
  const resultados = [];
  if (!texto) return [];
  for (const [base, sinonimos] of Object.entries(terminologia.laboratorio)) {
    const patrones = [base, ...sinonimos];
    patrones.forEach(sin => {
      const regex = new RegExp(`\\b${sin}\\b[\\s:]*([\\d.,]+\\s*(?:mg/dL|mmol/L)?)`, "gi");
      let match;
      while ((match = regex.exec(texto))) {
        resultados.push(`${base}: ${match[1] || '--'}`);
      }
    });
  }
  return resultados;
}

function extraerDatos(texto) {
  const bloques = extraerBloquesPorEncabezado(texto);
  return {
    edad: extraerEdad(texto),
    antecedentes: buscarTerminos(bloques.antecedentes?.join(" ") || texto, "antecedentes"),
    riesgo: buscarTerminos(bloques.riesgo?.join(" ") || texto, "riesgo"),
    medicacion: buscarTerminos(bloques.medicacion?.join(" ") || texto, "medicacion"),
    laboratorio: buscarLaboratorio(bloques.laboratorio?.join(" ") || texto)
  };
}

// Mostrar resultados
function mostrarResultados(datos) {
  const contenedor = document.getElementById('resultadoDatos');
  contenedor.innerHTML = `
    <div class="campo">
      <label>Edad:</label>
      <input type="text" id="campoEdad" value="${datos.edad || ''}">
    </div>
    <div class="campo">
      <label>Antecedentes:</label>
      <textarea id="campoAntecedentes">${datos.antecedentes.join(", ")}</textarea>
    </div>
    <div class="campo">
      <label>Factores de riesgo:</label>
      <textarea id="campoRiesgo">${datos.riesgo.join(", ")}</textarea>
    </div>
    <div class="campo">
      <label>Medicación:</label>
      <textarea id="campoMedicacion">${datos.medicacion.join(", ")}</textarea>
    </div>
    <div class="campo">
      <label>Laboratorio:</label>
      <textarea id="campoLaboratorio">${datos.laboratorio.join("\\n")}</textarea>
    </div>
  `;
}

// Conectar botón
document.getElementById('btnAnalizar').addEventListener('click', () => {
  const texto = document.getElementById('inputTexto').value;
  if (!terminologia) {
    alert("Terminología médica aún no cargada. Espera unos segundos y vuelve a intentar.");
    return;
  }
  const datos = extraerDatos(texto);
  mostrarResultados(datos);
  document.getElementById('btnEvaluar').disabled = false;
});
