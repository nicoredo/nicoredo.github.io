import { extraerDatosHC } from './web-content.js';
import { evaluarPaciente, mostrarResultadosDetallados } from './evaluacion.js';
import { cargarDatosIniciales, terminologiaMedica } from './data-loader.js';
import { parseLaboratorio } from './evaluacion.js';

const terminosMedicos = {
    antecedentes: new Set(),
    riesgo: new Set(),
    medicacion: new Set(),
    laboratorio: new Set()
};

const estadoApp = {
    datosPaciente: null,
    terminologiaCargada: false
};

document.addEventListener('DOMContentLoaded', function() {
    // Elementos UI
    const btnEvaluarPaciente = document.getElementById('evaluar-paciente');
    const btnEvaluarEstudios = document.getElementById('evaluar-estudios');
    const textoHC = document.getElementById('texto-hc');
    const edadValor = document.getElementById('edad-valor');
    const antecedentesValor = document.getElementById('antecedentes-valor');
    const riesgoValor = document.getElementById('riesgo-valor');
    const medValor = document.getElementById('med-valor');
    const labValor = document.getElementById('lab-valor');

    const entrada = document.getElementById('entrada-paciente');
    const datos = document.getElementById('datos-paciente');
    const estudios = document.getElementById('estudios');

    function activarSeccion(seccionActiva) {
        [entrada, datos, estudios].forEach(sec => {
            sec.classList.remove('seccion-activa', 'seccion-inactiva');
        });

        [entrada, datos, estudios].forEach(sec => {
            if (sec !== seccionActiva) {
                sec.classList.add('seccion-inactiva');
            }
        });

        seccionActiva.classList.add('seccion-activa');
    }

    console.log("✨ Script de transición cargado");

    activarSeccion(entrada);

    btnEvaluarPaciente.addEventListener('click', () => {
        console.log("➡️ Activando bloque datos-paciente");
        activarSeccion(datos);
    });

    btnEvaluarEstudios.addEventListener('click', () => {
        console.log("➡️ Activando bloque estudios");
        activarSeccion(estudios);
    });

    init();

    async function init() {
        const cargado = await cargarDatosIniciales();
        if (!cargado) {
            alert("Error al cargar datos iniciales");
            return;
        }

        console.log("Terminología cargada:", terminologiaMedica);
        await cargarTerminologia();
        inicializarAutocompletado();
        configurarBotonesEdicion();
        setupEventListeners();
    }

    function setupEventListeners() {
        const btnEvaluarPaciente = document.getElementById('evaluar-paciente');
        btnEvaluarPaciente.addEventListener('click', async () => {
            if (!textoHC.value.trim()) {
                alert('Por favor ingrese el texto de la historia clínica');
                return;
            }

            try {
                estadoApp.datosPaciente = await extraerDatosHC(textoHC.value);
                mostrarDatos(estadoApp.datosPaciente);
            } catch (error) {
                console.error("Error al extraer datos:", error);
                alert("Error al procesar la historia clínica");
            }
        });
    }


    // REUTILIZA LA FUNCIÓN ORIGINAL DE CONFIGURAR BOTONES QUE ESTABA PRESENTE
    function configurarBotonesEdicion() {
        const campos = [
            { id: 'edad', esTexto: false, autocomplete: false },
            { id: 'antecedentes', esTexto: true, autocomplete: true },
            { id: 'riesgo', esTexto: true, autocomplete: true },
            { id: 'med', esTexto: true, autocomplete: true },
            { id: 'lab', esTexto: true, autocomplete: true }
        ];

        campos.forEach(({ id, esTexto, autocomplete }) => {
            const btnEditar = document.getElementById(`btn-editar-${id}`);
            const btnConfirmar = document.getElementById(`btn-confirmar-${id}`);
            const valorSpan = document.getElementById(`${id}-valor`);
            const input = document.getElementById(`${id}-input`);
            const wrapper = autocomplete ? document.getElementById(`${id}-autocomplete`) : null;

            if (!btnEditar || !btnConfirmar || !valorSpan || !input) return;

            btnEditar.addEventListener('click', () => {
                valorSpan.style.display = 'none';
                if (autocomplete && wrapper) wrapper.style.display = 'block';
                input.style.display = 'inline-block';
                input.value = valorSpan.textContent !== '-' ? valorSpan.textContent : '';
                btnEditar.style.display = 'none';
                btnConfirmar.style.display = 'inline-block';
                input.focus();
            });

            btnConfirmar.addEventListener('click', () => {
                const nuevoValor = input.value.trim();
                valorSpan.textContent = nuevoValor || '-';
                valorSpan.style.display = 'inline';
                if (autocomplete && wrapper) wrapper.style.display = 'none';
                input.style.display = 'none';
                btnConfirmar.style.display = 'none';
                btnEditar.style.display = 'inline-block';
                const datosPaciente = estadoApp.datosPaciente;
                const valores = nuevoValor ? nuevoValor.split(',').map(s => s.trim()).filter(s => s) : [];
                if (id === 'edad') datosPaciente.edad = parseFloat(nuevoValor) || 0;
                else datosPaciente[id === 'med' ? 'medicacion' : id === 'lab' ? 'laboratorio' : id === 'riesgo' ? 'factoresRiesgo' : id] = valores;
            });
        });
    }

    function inicializarAutocompletado() {
        const campos = [
            { id: 'antecedentes', tipo: 'antecedentes' },
            { id: 'riesgo', tipo: 'riesgo' },
            { id: 'med', tipo: 'medicacion' },
            { id: 'lab', tipo: 'laboratorio' }
        ];

        campos.forEach(({ id, tipo }) => {
            const input = document.getElementById(`${id}-input`);
            const suggestionsContainer = document.getElementById(`${id}-suggestions`);

            if (!input || !suggestionsContainer) return;

            input.addEventListener('input', (e) => {
                const currentText = e.target.value;
                const lastTerm = currentText.split(',').pop().trim().toLowerCase();
                mostrarSugerencias(lastTerm, tipo, suggestionsContainer, input);
            });

            document.addEventListener('click', (e) => {
                if (!input.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                    suggestionsContainer.innerHTML = '';
                }
            });
        });
    }

    function mostrarSugerencias(searchTerm, tipo, container, input) {
        container.innerHTML = '';
        if (!searchTerm || searchTerm.length < 1) return;

        const sugerencias = Array.from(terminosMedicos[tipo]);
        const resultados = sugerencias.filter(term => term.includes(searchTerm)).slice(0, 8);

        resultados.forEach((term) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = tipo === 'laboratorio' ? `${term}: ` : term;

            item.addEventListener('click', () => {
                const currentText = input.value;
                const terms = currentText.split(',').map(t => t.trim());
                terms[terms.length - 1] = tipo === 'laboratorio' ? `${term}: ` : term;
                input.value = terms.join(', ') + (tipo !== 'laboratorio' ? ', ' : '');
                container.innerHTML = '';
                input.focus();
            });

            container.appendChild(item);
        });
    }

    function mostrarDatos(datos = {}) {
        const datosCompletos = {
            edad: datos.edad || "No detectada",
            antecedentes: Array.isArray(datos.antecedentes) ? datos.antecedentes : [],
            riesgo: Array.isArray(datos.factoresRiesgo) ? datos.factoresRiesgo : [],
            medicacion: Array.isArray(datos.medicacion) ? datos.medicacion : [],
            laboratorio: parseLaboratorio(Array.isArray(datos.laboratorio) ? datos.laboratorio.join(", ") : "")
        };

        edadValor.textContent = datosCompletos.edad;
        antecedentesValor.textContent = datosCompletos.antecedentes.join(", ") || "-";
        riesgoValor.textContent = datosCompletos.riesgo.join(", ") || "-";
        medValor.textContent = datosCompletos.medicacion.join(", ") || "-";
        labValor.textContent = Object.entries(datosCompletos.laboratorio).map(([k, v]) => `${k}: ${v}`).join(", ") || "-";

        estadoApp.datosPaciente = {
            edad: typeof datosCompletos.edad === 'number' ? datosCompletos.edad : 0,
            antecedentes: datosCompletos.antecedentes,
            factoresRiesgo: datosCompletos.riesgo,
            medicacion: datosCompletos.medicacion,
            laboratorio: datosCompletos.laboratorio
        };

        configurarBotonesEdicion();
    }
});
