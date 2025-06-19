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

 let negado = false;
for (const palabra of tokens) {
    if (reversores.includes(palabra) || afirmaciones.includes(palabra)) break;
    if (negaciones.includes(palabra)) {
        negado = true;
        break;
    }
}
return negado;


function distanciaLevenshtein(a, b) {
    const matrix = [];
    const alen = a.length;
    const blen = b.length;

    if (alen === 0) return blen;
    if (blen === 0) return alen;

    for (let i = 0; i <= blen; i++) matrix[i] = [i];
    for (let j = 0; j <= alen; j++) matrix[0][j] = j;

    for (let i = 1; i <= blen; i++) {
        for (let j = 1; j <= alen; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
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

    return matrix[blen][alen];
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
    const exactos = new Set();
    const respaldo = new Set();
    if (!texto || !terminologiaMedica[categoria]) return [];

    const oraciones = texto.split(/(?<=[.!?\n\r])|(?=\s*-\s*)|[,;]/);

    for (const oracion of oraciones) {
        for (const [base, sinonimos] of Object.entries(terminologiaMedica[categoria])) {
            const patrones = [base, ...sinonimos];
            for (const termino of patrones) {
                const terminoFlexible = termino.replace(/ /g, "[\\s\\-]*");
                const regex = new RegExp(`\\b${terminoFlexible}\\b`, "i");
                const match = regex.exec(oracion);
                if (match && !contieneNegacion(oracion, match[0])) {
                    exactos.add(base);
                }
            }
        }
    }

    if (exactos.size === 0) {
        for (const oracion of oraciones) {
            const palabras = oracion.split(/\s+/);
            for (const [base, sinonimos] of Object.entries(terminologiaMedica[categoria])) {
                const patrones = [base, ...sinonimos];
                for (const palabra of palabras) {
                    if (palabra.length < 4) continue;
                    for (const termino of patrones) {
                        const distancia = distanciaLevenshtein(palabra.toLowerCase(), termino.toLowerCase());
                        if (distancia <= 2 && !contieneNegacion(oracion, palabra)) {
                            respaldo.add(base);
                        }
                    }
                }
            }
        }
    }

    return Array.from(new Set([...exactos, ...respaldo]));
}

function buscarMedicacionConDosis(texto) {
    const resultados = new Map();
    if (!texto) return [];

    const oraciones = texto.split(/(?<=[.!?\n\r])|(?=\s*-\s*)|[,;]/);

    for (const oracion of oraciones) {
        for (const [base, sinonimos] of Object.entries(terminologiaMedica.medicacion)) {
            const patrones = [base, ...sinonimos];
            for (const termino of patrones) {
                const terminoEscapado = termino.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
                const pattern = `\\b${terminoEscapado}\\b(?:[^\\d\\n\\r]{0,10})?(\\d+(?:[.,]\\d+)?\\s*(?:mg|mcg|g|ml|ug))?`;
                const expresion = new RegExp(pattern, "gi");
                let match;
                while ((match = expresion.exec(oracion))) {
                    if (!contieneNegacion(oracion, match[0]) && !resultados.has(base)) {
                        const dosis = match[1] ? ` ${match[1].trim()}` : "";
                        resultados.set(base, `${base}${dosis}`);
                        break;
                    }
                }

                if (!resultados.has(base)) {
                    for (const palabra of oracion.split(/\s+/)) {
                        const distancia = distanciaLevenshtein(palabra.toLowerCase(), termino.toLowerCase());
                        if (distancia <= 2 && palabra.length > 5 && !contieneNegacion(oracion, palabra)) {
                            resultados.set(base, base);
                            break;
                        }
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
        const patrones = [base, ...sinonimos].map(t => t.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'));
        const regex = new RegExp(
            `\\b(${patrones.join("|")})\\b(?:\\s*(?::=|es|es de|de)?\\s*)(\\d+(?:[.,]\\d+)?)(?:\\s*(mg/dL|%|mmol/L|g/dL|mEq/L|U/L|ng/mL|μg/mL|ng/dL|ml/min|mL\\/min|))?`,
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

