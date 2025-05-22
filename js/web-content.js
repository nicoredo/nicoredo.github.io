import { terminologiaMedica, cargarDatosIniciales } from './data-loader.js';


const encabezados = {
    antecedentes: /\b(AP:|Antec(?:edentes)?(?: de)?:)/i,
    riesgo: /\b(FR:|Factores de riesgo:)/i,
    medicacion: /\b(MH:|Med(?:icación)?(?: habitual)?:)/i,
    laboratorio: /\b(Lab:|Labo:)/i
};

function contieneNegacion(oracion, termino) {
    const negaciones = ["no", "niega", "sin", "ausencia de", "desconoce", "sin evidencia de", "negativo para"];
    const afirmaciones = ["sí", "si", "presenta", "refiere", "con", "dx de", "dx", "diagnosticado de"];
    const reversores = ["pero", "aunque", "sin embargo", "no obstante"];

    const separadores = /[,;]|(?:\bpero\b|\baunque\b|\bsin embargo\b|\bno obstante\b)/i;
    const partes = oracion.toLowerCase().split(separadores);
    const terminoLower = termino.toLowerCase();

    let negado = false;
    for (const parte of partes) {
        const palabras = parte.trim().split(/\s+/);
        for (let i = 0; i < palabras.length; i++) {
            const palabra = palabras[i];
            if (negaciones.includes(palabra)) {
                negado = true;
            } else if (afirmaciones.includes(palabra)) {
                negado = false;
            } else if (reversores.includes(palabra)) {
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
    const regexEdad = /\b(?:edad|paciente|de)\s*[:=]?\s*(\d{1,3})\s*(?:años|a)?\b|\b(\d{1,3})\s*a(?:ños)?\b/i;
    const match = texto.match(regexEdad);
    return match ? parseInt(match[1] || match[2]) : null;
}

function extraerBloquesPorEncabezado(texto) {
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
        
        if (actual && linea) {
            bloques[actual].push(linea);
        }
    });
    
    return bloques;
}

function buscarTerminos(texto, categoria) {
    const encontrados = new Set();
    if (!texto || !terminologiaMedica[categoria]) return [];

   texto.split(/(?<=[.!?\n\r\-])|(?=\b[A-Z]{2,}\b)/).forEach(oracion => {
        for (const [base, sinonimos] of Object.entries(terminologiaMedica[categoria])) {
            const patrones = [base, ...sinonimos];
            patrones.forEach(termino => {
                const regex = new RegExp(`\\b${termino.replace(/ /g, "\\s+")}\\b`, "i");
                if (regex.test(oracion) && !contieneNegacion(oracion, termino)) {
                    encontrados.add(base);
                }
            });
        }
    });
    return Array.from(encontrados);
}

function buscarMedicacionConDosis(texto) {
    const resultados = [];
    if (!texto) return [];
    
    for (const [base, sinonimos] of Object.entries(terminologiaMedica.medicacion)) {
        const patrones = [base, ...sinonimos];
        for (const termino of patrones) {
            const terminoEscapado = termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = `\\b${terminoEscapado}\\b(?:[^\\d\\n\\r]{0,10})?(\\d+(?:[.,]\\d+)?\\s*(?:mg|mcg|g|ml|ug))?`;
            const expresion = new RegExp(pattern, "gi");
            let match;
            while ((match = expresion.exec(texto))) {
                if (!contieneNegacion(match[0], termino)) {
                    const dosis = match[1] ? ` ${match[1].trim()}` : "";
                    resultados.push(`${base}${dosis}`);
                }
            }
        }
    }
    return resultados;
}


function buscarLaboratorio(texto) {
    const resultados = [];
    if (!texto) return [];

    for (const [base, sinonimos] of Object.entries(terminologiaMedica.laboratorio)) {
        const patrones = [base, ...sinonimos].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));  // escapar regex
        const regex = new RegExp(
            `\\b(${patrones.join("|")})\\b(?:\\s*(?:[:=]|es|es de|de)?\\s*)(\\d+(?:[.,]\\d+)?)(?:\\s*(mg/dL|%|mmol/L|g/dL|mEq/L|U/L|ng/mL|μg/mL|ng/dL|ml/min|mL\\/min|))?`,
            "gi"
        );

        let match;
        while ((match = regex.exec(texto))) {
            const matchTerm = match[1].toLowerCase();
            const nombre = patrones.find(p => p.toLowerCase() === matchTerm) ? base : matchTerm;
            const valor = match[2].replace(',', '.'); // convertir a punto decimal
            const unidad = match[3] || ''; // puede estar vacía
            const estadoTexto = '';
            resultados.push(`${nombre}: ${valor}${unidad ? ' ' + unidad : ''}${estadoTexto}`);
        }
    }

    return resultados;
}


export function extraerDatosHC(textoHC) {
    const bloques = extraerBloquesPorEncabezado(textoHC);
    return {
        edad: extraerEdad(textoHC),
        antecedentes: buscarTerminos(bloques.antecedentes?.join(" ") || textoHC, "antecedentes"),
        factoresRiesgo: buscarTerminos(bloques.riesgo?.join(" ") || textoHC, "riesgo"),
        medicacion: buscarMedicacionConDosis(bloques.medicacion?.join(" ") || textoHC),
        laboratorio: buscarLaboratorio(bloques.laboratorio?.join(" ") || textoHC)
    };
}
