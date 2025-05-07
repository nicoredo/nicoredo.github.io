import { criteriosEstudios } from './data-loader.js';

function parseLaboratorio(textoLab) {
    const resultados = {};
    if (!textoLab || textoLab.trim() === '-' || textoLab.trim() === '') return resultados;

    textoLab.split(', ').forEach(item => {
        const [key, value] = item.split(':').map(part => part.trim());
        if (key && value) {
            const numericValue = parseFloat(value.replace(/[^\d.]/g, ''));
            if (!isNaN(numericValue)) {
                resultados[key.toLowerCase()] = numericValue;
            }
        }
    });
    return resultados;
}

function evaluarRango(edad, criterio) {
    if (criterio.includes('-')) {
        const [min, max] = criterio.split('-').map(Number);
        return !isNaN(min) && !isNaN(max) && edad >= min && edad <= max;
    }

    const match = criterio.match(/(>=|<=|>|<)\s*(\d+)/);
    if (match) {
        const [_, operador, valorStr] = match;
        const valor = Number(valorStr);
        if (isNaN(valor)) return false;
        
        switch(operador) {
            case '>': return edad > valor;
            case '<': return edad < valor;
            case '>=': return edad >= valor;
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

    if (valorPaciente === undefined || isNaN(valorCriterio)) return false;

    switch (operador) {
        case '>': return valorPaciente > valorCriterio;
        case '<': return valorPaciente < valorCriterio;
        case '>=': return valorPaciente >= valorCriterio;
        case '<=': return valorPaciente <= valorCriterio;
        case '=': return valorPaciente === valorCriterio;
        default: return false;
    }
}

function cumpleCriterio(datos, grupo, criterio) {
    try {
        switch(grupo) {
            case 'edad':
                return evaluarRango(datos.edad, criterio);
            case 'laboratorio':
                return evaluarLaboratorio(datos.laboratorio, criterio);
            default:
                const regex = new RegExp(criterio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                return datos[grupo].some(item => regex.test(item));
        }
    } catch (error) {
        console.error(`Error evaluando criterio: ${grupo}=${criterio}`, error);
        return false;
    }
}

function evaluarEstudioPriorizado(datos, criterios) {
    const resultado = {
        estado: "no_cumple",
        faltantes: [],
        exclusiones: []
    };

    // Evaluar exclusiones primero
    for (const [grupo, items] of Object.entries(criterios.exclusion || {})) {
        for (const item of items) {
            if (cumpleCriterio(datos, grupo, item)) {
                resultado.exclusiones.push(`${grupo}: ${item}`);
            }
        }
    }
    
    if (resultado.exclusiones.length > 0) {
        resultado.estado = "excluido";
        return resultado;
    }

    // Evaluar edad si existe como criterio
    if (criterios.inclusion.edad) {
        const cumpleEdad = criterios.inclusion.edad.some(item => 
            cumpleCriterio(datos, "edad", item)
        );
        if (!cumpleEdad) {
            resultado.faltantes.push(`Edad no cumple: ${criterios.inclusion.edad.join(' o ')}`);
            resultado.estado = "no_cumple";
            return resultado;
        }
    }

    // Evaluar otros criterios
    const gruposEvaluar = ['antecedentes', 'factores', 'laboratorio'];
    let totalCumplidos = 0;
    let totalRequerido = 0;

    gruposEvaluar.forEach(grupo => {
        if (criterios.inclusion[grupo]) {
            criterios.inclusion[grupo].forEach(item => {
                totalRequerido++;
                if (cumpleCriterio(datos, grupo, item)) {
                    totalCumplidos++;
                } else {
                    resultado.faltantes.push(`${grupo}: ${item}`);
                }
            });
        }
    });

    // Determinar estado final
    if (totalCumplidos === totalRequerido) {
        resultado.estado = "cumple";
    } else if (totalCumplidos >= 2 && totalCumplidos >= totalRequerido * 0.5) {
        resultado.estado = "parcial";
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

        // Detalles
        let html = '';
        if (resultado.exclusiones.length > 0) {
            html += `<p><strong>Excluido por:</strong> ${resultado.exclusiones.join(', ')}</p>`;
        } else if (resultado.faltantes.length > 0) {
            html += `<p><strong>Faltan:</strong> ${resultado.faltantes.join(', ')}</p>`;
        } else {
            html += `<p><strong>✔️ Cumple todos los criterios</strong></p>`;
        }

        cuerpo.innerHTML = html;

        // Toggle acordeón
        encabezado.addEventListener('click', () => {
            cuerpo.style.display = cuerpo.style.display === 'none' ? 'block' : 'none';
        });

        wrapper.appendChild(encabezado);
        wrapper.appendChild(cuerpo);
        contenedor.appendChild(wrapper);
    }
}