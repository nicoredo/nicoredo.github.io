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

    const estadoApp = {
        datosPaciente: null,
        terminologiaCargada: false
    };

    init();

    async function init() {
        const cargado = await cargarDatosIniciales();
        if (!cargado) {
            alert("Error al cargar datos iniciales");
            return;
        }

        console.log("Terminología cargada:", terminologiaMedica);
        configurarBotonesEdicion();
        setupEventListeners();
        await cargarTerminologia();
    }

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

        document.getElementById('btn-enviar-pregunta')?.addEventListener('click', async () => {
            const pregunta = document.getElementById('pregunta-ia').value.trim();
            const respuestaDiv = document.getElementById('respuesta-ia');
            if (!pregunta) return;

            respuestaDiv.innerHTML = '<em>Consultando IA...</em>';

            try {
                const response = await fetch('http://medex.ar/chat_ia', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Medex-Origin': 'web-app'
                    },
                    body: JSON.stringify({
                        pregunta,
                        datos: estadoApp.datosPaciente
                    })
                });

                const data = await response.json();
                respuestaDiv.innerHTML = data.respuesta || 'Respuesta vacía de la IA.';
            } catch (err) {
                console.error('Error al enviar pregunta IA:', err);
                respuestaDiv.innerHTML = '<span style="color:red;">Error al contactar la IA</span>';
            }
        });

        btnEvaluarEstudios.addEventListener('click', async () => {
            if (!estadoApp.datosPaciente) {
                alert('Primero debe evaluar al paciente');
                return;
            }

            const datosParaEvaluar = {
                edad: parseInt(edadValor.textContent) || 0,
                antecedentes: antecedentesValor.textContent !== '-' ? antecedentesValor.textContent.split(', ') : [],
                riesgo: riesgoValor.textContent !== '-' ? riesgoValor.textContent.split(', ') : [],
                medicacion: medValor.textContent !== '-' ? medValor.textContent.split(', ') : [],
                laboratorio: parseLaboratorio(labValor.textContent !== '-' ? labValor.textContent : "")
            };

            try {
                const response = await fetch('http://medex.ar/evaluar_ia', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Medex-Origin': 'web-app'
                    },
                    body: JSON.stringify({ datos: datosParaEvaluar })
                });

                const data = await response.json();

                const contenedor = document.getElementById('lista-estudios');
                contenedor.innerHTML = `
                    <h2 style="font-size:16px; color:#005c99;">🤖 Evaluación con IA</h2>
                    <div style="background:#eef6fa; padding:10px; border-radius:8px; font-size:14px;">
                        ${data.resumen_html || 'Sin respuesta interpretada'}
                    </div>
                `;

                if (data.resumen_html.includes("✅") || data.resumen_html.includes("⚠️")) {
                    const botonDerivacion = document.getElementById('btn-generar-derivacion');
                    botonDerivacion.disabled = false;
                    botonDerivacion.style.opacity = '1';
                    botonDerivacion.style.cursor = 'pointer';
                }
            } catch (err) {
                console.error("Error al consultar la IA:", err);
                alert("Hubo un problema al contactar la IA");
            }
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
    }
});
