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
    const reversores = ["pero", "aunque", "sin embargo", "no obstante", "excepto", "salvo", "aunque luego"];

    const oracionLower = oracion.toLowerCase();
    const terminoLower = termino.toLowerCase();

    const indexTermino = oracionLower.indexOf(terminoLower);
    if (indexTermino === -1) return false;

    const antesDelTermino = oracionLower.slice(0, indexTermino);
    const tokens = antesDelTermino.split(/\s|,|;/).filter(Boolean).reverse();

    for (const palabra of tokens) {
        if (reversores.includes(palabra) || afirmaciones.includes(palabra)) break;
        if (negaciones.includes(palabra)) return true;
    }

    return false;
}

function distanciaLevenshtein(a, b) {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

function normalizarTexto(texto) {
    return texto.toLowerCase().replace(/[\s\-_.]+/g, '');
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

    const oraciones = texto.split(/(?<=[.!?\n\r])|(?=\s*-\s*)|[,;]/);

    for (const oracion of oraciones) {
        for (const [base, sinonimos] of Object.entries(terminologiaMedica[categoria])) {
            const patrones = [base, ...sinonimos];
            for (const termino of patrones) {
                const terminoFlexible = termino.replace(/ /g, "[\\s\\-]*");
                const regex = new RegExp(`\\b${terminoFlexible}\\b`, "i");

                if (regex.test(oracion)) {
                    const match = regex.exec(oracion);
                    const encontrado = match ? match[0].toLowerCase() : termino.toLowerCase();
                    if (!contieneNegacion(oracion, encontrado)) {
                        encontrados.add(base);
                    }
                }
            }
        }
    }

    // Fallback leve por Levenshtein solo si no encontró nada exacto
    if (encontrados.size === 0) {
        for (const oracion of oraciones) {
            const palabras = oracion.split(/\s+/).filter(p => p.length > 5);
            for (const palabra of palabras) {
                for (const [base, sinonimos] of Object.entries(terminologiaMedica[categoria])) {
                    const todos = [base, ...sinonimos];
                    for (const termino of todos) {
                        const distancia = distanciaLevenshtein(palabra.toLowerCase(), termino.toLowerCase());
                        if (distancia === 1 && !contieneNegacion(oracion, palabra)) {
                            encontrados.add(base);
                        }
                    }
                }
            }
        }
    }

    return Array.from(encontrados);
}

function buscarMedicacionConDosis(texto) {
    const resultados = new Map();
    if (!texto) return [];

    for (const [base, sinonimos] of Object.entries(terminologiaMedica.medicacion)) {
        const patrones = [base, ...sinonimos];
        for (const termino of patrones) {
            const terminoEscapado = termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = `\\b${terminoEscapado}\\b(?:[^\\d\\n\\r]{0,10})?(\\d+(?:[.,]\\d+)?\\s*(?:mg|mcg|g|ml|ug))?`;
            const expresion = new RegExp(pattern, "gi");
            let match;
            while ((match = expresion.exec(texto))) {
                if (!contieneNegacion(match[0], termino) && !resultados.has(base)) {
                    const dosis = match[1] ? ` ${match[1].trim()}` : "";
                    resultados.set(base, `${base}${dosis}`);
                    break;
                }
            }
        }
    }

    // Agregamos leve tolerancia a errores por Levenshtein
    if (resultados.size === 0) {
        const palabras = texto.split(/\s+/).filter(p => p.length > 5);
        for (const palabra of palabras) {
            for (const [base, sinonimos] of Object.entries(terminologiaMedica.medicacion)) {
                const todos = [base, ...sinonimos];
                for (const termino of todos) {
                    const distancia = distanciaLevenshtein(palabra.toLowerCase(), termino.toLowerCase());
                    if (distancia === 1 && !contieneNegacion(texto, palabra)) {
                        resultados.set(base, base);
                    }
                }
            }
        }
    }

    return Array.from(resultados.values());
}

function buscarLaboratorio(texto) {
    const resultados = [];
    if (!texto) return [];

    for (const [base, sinonimos] of Object.entries(terminologiaMedica.laboratorio)) {
        const patrones = [base, ...sinonimos].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(
            `\\b(${patrones.join("|")})\\b(?:\\s*(?:[:=]|es|es de|de)?\\s*)(\\d+(?:[.,]\\d+)?)(?:\\s*(mg/dL|%|mmol/L|g/dL|mEq/L|U/L|ng/mL|μg/mL|ng/dL|ml/min|mL\\/min|))?`,
            "gi"
        );

        let match;
        while ((match = regex.exec(texto))) {
            const matchTerm = match[1].toLowerCase();
            const nombre = patrones.find(p => p.toLowerCase() === matchTerm) ? base : matchTerm;
            const valor = match[2].replace(',', '.');
            const unidad = match[3] || '';
            resultados.push(`${nombre}: ${valor}${unidad ? ' ' + unidad : ''}`);
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


