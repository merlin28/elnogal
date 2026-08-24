// ================================================
// SUBIDA DE EVIDENCIAS
// - Fotos: se comprimen en el navegador (canvas) antes de subir.
// - Fotos, videos y documentos (PDF/Word/Excel) se suben DIRECTO del
//   navegador a Google Drive con una sesión de subida reanudable (el backend
//   solo firma la sesión, nunca ve los bytes). Se transfieren en trozos de
//   CONFIG.TAMANO_TROZO con reintento (hasta 3 veces, backoff 1s/2s/4s) si un
//   trozo falla.
//
// Límite de esta implementación: si el envío se corta y hay que reintentar
// la sede completa, el archivo se sube de nuevo desde el trozo 1 (no hay
// reanudación persistida entre sesiones). Puede quedar un archivo duplicado
// en Drive si un trozo ya se había confirmado antes del corte; se borra a
// mano si ocurre.
// ================================================

function esperar_(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Compresión de fotos ────────────────────────────────────

function comprimirImagen(file) {
  return new Promise((resolve) => {
    if (!file.type || !file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const ladoMax = CONFIG.FOTO_LADO_MAX;
      if (width > ladoMax || height > ladoMax) {
        if (width > height) {
          height = Math.round((height * ladoMax) / width);
          width = ladoMax;
        } else {
          width = Math.round((width * ladoMax) / height);
          height = ladoMax;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        CONFIG.FOTO_CALIDAD
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // si no se puede procesar, se sube el original sin comprimir
    };
    img.src = url;
  });
}

// ─── Nombre de archivo ───────────────────────────────────────
// Convención: SISMO-ddMMyy-FOTO-MUNICIPIO-INSTITUCION-SEDE-01.ext

function limpiarParaNombre_(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes (marcas diacriticas tras NFD)
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toUpperCase();
}

function fechaCorta_() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return dd + mm + yy;
}

function construirNombreBase(municipio, institucion, sede, tipo, indice) {
  const tipoTag = tipo === 'foto' ? 'FOTO' : tipo === 'video' ? 'VIDEO' : 'DOC';
  const idx = String(indice).padStart(2, '0');
  return [
    'SISMO',
    fechaCorta_(),
    tipoTag,
    limpiarParaNombre_(municipio),
    limpiarParaNombre_(institucion),
    limpiarParaNombre_(sede),
    idx,
  ].join('-');
}

function extensionPorMime_(mime) {
  const mapa = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/3gpp': '3gp',
    'video/x-matroska': 'mkv',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
  };
  if (mapa[mime]) return mapa[mime];
  if (mime && mime.indexOf('/') !== -1) return mime.split('/')[1];
  return 'bin';
}

// ─── Sesión de subida reanudable ─────────────────────────────

async function solicitarSesionSubida_(carpetaId, nombreArchivo, mimeType) {
  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ accion: 'sesionSubida', carpetaId, nombreArchivo, mimeType }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data.uploadUrl;
}

async function subirEnTrozos_(uploadUrl, blob, onProgress) {
  const total = blob.size;
  const tam = CONFIG.TAMANO_TROZO;
  let inicio = 0;
  let ultimaRespuesta = null;

  if (total === 0) {
    // Archivo vacío: un solo PUT sin cuerpo basta para cerrarlo.
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': 'bytes */0' } });
    ultimaRespuesta = await res.json();
    if (onProgress) onProgress(1);
    return ultimaRespuesta;
  }

  while (inicio < total) {
    const fin = Math.min(inicio + tam, total);
    const trozo = blob.slice(inicio, fin);
    const contentRange = `bytes ${inicio}-${fin - 1}/${total}`;

    let intento = 0;
    let exito = false;
    while (!exito) {
      try {
        const res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Range': contentRange },
          body: trozo,
        });

        if (res.status === 200 || res.status === 201) {
          ultimaRespuesta = await res.json();
          exito = true;
        } else if (res.status === 308) {
          exito = true; // trozo intermedio aceptado ("Resume Incomplete")
        } else {
          throw new Error('Google Drive respondió ' + res.status + ' al subir un trozo.');
        }
      } catch (err) {
        intento++;
        if (intento >= 3) throw err;
        await esperar_(1000 * Math.pow(2, intento - 1)); // 1s, 2s, 4s
      }
    }

    inicio = fin;
    if (onProgress) onProgress(inicio / total);
  }

  return ultimaRespuesta;
}

// ─── API pública ─────────────────────────────────────────────
// Sube `file` (comprimiéndolo antes si es foto) a `carpetaId`, con el nombre
// `nombreBase` (sin extensión — se añade sola según el tipo MIME real).
// onProgress(fraccion 0..1) se llama en cada trozo confirmado.
// Devuelve { nombre, url, tipo }.

async function subirArchivo(file, carpetaId, tipo, nombreBase, onProgress) {
  const blob = tipo === 'foto' ? await comprimirImagen(file) : file;
  const mime = blob.type || file.type || 'application/octet-stream';
  const nombre = nombreBase + '.' + extensionPorMime_(mime);

  // Si una sesión de subida se invalida a mitad de camino (p. ej. un corte
  // de red), reintentar contra la misma URL nunca funciona — hay que pedir
  // una sesión nueva. Se intenta con hasta 2 sesiones distintas.
  let ultimoError;
  for (let intentoSesion = 0; intentoSesion < 2; intentoSesion++) {
    try {
      const uploadUrl = await solicitarSesionSubida_(carpetaId, nombre, mime);
      const resultado = await subirEnTrozos_(uploadUrl, blob, onProgress);
      const id = resultado && resultado.id;
      const url = id ? `https://drive.google.com/file/d/${id}/view` : '';
      return { nombre, url, tipo, id: id || '' };
    } catch (err) {
      ultimoError = err;
      if (intentoSesion === 0) await esperar_(1500);
    }
  }
  throw ultimoError;
}
