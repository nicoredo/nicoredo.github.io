// evaluacion.js funcional adaptado para entorno web
import { criteriosEstudios } from './data-loader.js';

function parseLaboratorio(textoLab) {
    const resultados = {};
    if (!textoLab || textoLab.trim() === '-' || textoLab.trim() === '') return resultados;

    // Maneja tanto ", " como "," como separadores
    const items = textoLab.split(/,\s*/).filter(item => item.includes(':'));
    
    items.forEach(item => {
        const [key, value] = item.split(':').map(part => part.trim());
        if (key && value) {
            // Extrae el valor numérico eliminando todo lo que no sea número, punto o coma
            const numericValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
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

        switch (operador) {
            case '>': return edad > valor;
            case '<': return edad < valor;
            case '>=': return edad >= valor;
            case '<=': return edad <= valor;
        }
    }

    return edad === Number(criterio);
}

function evaluarLaboratorio(labData, criterio) {
    if (!labData || typeof labData !== 'object') return false;

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
        // Mapeo de alias para compatibilidad
        const grupoMapeado = {
            'factores': 'riesgo',
            'factoresRiesgo': 'riesgo'
        }[grupo] || grupo;

        // Verificación de estructura de datos
        if (!datos || typeof datos !== 'object') {
            console.error('Datos del paciente no válidos', datos);
            return false;
        }

        switch(grupoMapeado) {
            case 'edad':
                if (typeof datos.edad !== 'number') {
                    console.warn('Edad no es número:', datos.edad);
                    return false;
                }
                return evaluarRango(datos.edad, criterio);
                
            case 'laboratorio':
                if (!datos.laboratorio || typeof datos.laboratorio !== 'object') {
                    console.warn('Datos de laboratorio no válidos');
                    return false;
                }
                return evaluarLaboratorio(datos.laboratorio, criterio);
                
            default:
                // Asegurarnos que la propiedad existe y es array
                if (!datos.hasOwnProperty(grupoMapeado) || !Array.isArray(datos[grupoMapeado])) {
                    console.warn(`Propiedad ${grupoMapeado} no existe o no es array`);
                    return false;
                }
                
                const valores = datos[grupoMapeado];
                const regex = new RegExp(criterio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                return valores.some(item => regex.test(item));
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

    if (totalCumplidos === totalRequerido) {
        resultado.estado = "cumple";
    } else if (totalCumplidos >= 2 && totalCumplidos >= totalRequerido * 0.5) {
        resultado.estado = "parcial";
    }

    return resultado;
}


// EXPORTACION//

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

        // Habilitar o deshabilitar el botón de derivación según si hay estudios cumplidos
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
}


export { parseLaboratorio};
