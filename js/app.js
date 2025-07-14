const descripcionesEstudios = {};

fetch("https://medex-backend.onrender.com/criterios")
  .then(res => {
    if (!res.ok) throw new Error("No se pudo cargar los criterios desde el backend");
    return res.json();
  })
  .then(data => {
    if (!data.estudios || !Array.isArray(data.estudios)) {
      console.error("⚠️ JSON inesperado:", data);
      return;
    }

    data.estudios.forEach(est => {
      const clave = est.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      descripcionesEstudios[clave] = est.descripcion;
    });

    console.log("✅ Descripciones cargadas:", descripcionesEstudios);
  })
  .catch(err => {
    console.error("❌ Error cargando descripciones:", err);
  });

document.addEventListener('DOMContentLoaded', function () {
  const textoHC = document.getElementById('texto-hc');
  const btnEvaluar = document.getElementById('evaluar-ia-directa');
  const contenedor = document.getElementById('resultado-ia');
  const botonDerivacion = document.getElementById('btn-derivar');
  const overlay = document.getElementById('overlay-cargando');
  const modal = document.getElementById('modal-derivacion');
  const cancelarBtn = document.getElementById('cancelar-derivacion');
  const confirmarBtn = document.getElementById('confirmar-derivacion');
  const limpiarBtn = document.getElementById('btn-limpiar');
const wordInput = document.getElementById("word-upload");
const estadoSubida = document.getElementById("estado-subida");

wordInput.addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;

  estadoSubida.textContent = "⏳ Procesando Word...";
  const formData = new FormData();
  formData.append("file", archivo);

  try {
    const res = await fetch("https://medex-backend.onrender.com/subir_word", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    document.getElementById("texto-hc").value = data.texto || "";
    estadoSubida.textContent = "✅ Word procesado correctamente";
  } catch (error) {
    console.error("❌ Error al subir Word:", error);
    estadoSubida.textContent = "❌ Error al procesar el archivo";
  }
});

  const btnVoz = document.getElementById("btn-voz");
const estadoVoz = document.getElementById("estado-voz");

if ('webkitSpeechRecognition' in window) {
  const recognition = new webkitSpeechRecognition();
  recognition.lang = "es-AR";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    estadoVoz.textContent = "🎙️ Escuchando...";
    btnVoz.disabled = true;
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("texto-hc").value += (transcript + " ");
    estadoVoz.textContent = "✅ Texto agregado por voz";
    btnVoz.disabled = false;
  };

  recognition.onerror = (event) => {
    estadoVoz.textContent = "❌ Error al dictar: " + event.error;
    btnVoz.disabled = false;
  };

  recognition.onend = () => {
    if (!btnVoz.disabled) return;
    btnVoz.disabled = false;
    estadoVoz.textContent = "🎤 Fin del dictado";
  };

  btnVoz.addEventListener("click", () => {
    recognition.start();
  });
} else {
  btnVoz.disabled = true;
  estadoVoz.textContent = "🎤 Dictado no soportado en este navegador";
}
  });

  const pdfInput = document.getElementById("pdf-upload");

pdfInput.addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;

  estadoSubida.textContent = "⏳ Procesando PDF...";
  const formData = new FormData();
  formData.append("file", archivo);

  try {
    const res = await fetch("https://medex-backend.onrender.com/subir_pdf", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    document.getElementById("texto-hc").value = data.texto || "";
    estadoSubida.textContent = "✅ PDF procesado correctamente";
  } catch (error) {
    console.error("❌ Error al subir PDF:", error);
    estadoSubida.textContent = "❌ Error al procesar el archivo";
  }
});

const btnLimpiarTexto = document.getElementById("btn-limpiar-texto");

btnLimpiarTexto.addEventListener("click", () => {
  const textarea = document.getElementById("texto-hc");
  textarea.value = "";
  estadoSubida.textContent = "";
});

  btnEvaluar.addEventListener('click', async () => {
    const textoLibre = textoHC.value.trim();
    if (!textoLibre) {
      alert('Pegue el texto de la historia clínica para evaluación IA');
      return;
    }

    overlay.classList.remove('oculto');

    try {
      const response = await fetch("https://medex-backend.onrender.com/evaluar_ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datos: { texto_hc: textoLibre } })
      });

      const data = await response.json();
      const estudios = data.estudios || [];

      mostrarEstudiosJSON(estudios);

      // Desplazamiento automático a resultados
      setTimeout(() => {
        document.getElementById("seccion-2").scrollIntoView({ behavior: 'smooth' });
      }, 300);

      const habilitar = estudios.some(e => e.estado === "✅" || e.estado === "⚠️");
      botonDerivacion.disabled = !habilitar;
      botonDerivacion.style.opacity = habilitar ? '1' : '0.5';
      botonDerivacion.style.cursor = habilitar ? 'pointer' : 'not-allowed';

    } catch (error) {
      console.error("❌ Error en evaluación IA:", error);
      alert("Ocurrió un error al consultar la IA.");
    } finally {
      overlay.classList.add('oculto');
    }
  });

  botonDerivacion.addEventListener('click', () => {
    modal.classList.remove('oculto');
  });

  cancelarBtn.addEventListener('click', () => {
    modal.classList.add('oculto');
  });

