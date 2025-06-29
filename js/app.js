import { extraerDatosHC } from './web-content.js';
import { evaluarPaciente, mostrarResultadosDetallados } from './evaluacion.js';
import { cargarDatosIniciales, terminologiaMedica } from './data-loader.js';
import { parseLaboratorio } from './evaluacion.js';

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

        document.getElementById('btn-limpiar-extraccion').addEventListener('click', () => {
            edadValor.textContent = '-';
            antecedentesValor.textContent = '-';
            riesgoValor.textContent = '-';
            medValor.textContent = '-';
            labValor.textContent = '-';
            document.getElementById('lista-estudios').innerHTML = '';
            estadoApp.datosPaciente = null;
        });
        
        document.getElementById('btn-limpiar-todo').addEventListener('click', () => {
            document.getElementById('texto-hc').value = '';
            edadValor.textContent = '-';
            antecedentesValor.textContent = '-';
            riesgoValor.textContent = '-';
            medValor.textContent = '-';
            labValor.textContent = '-';
            document.getElementById('lista-estudios').innerHTML = '';
            estadoApp.datosPaciente = null;
        });
        
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

        const datosParaEvaluar = {
            edad: parseInt(edadValor.textContent) || 0,
            antecedentes: antecedentesValor.textContent !== '-' ? 
                antecedentesValor.textContent.split(', ') : [],
            riesgo: riesgoValor.textContent !== '-' ? 
                riesgoValor.textContent.split(', ') : [],
            medicacion: medValor.textContent !== '-' ? 
                medValor.textContent.split(', ') : [],
            laboratorio: parseLaboratorio(labValor.textContent !== '-' ? 
                labValor.textContent : "")
        };

        console.log("Enviando a IA:", datosParaEvaluar);

        fetch('http://127.0.0.1:8000/evaluar_ia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ datos: datosParaEvaluar })
        })
        .then(res => res.json())
        .then(data => {
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
        })
        .catch(err => {
            console.error("Error al consultar la IA:", err);
            alert("Hubo un problema al contactar la IA");
        });
    });

    
    

        //// Cuadro de dialogo para preguntar filiatorios del paciente
        const modal = document.getElementById('modal-derivacion');
        const btnGenerar = document.getElementById('btn-generar-derivacion');
        const btnCancelar = document.getElementById('btn-cancelar-modal');
        const btnConfirmar = document.getElementById('btn-confirmar-modal');
        
        btnGenerar.addEventListener('click', () => {
          modal.style.display = 'flex';
        });
        
        btnCancelar.addEventListener('click', () => {
          modal.style.display = 'none';
        });
        
        btnConfirmar.addEventListener('click', () => {
          const filiatorios = {
            derivador: document.getElementById('titulo-derivacion').value,
            apellido: document.getElementById('apellido').value,
            nombre: document.getElementById('nombre').value,
            dni: document.getElementById('dni').value,
            telefono: document.getElementById('telefono').value
          };
        
          modal.style.display = 'none';
        
          generarPDFDerivacion(filiatorios, estadoApp.datosPaciente, document.getElementById('texto-hc').value);
        });
    }
        
   
    
    // Función para mostrar datos en la UI (adaptada de tu popup.js)

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
        labValor.textContent = Object.entries(datosCompletos.laboratorio)
  .map(([k, v]) => `${k}: ${v}`)
  .join(", ") || "-";

        
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
    
    // Función para configurar botones de edición 
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
                const datosPaciente = estadoApp.datosPaciente;
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
    
    // Inicializar autocompletado
    
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
    
    // Función para cargar terminología 
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
    console.log(estadoApp.resultadosEvaluacion);

    async function generarPDFDerivacion(filiatorios, datosPaciente, textoHC) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
      
        const addLinesWithPageBreak = (doc, lines, startY) => {
          let y = startY;
          for (const line of lines) {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.text(line, 15, y);
            y += 7;
          }
          return y;
        };
      
        const fechaActual = new Date().toLocaleString("es-AR", {
          dateStyle: "short", timeStyle: "short"
        });
      
        const estudiosElems = document.querySelectorAll("#lista-estudios .estudio");
        const estudiosCumplidos = [];
      
        estudiosElems.forEach(est => {
          const nombre = est.querySelector(".estudio-header")?.childNodes[0]?.textContent?.trim() || '';
          const estado = est.querySelector(".estado")?.textContent?.trim();
          if (estado?.includes("Cumple") || estado?.includes("Parcial")) {
            estudiosCumplidos.push({ nombre, estado });
          }
        });
      
        let y = 20;
      
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(filiatorios.titulo || "Informe de Derivación", 105, y, { align: "center" });
        y += 8;
      
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Generado el: ${fechaActual}`, 105, y, { align: "center" });
        y += 12;
      
        doc.setFontSize(12);
        doc.text(`Apellido: ${filiatorios.apellido}`, 15, y); y += 7;
        doc.text(`Nombre: ${filiatorios.nombre}`, 15, y); y += 7;
        doc.text(`DNI: ${filiatorios.dni}`, 15, y); y += 7;
        doc.text(`Teléfono: ${filiatorios.telefono}`, 15, y); y += 10;
      
        doc.setFont("helvetica", "bold");
        doc.text("Estudios clínicos sugeridos:", 15, y); y += 7;
        doc.setFont("helvetica", "normal");
      
        for (const est of estudiosCumplidos) {
            const headerLine = `• ${est.nombre}`;
            const estadoLine = `    Estado: ${est.estado}`;
            const lines = doc.splitTextToSize(`${headerLine}\n${estadoLine}`, 180);
            y = addLinesWithPageBreak(doc, lines, y);
            y += 3;
          }
          
      
        doc.setFont("helvetica", "bold");
        doc.text("Datos clínicos extraídos:", 15, y); y += 7;
        doc.setFont("helvetica", "normal");
      
        doc.text(`Edad: ${datosPaciente.edad}`, 15, y); y += 7;
        doc.text(`Antecedentes: ${datosPaciente.antecedentes?.join(", ") || "-"}`, 15, y); y += 7;
        doc.text(`Factores de riesgo: ${datosPaciente.factoresRiesgo?.join(", ") || "-"}`, 15, y); y += 7;
        doc.text(`Medicación: ${datosPaciente.medicacion?.join(", ") || "-"}`, 15, y); y += 7;
      
        const labStr = Object.entries(datosPaciente.laboratorio || {})
          .map(([k,v]) => `${k}: ${v}`)
          .join(", ") || "-";
        const labLines = doc.splitTextToSize(`Laboratorio: ${labStr}`, 180);
        y = addLinesWithPageBreak(doc, labLines, y); y += 3;
      
        doc.setFont("helvetica", "bold");
        doc.text("Historia clínica aportada:", 15, y); y += 7;
        doc.setFont("helvetica", "normal");
      
        const hcLines = doc.splitTextToSize(textoHC || "-", 180);
        y = addLinesWithPageBreak(doc, hcLines, y);
      
        // Mostrar PDF en una nueva pestaña para imprimir
        const pdfBlob = doc.output("blob");
        const pdfURL = URL.createObjectURL(pdfBlob);
        const printWindow = window.open(pdfURL);
      
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
          };
        }
      }
      
      
    // Variables globales
    const terminosMedicos = {
        antecedentes: new Set(),
        riesgo: new Set(),
        medicacion: new Set(),
        laboratorio: new Set()
    };
});

window.addEventListener('DOMContentLoaded', () => {
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

  console.log("✨ Script de transición cargado"); // <-- Confirmación visible

  activarSeccion(entrada); // Activar bloque 1

  document.getElementById('evaluar-paciente').addEventListener('click', () => {
    console.log("➡️ Activando bloque datos-paciente");
    activarSeccion(datos);
  });

  document.getElementById('evaluar-estudios').addEventListener('click', () => {
    console.log("➡️ Activando bloque estudios");
    activarSeccion(estudios);
  });
});
