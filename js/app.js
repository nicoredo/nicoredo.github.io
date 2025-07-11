const descripcionesEstudios = {};

// Cargar descripciones de estudios desde JSON externo
fetch("https://medex-backend.onrender.com/criterios.json")
  .then(res => res.json())
  .then(data => {
    data.estudios.forEach(est => {
      const clave = est.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      descripcionesEstudios[clave] = est.descripcion;
    });
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

    doc.text("Derivacion MedEx", 20, y); y += 10;
    doc.text("Paciente: " + nombre, 20, y); y += 7;
    doc.text("DNI: " + dni, 20, y); y += 7;
    doc.text("Contacto: " + contacto, 20, y); y += 7;
    doc.text("Derivado por: " + medico, 20, y); y += 15;

    doc.text("Historia Clinica:", 20, y); y += 7;
    const historia = doc.splitTextToSize(texto, 170);
    doc.text(historia, 20, y); y += historia.length * 7 + 10;

    doc.text("Evaluacion IA:", 20, y); y += 10;

    const bloques = document.querySelectorAll('.estudio-bloque');
    bloques.forEach(bloque => {
      const nombreEstudio = bloque.querySelector('h3')?.innerText || "";
      const estado = bloque.querySelector('.estado-tag')?.innerText || "";
      const descripcion = bloque.querySelector('.descripcion')?.innerText || "";
      const detalle = bloque.querySelector('.detalle-ia')?.innerText || "";

      doc.text(`${nombreEstudio} - ${estado}`, 20, y); y += 7;
      const descLineas = doc.splitTextToSize(descripcion, 170);
      doc.text(descLineas, 20, y); y += descLineas.length * 7;

      const detLineas = doc.splitTextToSize(detalle, 170);
      doc.text(detLineas, 20, y); y += detLineas.length * 7 + 5;
    });

    doc.text("Observaciones del medico:", 20, y); y += 7;
    const obs = doc.splitTextToSize(comentarios, 170);
    doc.text(obs, 20, y);

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
