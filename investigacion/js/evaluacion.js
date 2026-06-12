// evaluacion.js con lógica de AND/OR y feedback de faltantes corregido
import { criteriosEstudios } from './data-loader.js';

function parseLaboratorio(textoLab) {
    const resultados = {};
    if (!textoLab || textoLab.trim() === '-' || textoLab.trim() === '') return resultados;
    const items = textoLab.split(/,\s*/).filter(item => item.includes(':'));
    items.forEach(item => {
        const [key, value] = item.split(':').map(part => part.trim());
        const numericValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(numericValue)) resultados[key.toLowerCase()] = numericValue;
    });
    return resultados;
}

function evaluarRango(edad, criterio) {
    if (criterio.includes('-')) {
        const [min, max] = criterio.split('-').map(Number);
        return edad >= min && edad <= max;
    }
    const match = criterio.match(/(>=|<=|>|<)\s*(\d+)/);
    if (match) {
        const [_, operador, valorStr] = match;
        const valor = Number(valorStr);
        switch (operador) {
            case '>': return edad > valor;
            case '>=': return edad >= valor;
            case '<': return edad < valor;
            case '<=': return edad <= valor;
        }
    }
    return edad === Number(criterio);
}

function evaluarLaboratorio(labData, criterio) {
    const match = criterio.match(/(.+?)\s*(>=|<=|>|<|=)\s*(\d+(?:[.,]\d+)?)/);
    if (!match) return false;
    const [_, parametroRaw, operador, valorStr] = match;
    const parametro = parametroRaw.trim().toLowerCase();
    const valorCriterio = parseFloat(valorStr.replace(',', '.'));
    const valorPaciente = labData[parametro];
    if (valorPaciente === undefined) return false;
    switch (operador) {
        case '>': return valorPaciente > valorCriterio;
        case '<': return valorPaciente < valorCriterio;
        case '>=': return valorPaciente >= valorCriterio;
        case '<=': return valorPaciente <= valorCriterio;
        case '=': return valorPaciente === valorCriterio;
    }
    return false;
}

function cumpleCriterio(datos, grupo, criterio) {
    const grupoMapeado = {
        'factores': 'riesgo',
        'factoresRiesgo': 'riesgo'
    }[grupo] || grupo;

    try {
        if (grupoMapeado === 'edad') {
            return evaluarRango(datos.edad, criterio);
        }
        if (grupoMapeado === 'laboratorio') {
            return evaluarLaboratorio(datos.laboratorio, criterio);
        }
        if (!Array.isArray(datos[grupoMapeado])) return false;
        const regex = new RegExp(criterio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return datos[grupoMapeado].some(item => regex.test(item));
    } catch (error) {
        console.error(`Error evaluando criterio: ${grupo}=${criterio}`, error);
        return false;
    }
}

function cumpleBloqueCriterios(datos, bloque, faltantes = []) {
    if (!bloque) return true;

    if (bloque.AND) {
        return bloque.AND.every(sub => cumpleBloqueCriterios(datos, sub, faltantes));
    }

    if (bloque.OR) {
        const algunaCumple = bloque.OR.some(sub => cumpleBloqueCriterios(datos, sub));
        if (!algunaCumple) faltantes.push("Ninguna opción de OR cumplida");
        return algunaCumple;
    }

    const grupo = Object.keys(bloque)[0];
    const valor = bloque[grupo];
    const cumple = cumpleCriterio(datos, grupo, valor);
    if (!cumple) faltantes.push(`${grupo}: ${valor}`);
    return cumple;
}

function evaluarEstudioPriorizado(datos, criterios) {
    const resultado = {
        estado: "no_cumple",
        faltantes: [],
        exclusiones: []
    };

    if (criterios.exclusion && cumpleBloqueCriterios(datos, criterios.exclusion)) {
        resultado.estado = "excluido";
        resultado.exclusiones.push("Cumple criterio de exclusión");
        return resultado;
    }

    if (criterios.inclusion) {
        const faltantes = [];
        const cumple = cumpleBloqueCriterios(datos, criterios.inclusion, faltantes);
        if (cumple) {
            resultado.estado = "cumple";
        } else {
            resultado.faltantes = faltantes;
        }
    }

    return resultado;
}

export function evaluarPaciente(datosPaciente) {
    const resultados = {};
    for (const [nombreEstudio, criterios] of Object.entries(criteriosEstudios.estudios)) {
        resultados[nombreEstudio] = evaluarEstudioPriorizado(datosPaciente, criterios);
    }
    return resultados;
}

export function mostrarResultadosDetallados(resultados, contenedorId = 'lista-estudios') {
    const contenedor = document.getElementById(contenedorId);
    contenedor.innerHTML = '';

    if (Object.keys(resultados).length === 0) {
        contenedor.innerHTML = '<span class="excluido">No se encontraron estudios para evaluar</span>';
        return;
    }

    for (const [estudio, resultado] of Object.entries(resultados)) {
        const wrapper = document.createElement('div');
        wrapper.className = 'estudio';

        const encabezado = document.createElement('div');
        encabezado.className = 'estudio-header';
        encabezado.textContent = estudio;
        encabezado.title = criteriosEstudios.estudios[estudio]?.descripcion || 'Estudio sin descripción';

        const estado = document.createElement('span');
        estado.className = `estado ${resultado.estado}`;
        estado.textContent = resultado.estado === 'cumple'
            ? '✅ Cumple'
            : resultado.estado === 'parcial'
            ? '⚠️ Parcial'
            : resultado.estado === 'excluido'
            ? '❌ Excluido'
            : '❌ No cumple';

        encabezado.appendChild(estado);

        const cuerpo = document.createElement('div');
        cuerpo.className = 'estudio-body';
        cuerpo.style.display = 'none';

        let html = '';
        if (resultado.exclusiones.length > 0) {
            html += `<p><strong>Excluido por:</strong> ${resultado.exclusiones.join(', ')}</p>`;
        } else if (resultado.faltantes.length > 0) {
            html += `<p><strong>Faltan:</strong> ${resultado.faltantes.join(', ')}</p>`;
        } else {
            html += `<p><strong>✔️ Cumple todos los criterios</strong></p>`;
        }

        cuerpo.innerHTML = html;

        encabezado.addEventListener('click', () => {
            cuerpo.style.display = cuerpo.style.display === 'none' ? 'block' : 'none';
        });

        wrapper.appendChild(encabezado);
        wrapper.appendChild(cuerpo);
        contenedor.appendChild(wrapper);
    }

    const hayEstudioElegible = Object.values(resultados).some(res =>
        res.estado === 'cumple' || res.estado === 'parcial'
    );

    const botonDerivacion = document.getElementById('btn-generar-derivacion');
    if (botonDerivacion) {
        botonDerivacion.disabled = !hayEstudioElegible;
        botonDerivacion.style.opacity = hayEstudioElegible ? '1' : '0.5';
        botonDerivacion.style.cursor = hayEstudioElegible ? 'pointer' : 'not-allowed';
    }
}

export { parseLaboratorio };