confirmarBtn.addEventListener('click', () => {
  const nombre = document.getElementById('nombre-paciente').value;
  const dni = document.getElementById('dni-paciente').value;
  const contacto = document.getElementById('contacto-paciente').value;
  const medico = document.getElementById('medico-derivador').value;
  const texto = document.getElementById('texto-hc').value;
  const comentarios = document.getElementById('comentarios-medico').value;

  const doc = new window.jspdf.jsPDF();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  let y = 20;

  function agregarTextoConSalto(textoArray) {
    textoArray.forEach(linea => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(linea, 20, y);
      y += 7;
    });
  }

  agregarTextoConSalto([
    "Derivacion MedEx",
    "Paciente: " + nombre,
    "DNI: " + dni,
    "Contacto: " + contacto,
    "Derivado por: " + medico,
    "",
    "Historia Clínica:"
  ]);

  const historia = doc.splitTextToSize(texto, 170);
  agregarTextoConSalto(historia);

  y += 10;
  if (y > 270) {
    doc.addPage();
    y = 20;
  }
  doc.text("Evaluación IA:", 20, y);
  y += 10;

  const bloques = document.querySelectorAll('.estudio-bloque');
  bloques.forEach(bloque => {
    const nombreEstudio = bloque.querySelector('h3')?.innerText || "";
    const estado = bloque.querySelector('.estado-tag')?.innerText || "";
    const descripcion = doc.splitTextToSize(
      bloque.querySelector('.descripcion')?.innerText || "", 170);
    const detalle = doc.splitTextToSize(
      bloque.querySelector('.detalle-ia')?.innerText || "", 170);

    agregarTextoConSalto([`${nombreEstudio} - ${estado}`]);
    agregarTextoConSalto(descripcion);
    agregarTextoConSalto(detalle);
    y += 5;
  });

  if (y > 270) {
    doc.addPage();
    y = 20;
  }
  doc.text("Observaciones del médico:", 20, y);
  y += 7;

  const obs = doc.splitTextToSize(comentarios, 170);
  agregarTextoConSalto(obs);

  doc.save("derivacion_medex.pdf");
  modal.classList.add('oculto');
});


  limpiarBtn.addEventListener('click', () => {
    textoHC.value = "";
    document.getElementById('comentarios-medico').value = "";
    contenedor.innerHTML = "<p><em>Esperando evaluación...</em></p>";
  });
});

function mostrarEstudiosJSON(estudios) {
  const contenedor = document.getElementById("resultado-ia");
  contenedor.innerHTML = "";

  if (estudios.length === 0) {
    contenedor.innerHTML = `<p style="padding:12px; font-style:italic;">No se detectaron estudios relevantes</p>`;
    return;
  }

  estudios.forEach(est => {
    const estadoClase = est.estado === "✅" ? "cumple" : est.estado === "⚠️" ? "parcial" : "excluido";
    const clave = est.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const descripcion = descripcionesEstudios[clave] || "Sin descripción.";
    const link = `https://medex.ar/estudios/${encodeURIComponent(est.nombre.toLowerCase().replace(/\s+/g, '-'))}`;

    const bloque = document.createElement("div");
    bloque.className = `estudio-bloque ${estadoClase}`;
    bloque.innerHTML = `
      <div class="estudio-header">
        <h3>${est.nombre}</h3>
        <span class="estado-tag">${est.estado} ${estadoClase === "cumple" ? "Cumple" : estadoClase === "parcial" ? "Parcial" : "No cumple"}</span>
      </div>
      <p class="descripcion">${descripcion}</p>
      <div class="detalle-ia"><p>${est.detalle}</p></div>
      <a href="${link}" target="_blank" class="ver-mas">🔎 Ver más</a>
    `;
    contenedor.appendChild(bloque);
  });

  contenedor.classList.remove("oculto");
  contenedor.classList.add("deslizar-aparicion");
}
