import { extraerDatosHC } from './web-content.js';
import { evaluarPaciente, mostrarResultadosDetallados } from './evaluacion.js';
import { cargarDatosIniciales, terminologiaMedica } from './data-loader.js';


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


    // Estado global
    const estadoApp = {
        datosPaciente: null,
        terminologiaCargada: false
    };

    // Inicialización
    init();

    async function init() {
        const cargado = await cargarDatosIniciales();
        if (!cargado) {
            alert("Error al cargar datos iniciales");
            return;
        }
    
        console.log("Terminología cargada:", terminologiaMedica);  // para verificar
        configurarBotonesEdicion();
        setupEventListeners();
    }

    function setupEventListeners() {
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

        btnEvaluarEstudios.addEventListener('click', () => {
            if (!estadoApp.datosPaciente) {
                alert('Primero debe evaluar al paciente');
                return;
            }
            evaluarPaciente(estadoApp.datosPaciente);
        });
    }
    
    // 1. Evaluar paciente (extraer datos)
    btnEvaluarPaciente.addEventListener('click', function() {
        if (!textoHC.value.trim()) {
            alert('Por favor ingrese el texto de la historia clínica');
            return;
        }
        
        // Extraer datos usando la función de web-content.js
        estadoApp.datosPaciente = extraerDatosHC(textoHC.value);
        mostrarDatos(estadoApp.datosPaciente);
    });
    
    // 2. Evaluar estudios clínicos
    btnEvaluarEstudios.addEventListener('click', function() {
        if (!estadoApp.datosPaciente?.edad && estadoApp.datosPaciente?.edad !== 0) {
            alert('Primero extraiga los datos del paciente');
            return;
        }
        
        evaluarPaciente(); // Usamos tu función original de evaluación
    });
    
    // Función para mostrar datos en la UI (adaptada de tu popup.js)

    function mostrarDatos(datos = {}) {
        const datosCompletos = {
            edad: datos.edad || "No detectada",
            antecedentes: Array.isArray(datos.antecedentes) ? datos.antecedentes : [],
            riesgo: Array.isArray(datos.factoresRiesgo) ? datos.factoresRiesgo : [],
            medicacion: Array.isArray(datos.medicacion) ? datos.medicacion : [],
            laboratorio: Array.isArray(datos.laboratorio) ? datos.laboratorio : []
        };
    
        edadValor.textContent = datosCompletos.edad;
        antecedentesValor.textContent = datosCompletos.antecedentes.join(", ") || "-";
        riesgoValor.textContent = datosCompletos.riesgo.join(", ") || "-";
        medValor.textContent = datosCompletos.medicacion.join(", ") || "-";
        labValor.textContent = datosCompletos.laboratorio.join(", ") || "-";
        
        // Actualizar objeto datosPaciente
        estadoApp.datosPaciente = {
            edad: typeof datosCompletos.edad === 'number' ? datosCompletos.edad : 0,
            antecedentes: datosCompletos.antecedentes,
            factoresRiesgo: datosCompletos.riesgo,
            medicacion: datosCompletos.medicacion,
            laboratorio: datosCompletos.laboratorio
        };
        
        // Configurar botones de edición
        configurarBotonesEdicion();
    }
    
    // Función para configurar botones de edición (de tu popup.js)
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
    
            if (!btnEditar || !btnConfirmar || !valorSpan || !input) {
                console.error(`Elementos no encontrados para ${id}`);
                return;
            }
    
            // --- EDITAR ---
            btnEditar.addEventListener('click', () => {
                valorSpan.style.display = 'none';
    
                if (autocomplete && wrapper) {
                    wrapper.style.display = 'block';
                    input.style.display = 'inline-block';
                    document.getElementById(`${id}-suggestions`).innerHTML = '';
                } else {
                    input.style.display = 'inline-block';
                }
    
                btnEditar.style.display = 'none';
                btnConfirmar.style.display = 'inline-block';
    
                input.value = valorSpan.textContent !== '-' ? valorSpan.textContent : '';
                input.focus();
            });
    
            // --- CONFIRMAR ---
            btnConfirmar.addEventListener('click', () => {
                const nuevoValor = input.value.trim();
                valorSpan.textContent = nuevoValor || '-';
                valorSpan.style.display = 'inline';
    
                if (autocomplete && wrapper) {
                    wrapper.style.display = 'none';
                    input.style.display = 'none';
                } else {
                    input.style.display = 'none';
                }
    
                btnConfirmar.style.display = 'none';
                btnEditar.style.display = 'inline-block';
    
                // Actualizar datos internos
                const valores = nuevoValor
                    ? nuevoValor.split(',').map(s => s.trim()).filter(s => s)
                    : [];
    
                if (id === 'edad') {
                    datosPaciente.edad = parseFloat(nuevoValor) || 0;
                } else {
                    datosPaciente[id === 'med' ? 'medicacion' : id === 'lab' ? 'laboratorio' : id === 'riesgo' ? 'factoresRiesgo' : id] = valores;
                }
            });
        });
    }
    
    // Inicializar autocompletado (similar a tu popup.js)
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
    
            if (!input || !suggestionsContainer) {
                console.error(`Faltan elementos para ${id}`);
                return;
            }
    
            input.addEventListener('input', (e) => {
                const currentText = e.target.value;
                const lastTerm = currentText.split(',').pop().trim().toLowerCase();
                mostrarSugerencias(lastTerm, tipo, suggestionsContainer, input);
            });
    
            input.addEventListener('keydown', (e) => {
                if (e.key === ',') {
                    setTimeout(() => {
                        const currentText = input.value;
                        const lastTerm = currentText.split(',').pop().trim().toLowerCase();
                        mostrarSugerencias(lastTerm, tipo, suggestionsContainer, input);
                    }, 10);
                }
            });
    
            document.addEventListener('click', (e) => {
                if (!input.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                    suggestionsContainer.innerHTML = '';
                }
            });
        });
    }
    
    // Función para mostrar sugerencias de autocompletado
    function mostrarSugerencias(searchTerm, tipo, container, input) {
        container.innerHTML = '';
        if (!searchTerm || searchTerm.length < 1) return;
    
        const sugerencias = Array.from(terminosMedicos[tipo]);
        const resultados = sugerencias
            .filter(term => term.includes(searchTerm))
            .slice(0, 8);
    
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
    
    // Cargar terminología médica al iniciar
    cargarTerminologia().then(() => {
        inicializarAutocompletado();
    });
    
    // Función para cargar terminología (de tu popup.js)
    async function cargarTerminologia() {
        try {
            const response = await fetch('data/terminologia_medica.json');
            const data = await response.json();
            
            Object.entries(data).forEach(([categoria, terminos]) => {
                Object.keys(terminos).forEach(termino => {
                    terminosMedicos[categoria].add(termino.toLowerCase());
                });
            });
        } catch (error) {
            console.error("Error cargando terminología:", error);
        }
    }
    
    // Variables globales (de tu popup.js)
    const terminosMedicos = {
        antecedentes: new Set(),
        riesgo: new Set(),
        medicacion: new Set(),
        laboratorio: new Set()
    };
});