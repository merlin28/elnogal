// ================================================
// Encuesta de Daños en Apartamentos — lógica del formulario
// ================================================

const CLAVE_BORRADOR = 'encuesta_apartamentos_borrador';

let catalogos = null; // { torres, registradas }
let registradasSet = new Set();

// Estado del reporte actual en pantalla
let archivosSeleccionados = { fotos: [], videos: [], documentos: [] };
let archivosExistentes = [];
let numeroFilaEdicion = null;
let carpetaSedeId = null;
let urlSede = '';

// Elementos DOM
let elNombre, elCorreo, elTelefono, elContrasena;
let elTorre, elApartamento, elNivelChips, elDescripcion;
let elFotosInput, elVideosInput, elDocumentosInput;
let elFotosLista, elVideosLista, elDocumentosLista;

// ─── Utilidades ──────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function claveSede(torre, apartamento) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  return norm(torre) + '|' + norm(apartamento);
}

function formatearPeso(bytes) {
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function iconoSvg(id) {
  return `<svg class="icono-svg" aria-hidden="true"><use href="#${id}"></use></svg>`;
}

function estadoIconoMarkup(estado) {
  if (estado === 'ok') return iconoSvg('icono-check-circulo');
  if (estado === 'error') return iconoSvg('icono-alerta');
  if (estado === 'activo') return '<div class="spinner-sm"></div>';
  return iconoSvg('icono-circulo');
}

async function postGAS(payload) {
  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json;
}

// ─── Carga inicial de catálogos ─────────────────────────────

async function cargarCatalogos() {
  try {
    const res = await fetch(`${CONFIG.GAS_URL}?accion=catalogos`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);

    catalogos = json.data;
    registradasSet = new Set(catalogos.registradas || []);

    document.getElementById('cargandoCatalogos').classList.add('oculto');
    document.getElementById('formulario').classList.remove('oculto');

    restaurarBorrador();
    actualizarEstadoBotonEnviar();
  } catch (err) {
    document.getElementById('cargandoCatalogos').classList.add('oculto');
    document.getElementById('errorCatalogos').classList.remove('oculto');
  }
}

// ─── Adjuntos ────────────────────────────────────────────────

function claveArchivos(tipo) {
  if (tipo === 'foto') return 'fotos';
  if (tipo === 'video') return 'videos';
  return 'documentos';
}
function iconoParaTipo(tipo) {
  if (tipo === 'foto') return '#icono-camara';
  if (tipo === 'video') return '#icono-video';
  return '#icono-documento';
}
function etiquetaTipo(tipo) {
  if (tipo === 'foto') return 'Foto';
  if (tipo === 'video') return 'Video';
  return 'Documento';
}

function agregarArchivo(tipo, file, contenedorLista) {
  archivosSeleccionados[claveArchivos(tipo)].push(file);

  const tpl = document.getElementById('plantillaArchivo');
  const item = tpl.content.firstElementChild.cloneNode(true);
  item.querySelector('[data-role="nombre"]').textContent = file.name;
  item.querySelector('[data-role="peso"]').textContent = formatearPeso(file.size);

  if (tipo === 'foto') {
    const img = item.querySelector('[data-role="miniatura"]');
    img.src = URL.createObjectURL(file);
    img.classList.remove('oculto');
  } else {
    const icono = item.querySelector('[data-role="icono-video"]');
    icono.querySelector('[data-role="icono-tipo"] use').setAttribute('href', iconoParaTipo(tipo));
    icono.classList.remove('oculto');
  }

  item.querySelector('[data-role="quitar-archivo"]').addEventListener('click', () => {
    const lista = archivosSeleccionados[claveArchivos(tipo)];
    const idx = lista.indexOf(file);
    if (idx !== -1) lista.splice(idx, 1);
    item.remove();
    actualizarEstadoBotonEnviar();
  });

  contenedorLista.appendChild(item);
  actualizarEstadoBotonEnviar();
}

function idDriveDeEvidencia_(ev) {
  if (ev.id) return ev.id;
  const m = /\/d\/([^/]+)/.exec(ev.url || '');
  return m ? m[1] : '';
}

function renderArchivosExistentes() {
  elFotosLista.innerHTML = '';
  elVideosLista.innerHTML = '';
  elDocumentosLista.innerHTML = '';

  archivosExistentes.forEach((ev) => {
    const contenedor = ev.tipo === 'foto' ? elFotosLista : ev.tipo === 'video' ? elVideosLista : elDocumentosLista;
    const tpl = document.getElementById('plantillaArchivo');
    const item = tpl.content.firstElementChild.cloneNode(true);
    const id = idDriveDeEvidencia_(ev);

    item.querySelector('[data-role="nombre"]').textContent = ev.nombre;
    item.querySelector('[data-role="peso"]').textContent = 'Ya subido';

    if (id && (ev.tipo === 'foto' || ev.tipo === 'video')) {
      const img = item.querySelector('[data-role="miniatura"]');
      img.src = `https://drive.google.com/thumbnail?id=${id}&sz=w200`;
      img.classList.remove('oculto');
      img.addEventListener('error', () => {
        img.classList.add('oculto');
        const icono = item.querySelector('[data-role="icono-video"]');
        icono.querySelector('[data-role="icono-tipo"] use').setAttribute('href', iconoParaTipo(ev.tipo));
        icono.classList.remove('oculto');
      }, { once: true });
      if (ev.tipo === 'video') {
        const play = document.createElement('div');
        play.className = 'miniatura-play';
        play.innerHTML = iconoSvg('icono-video');
        img.insertAdjacentElement('afterend', play);
      }
    } else {
      const icono = item.querySelector('[data-role="icono-video"]');
      icono.querySelector('[data-role="icono-tipo"] use').setAttribute('href', iconoParaTipo(ev.tipo));
      icono.classList.remove('oculto');
    }

    if (id) {
      item.classList.add('previsualizable');
      item.addEventListener('click', () => abrirPrevia(ev, id));
    }

    item.querySelector('[data-role="quitar-archivo"]').addEventListener('click', (ev2) => {
      ev2.stopPropagation();
      const idx = archivosExistentes.indexOf(ev);
      if (idx !== -1) archivosExistentes.splice(idx, 1);
      item.remove();
    });

    contenedor.appendChild(item);
  });
}

// ─── Modal de previsualización ───────────────────────────────

function abrirPrevia(ev, id) {
  const modal = document.getElementById('modalPrevia');
  const cuerpo = modal.querySelector('[data-role="modal-cuerpo"]');
  const enlaceAbrir = modal.querySelector('[data-role="modal-abrir"]');

  modal.querySelector('[data-role="modal-nombre"]').textContent = ev.nombre;
  modal.querySelector('[data-role="modal-tipo"]').innerHTML = `${iconoSvg(iconoParaTipo(ev.tipo).slice(1))} ${etiquetaTipo(ev.tipo)}`;
  enlaceAbrir.href = ev.url || `https://drive.google.com/file/d/${id}/view`;
  cuerpo.innerHTML = `<iframe src="https://drive.google.com/file/d/${id}/preview" allow="autoplay" allowfullscreen></iframe>`;

  modal.classList.remove('oculto');
}

function cerrarPrevia() {
  const modal = document.getElementById('modalPrevia');
  modal.classList.add('oculto');
  modal.querySelector('[data-role="modal-cuerpo"]').innerHTML = '';
}

// ─── Consultar / mis reportes (correo y clave) ───────────────

async function cargarMisReportes() {
  const seccion = document.getElementById('misReportes');
  const lista = document.getElementById('misReportesLista');
  const banner = document.getElementById('mensajeError');

  const correo = elCorreo.value.trim();
  const contrasena = elContrasena.value;

  if (!correo || !contrasena) {
    banner.querySelector('[data-role="texto"]').textContent = 'Ingresa tu correo y contraseña para consultar tus reportes.';
    banner.classList.remove('oculto');
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  banner.classList.add('oculto');

  try {
    const url = `${CONFIG.GAS_URL}?accion=misRegistros&correo=${encodeURIComponent(correo)}&contrasena=${encodeURIComponent(contrasena)}`;
    const res = await fetch(url);
    const json = await res.json();
    
    if (!json.ok) {
      throw new Error(json.error);
    }

    const registros = json.data || [];
    lista.innerHTML = '';

    if (registros.length === 0) {
      lista.innerHTML = '<p class="ayuda" style="margin: 0; text-align: center;">No tienes reportes guardados aún con este correo.</p>';
    } else {
      // Autocompletar datos de contacto con el primer reporte encontrado
      if (registros[0].registrador) elNombre.value = registros[0].registrador;
      if (registros[0].telefono) elTelefono.value = registros[0].telefono;
      
      registros.forEach((r) => {
        const tpl = document.getElementById('plantillaReporteGuardado');
        const item = tpl.content.firstElementChild.cloneNode(true);
        item.querySelector('[data-role="texto"]').textContent = `${r.torre} — Apto ${r.apartamento}`;

        const badge = item.querySelector('[data-role="badge"]');
        badge.textContent = r.estado || 'Borrador';
        badge.style.background = r.estado === 'Completo' ? 'var(--safe-border)' : 'var(--caution-border)';
        badge.style.color = r.estado === 'Completo' ? 'var(--safe-ink)' : 'var(--caution-ink)';

        item.querySelector('[data-role="editar"]').addEventListener('click', () => cargarRegistroParaEditar(r));
        lista.appendChild(item);
      });
    }

    seccion.classList.remove('oculto');
    seccion.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    banner.querySelector('[data-role="texto"]').textContent = err.message || 'Error al conectar con el servidor.';
    banner.classList.remove('oculto');
    seccion.classList.add('oculto');
  }
}

function cargarRegistroParaEditar(r) {
  // Rellenar datos del apartamento
  elTorre.value = r.torre;
  elApartamento.value = r.apartamento;
  elTorre.disabled = true; // No permitir cambiar la clave natural del registro
  elApartamento.disabled = true;
  
  // Establecer nivel chip activo
  elNivelChips.querySelectorAll('.chip').forEach(c => c.classList.remove('activo'));
  if (r.nivel) {
    const chip = elNivelChips.querySelector(`.chip[data-nivel="${r.nivel}"]`);
    if (chip) chip.classList.add('activo');
  }
  elNivelChips.dataset.valor = r.nivel || '';
  
  elDescripcion.value = r.descripcion || '';
  
  // Rellenar evidencias existentes
  archivosExistentes = r.evidencias || [];
  numeroFilaEdicion = r.numeroFila;
  carpetaSedeId = r.urlSede ? idDriveDeEvidencia_(r) : null;
  urlSede = r.urlSede || '';

  // Reiniciar archivos nuevos seleccionados
  archivosSeleccionados = { fotos: [], videos: [], documentos: [] };
  elFotosLista.innerHTML = '';
  elVideosLista.innerHTML = '';
  elDocumentosLista.innerHTML = '';

  renderArchivosExistentes();
  actualizarEstadoBotonEnviar();

  document.getElementById('seccionApartamento').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── Borrador local (localStorage) ──────────────────────────

function serializarFormulario() {
  return {
    nombre: elNombre.value,
    correo: elCorreo.value.trim(),
    telefono: elTelefono.value.trim(),
    contrasena: elContrasena.value,
    torre: elTorre.value,
    apartamento: elApartamento.value,
    nivel: elNivelChips.dataset.valor,
    descripcion: elDescripcion.value.trim()
  };
}

function guardarBorrador() {
  if (elTorre.disabled) return; // Si está editando uno existente, no sobreescribir borrador local
  try {
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(serializarFormulario()));
  } catch (e) {}
}

function restaurarBorrador() {
  let datos;
  try {
    const raw = localStorage.getItem(CLAVE_BORRADOR);
    if (!raw) return;
    datos = JSON.parse(raw);
  } catch (e) {
    return;
  }
  if (!datos) return;

  if (datos.nombre) elNombre.value = datos.nombre;
  if (datos.correo) elCorreo.value = datos.correo;
  if (datos.telefono) elTelefono.value = datos.telefono;
  if (datos.contrasena) elContrasena.value = datos.contrasena;
  if (datos.torre) elTorre.value = datos.torre;
  if (datos.apartamento) elApartamento.value = datos.apartamento;
  
  if (datos.nivel) {
    const chip = elNivelChips.querySelector(`.chip[data-nivel="${datos.nivel}"]`);
    if (chip) {
      chip.classList.add('activo');
      elNivelChips.dataset.valor = datos.nivel;
    }
  }
  if (datos.descripcion) elDescripcion.value = datos.descripcion;

  if (datos.torre || datos.apartamento) {
    document.getElementById('avisoBorrador').classList.remove('oculto');
  }
}

// ─── Validación ──────────────────────────────────────────────

function validarFormulario() {
  if (!elNombre.value.trim()) return 'Falta ingresar tu nombre.';
  if (!elCorreo.value.trim()) return 'Falta ingresar tu correo electrónico.';
  if (!elTelefono.value.trim()) return 'Falta ingresar tu teléfono de contacto.';
  if (!elContrasena.value) return 'Debes asignar una contraseña para proteger tu reporte.';
  if (!elTorre.value) return 'Falta seleccionar la torre del apartamento.';
  if (!elApartamento.value.trim()) return 'Falta indicar el número del apartamento.';
  return null;
}

// ─── Recolección y Envío ─────────────────────────────────────

function recolectarReporte() {
  return {
    registrador: {
      nombre: elNombre.value.trim(),
      telefono: elTelefono.value.trim(),
      correo: elCorreo.value.trim(),
      contrasena: elContrasena.value
    },
    torre: elTorre.value,
    apartamento: elApartamento.value.trim(),
    nivel: elNivelChips.dataset.valor || '',
    descripcion: elDescripcion.value.trim(),
    archivos: archivosSeleccionados,
    archivosExistentes: archivosExistentes,
    numeroFila: numeroFilaEdicion
  };
}

async function procesarEnvio(reporte, onProgreso) {
  // 1. Iniciar/obtener carpeta en Drive
  const ini = await postGAS({
    accion: 'iniciarSede',
    torre: reporte.torre,
    apartamento: reporte.apartamento,
    correo: reporte.registrador.correo,
    contrasena: reporte.registrador.contrasena
  });

  const evidencias = reporte.archivosExistentes.slice();
  const totalArchivos = reporte.archivos.fotos.length + reporte.archivos.videos.length + reporte.archivos.documentos.length;
  let procesados = 0;
  let indiceFoto = evidencias.filter(e => e.tipo === 'foto').length + 1;
  let indiceVideo = evidencias.filter(e => e.tipo === 'video').length + 1;
  let indiceDoc = evidencias.filter(e => e.tipo === 'documento').length + 1;

  // 2. Subir Fotos nuevas
  for (const file of reporte.archivos.fotos) {
    const nombreBase = construirNombreBase(reporte.torre, reporte.apartamento, 'foto', indiceFoto++);
    const resultado = await subirArchivo(file, ini.data.carpetaSedeId, 'foto', nombreBase, (frac) => {
      onProgreso(`Subiendo foto ${nombreBase}… ${Math.round(frac * 100)}%`);
    });
    procesados++;
    evidencias.push(resultado);
    onProgreso(`${procesados}/${totalArchivos} archivos nuevos subidos`);
  }

  // 3. Subir Videos nuevos
  for (const file of reporte.archivos.videos) {
    const nombreBase = construirNombreBase(reporte.torre, reporte.apartamento, 'video', indiceVideo++);
    const resultado = await subirArchivo(file, ini.data.carpetaSedeId, 'video', nombreBase, (frac) => {
      onProgreso(`Subiendo video ${nombreBase}… ${Math.round(frac * 100)}%`);
    });
    procesados++;
    evidencias.push(resultado);
    onProgreso(`${procesados}/${totalArchivos} archivos nuevos subidos`);
  }

  // 4. Subir Documentos nuevos
  for (const file of reporte.archivos.documentos) {
    const nombreBase = construirNombreBase(reporte.torre, reporte.apartamento, 'documento', indiceDoc++);
    const resultado = await subirArchivo(file, ini.data.carpetaSedeId, 'documento', nombreBase, (frac) => {
      onProgreso(`Subiendo documento ${nombreBase}… ${Math.round(frac * 100)}%`);
    });
    procesados++;
    evidencias.push(resultado);
    onProgreso(`${procesados}/${totalArchivos} archivos nuevos subidos`);
  }

  // 5. Guardar fila en Sheets
  await postGAS({
    accion: 'guardarSede',
    registrador: reporte.registrador,
    torre: reporte.torre,
    apartamento: reporte.apartamento,
    nivel: reporte.nivel,
    descripcion: reporte.descripcion,
    carpetaSedeId: ini.data.carpetaSedeId,
    urlSede: ini.data.urlSede,
    evidencias
  });
}

function construirNombreBase(torre, apartamento, tipo, indice) {
  const tipoTag = tipo === 'foto' ? 'FOTO' : tipo === 'video' ? 'VIDEO' : 'DOC';
  const idx = String(indice).padStart(2, '0');
  return [
    'SISMO',
    fechaCorta_(),
    tipoTag,
    limpiarParaNombre_(torre),
    limpiarParaNombre_('Apto' + apartamento),
    idx,
  ].join('-');
}

async function enviarReporte(reporte) {
  document.getElementById('formulario').classList.add('oculto');
  document.getElementById('pantallaResultado').classList.add('oculto');
  const pantallaEnvio = document.getElementById('pantallaEnvio');
  pantallaEnvio.classList.remove('oculto');

  const listaProgreso = document.getElementById('listaProgresoSedes');
  const detalle = document.getElementById('detalleEnvio');
  const barraRelleno = document.getElementById('barraGlobalRelleno');
  listaProgreso.innerHTML = '';

  const fila = document.createElement('div');
  fila.className = 'progreso-sede-item';
  fila.innerHTML = `<span class="estado-icono">${estadoIconoMarkup('activo')}</span><span class="nombre">${reporte.torre} — Apto ${reporte.apartamento}</span>`;
  listaProgreso.appendChild(fila);

  try {
    barraRelleno.style.transform = `scaleX(0.2)`;
    await procesarEnvio(reporte, (texto) => {
      detalle.textContent = texto;
    });
    barraRelleno.style.transform = `scaleX(1)`;
    
    fila.classList.add('ok');
    fila.querySelector('.estado-icono').innerHTML = estadoIconoMarkup('ok');
    
    // Registrar localmente para deshabilitar si vuelven a recargar
    registradasSet.add(claveSede(reporte.torre, reporte.apartamento));

    mostrarResultado(reporte, null);
  } catch (err) {
    barraRelleno.style.transform = `scaleX(0)`;
    fila.classList.add('error');
    fila.querySelector('.estado-icono').innerHTML = estadoIconoMarkup('error');
    
    const mensaje = err.message || 'Error desconocido';
    const errorEl = document.createElement('div');
    errorEl.className = 'detalle-error';
    errorEl.textContent = mensaje;
    fila.appendChild(errorEl);

    mostrarResultado(reporte, mensaje);
  }
}

function mostrarResultado(reporte, errorMsg) {
  document.getElementById('pantallaEnvio').classList.add('oculto');
  document.getElementById('pantallaResultado').classList.remove('oculto');

  const icono = document.getElementById('resultadoIcono');
  const titulo = document.getElementById('resultadoTitulo');
  const detalle = document.getElementById('resultadoDetalle');
  const lista = document.getElementById('listaResultadoSedes');
  const btnReintentar = document.getElementById('btnReintentarFallidas');

  lista.innerHTML = '';
  const fila = document.createElement('div');
  
  if (!errorMsg) {
    fila.className = 'progreso-sede-item ok';
    fila.innerHTML = `<span class="estado-icono">${estadoIconoMarkup('ok')}</span><span class="nombre">${reporte.torre} — Apto ${reporte.apartamento}</span>`;
    lista.appendChild(fila);

    icono.innerHTML = `<svg viewBox="0 0 40 40"><circle class="anillo-exito" cx="20" cy="20" r="17"/><path class="marca-exito" d="M13 20.5l4.8 4.8L27.5 14.5"/></svg>`;
    titulo.textContent = '¡Reporte guardado!';
    detalle.textContent = `Se guardó correctamente la información del apartamento ${reporte.apartamento} de la ${reporte.torre}.`;
    btnReintentar.classList.add('oculto');
    try { localStorage.removeItem(CLAVE_BORRADOR); } catch (e) {}
  } else {
    fila.className = 'progreso-sede-item error';
    fila.innerHTML = `<span class="estado-icono">${estadoIconoMarkup('error')}</span><span class="nombre">${reporte.torre} — Apto ${reporte.apartamento}</span>`;
    const errorEl = document.createElement('div');
    errorEl.className = 'detalle-error';
    errorEl.textContent = errorMsg;
    fila.appendChild(errorEl);
    lista.appendChild(fila);

    icono.innerHTML = `<svg viewBox="0 0 40 40"><path class="anillo-alerta" d="M20 5 36 33H4Z" stroke-linejoin="round"/><path class="marca-alerta" d="M20 16v8"/><circle class="marca-alerta" cx="20" cy="27" r="1" fill="currentColor"/></svg>`;
    titulo.textContent = 'No se pudo guardar el reporte';
    detalle.textContent = `Falló el envío de datos. Revisa las indicaciones o tu conexión e intenta de nuevo.`;
    btnReintentar.classList.remove('oculto');
    window._reporteFallido = reporte;
  }
}

function actualizarEstadoBotonEnviar() {
  const tieneTorre = elTorre.value !== '';
  const tieneApto = elApartamento.value.trim() !== '';
  document.getElementById('btnEnviar').disabled = !(tieneTorre && tieneApto);
}

// ─── Inicialización ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  elNombre = document.getElementById('registradorNombre');
  elCorreo = document.getElementById('registradorCorreo');
  elTelefono = document.getElementById('registradorTelefono');
  elContrasena = document.getElementById('registradorContrasena');
  
  elTorre = document.getElementById('torre');
  elApartamento = document.getElementById('apartamento');
  elNivelChips = document.getElementById('nivelChips');
  elDescripcion = document.getElementById('descripcion');
  
  elFotosInput = document.getElementById('fotosInput');
  elVideosInput = document.getElementById('videosInput');
  elDocumentosInput = document.getElementById('documentosInput');
  
  elFotosLista = document.getElementById('fotosLista');
  elVideosLista = document.getElementById('videosLista');
  elDocumentosLista = document.getElementById('documentosLista');

  // Guardar borradores automáticamente
  [elNombre, elCorreo, elTelefono, elContrasena].forEach(el => {
    el.addEventListener('input', debounce(guardarBorrador, 400));
  });

  elTorre.addEventListener('change', () => {
    // Validar si el apto ya se agregó
    const clave = claveSede(elTorre.value, elApartamento.value);
    if (registradasSet.has(clave) && !elTorre.disabled) {
      alert(`El apartamento ${elApartamento.value} de la ${elTorre.value} ya cuenta con un reporte registrado en el sistema. Puedes consultarlo o editarlo ingresando tu contraseña en la sección de datos personales.`);
      elTorre.value = '';
    }
    actualizarEstadoBotonEnviar();
    guardarBorrador();
  });

  elApartamento.addEventListener('input', debounce(() => {
    const clave = claveSede(elTorre.value, elApartamento.value);
    if (registradasSet.has(clave) && !elTorre.disabled) {
      alert(`El apartamento ${elApartamento.value} de la ${elTorre.value} ya cuenta con un reporte registrado en el sistema.`);
      elApartamento.value = '';
    }
    actualizarEstadoBotonEnviar();
    guardarBorrador();
  }, 500));

  // Event listener en chips
  elNivelChips.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.chip');
    if (!btn) return;
    elNivelChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('activo'));
    btn.classList.add('activo');
    elNivelChips.dataset.valor = btn.dataset.nivel;
    guardarBorrador();
  });

  elDescripcion.addEventListener('input', debounce(guardarBorrador, 400));

  // Adjuntar archivos
  elFotosInput.addEventListener('change', () => {
    Array.from(elFotosInput.files).forEach((file) => agregarArchivo('foto', file, elFotosLista));
    elFotosInput.value = '';
  });

  elVideosInput.addEventListener('change', () => {
    Array.from(elVideosInput.files).forEach((file) => agregarArchivo('video', file, elVideosLista));
    elVideosInput.value = '';
  });

  elDocumentosInput.addEventListener('change', () => {
    Array.from(elDocumentosInput.files).forEach((file) => agregarArchivo('documento', file, elDocumentosLista));
    elDocumentosInput.value = '';
  });

  // Botón Consultar Reportes Guardados
  document.getElementById('btnConsultarReportes').addEventListener('click', cargarMisReportes);

  // Botón Enviar
  document.getElementById('btnEnviar').addEventListener('click', () => {
    const error = validarFormulario();
    const banner = document.getElementById('mensajeError');
    if (error) {
      banner.querySelector('[data-role="texto"]').textContent = error;
      banner.classList.remove('oculto');
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    banner.classList.add('oculto');

    const reporte = recolectarReporte();
    
    // Alerta de envío sin evidencias
    const nuevas = reporte.archivos.fotos.length + reporte.archivos.videos.length + reporte.archivos.documentos.length;
    const totalEvidencias = nuevas + reporte.archivosExistentes.length;
    if (totalEvidencias === 0) {
      const confirmado = window.confirm(
        'No has adjuntado ninguna foto, video o documento de evidencia.\n\n' +
        'El reporte se guardará como borrador y podrás completarlo después. ¿Continuar?'
      );
      if (!confirmado) return;
    }

    enviarReporte(reporte);
  });

  document.getElementById('btnReintentarFallidas').addEventListener('click', () => {
    const fallido = window._reporteFallido;
    if (fallido) enviarReporte(fallido);
  });

  document.getElementById('btnNuevoReporte').addEventListener('click', () => {
    location.reload();
  });

  document.querySelectorAll('[data-role="modal-cerrar"]').forEach((el) => {
    el.addEventListener('click', cerrarPrevia);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') cerrarPrevia();
  });

  cargarCatalogos();
});
