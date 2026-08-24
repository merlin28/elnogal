// ================================================
// CONFIGURACIÓN — URL del backend en Google Apps Script
// ================================================
const CONFIG = {
  // TODO: pega aquí la URL /exec de TU propio despliegue de Apps Script
  // (la obtienes al hacer "Implementar → Nueva implementación → Aplicación web").
  GAS_URL: 'https://script.google.com/macros/s/AKfycby4ouaM2UUdont1JhzRdD__dWqGUIyuT8vHeawCOBKNUFoZri8MAw9_rjDuMUWY6moX/exec',

  // Trozos de 8 MiB para la subida reanudable a Drive (múltiplo de 256 KiB, como exige la API).
  TAMANO_TROZO: 8 * 1024 * 1024,

  // Compresión de fotos en el navegador antes de subirlas.
  FOTO_LADO_MAX: 1920,
  FOTO_CALIDAD: 0.82,
};
