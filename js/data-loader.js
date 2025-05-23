// Carga los archivos JSON necesarios
let terminologiaMedica = {};
let criteriosEstudios = {};

async function cargarDatosIniciales() {
    try {
        const [terminologiaRes, criteriosRes] = await Promise.all([
            fetch('data/terminologia_medica.json'),
            fetch('data/criterios_estudios.json')
        ]);
        
        terminologiaMedica = await terminologiaRes.json();
        criteriosEstudios = await criteriosRes.json();
        
        return true;
    } catch (error) {
        console.error("Error cargando datos iniciales:", error);
        return false;
    }
}

export { terminologiaMedica, criteriosEstudios, cargarDatosIniciales };