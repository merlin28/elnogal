// ================================================
// PANEL DE CONTROL — Club Residencial El Nogal
// Trae TODOS los registros cargados de apartamentos (accion=todosLosRegistros)
// validando credenciales de administrador o coordinador, y el catálogo
// de torres (accion=catalogos). Presenta KPIs, gráficos y una tabla interactiva.
// ================================================

const NIVELES = ['Sin daños', 'Leve', 'Moderado', 'Grave', 'Inhabilitada'];
const NIVEL_SIN_CLASIFICAR = '__sin_nivel__';

let registros = [];
let catalogos = null;
let orden = { campo: 'timestamp', dir: 'desc' };
let credencialesAdmin = null; // { correo, contrasena }

function iconoSvg(id) {
  return `<svg class="icono-svg" aria-hidden="true"><use href="#${id}"></use></svg>`;
}

function escaparHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

// ─── Carga y Autenticación ───────────────────────────────────

async function cargarTodo() {
  if (!credencialesAdmin) return;
  try {
    await cargarTodoConCredenciales(credencialesAdmin.correo, credencialesAdmin.contrasena);
  } catch (err) {
    // Si falla la recarga (ej. pérdida de conexión), el panel error se muestra
  }
}

async function cargarTodoConCredenciales(correo, contrasena) {
  document.getElementById('panelCargando').classList.remove('oculto');
  document.getElementById('panelError').classList.add('oculto');
  document.getElementById('panelContenido').classList.add('oculto');

  try {
    const urlRegistros = `${CONFIG.GAS_URL}?accion=todosLosRegistros&correo=${encodeURIComponent(correo)}&contrasena=${encodeURIComponent(contrasena)}`;
    const urlCatalogos = `${CONFIG.GAS_URL}?accion=catalogos`;

    const [resReg, resCat] = await Promise.all([
      fetch(urlRegistros).then((r) => r.json()),
      fetch(urlCatalogos).then((r) => r.json()),
    ]);

    if (!resReg.ok) throw new Error(resReg.error);
    if (!resCat.ok) throw new Error(resCat.error);

    catalogos = resCat.data;
    registros = resReg.data.map(prepararFila);
    credencialesAdmin = { correo, contrasena }; // Guardar credenciales válidas

    poblarFiltros();
    renderizarTodo();

    document.getElementById('panelActualizado').textContent =
      'Actualizado ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('panelCargando').classList.add('oculto');
    document.getElementById('panelContenido').classList.remove('oculto');
  } catch (err) {
    document.getElementById('panelCargando').classList.add('oculto');
    document.getElementById('panelError').classList.remove('oculto');
    throw err;
  }
}

function prepararFila(r) {
  const nivelValido = NIVELES.indexOf(r.nivel) !== -1;
  return {
    ...r,
    nivelClave: nivelValido ? r.nivel : NIVEL_SIN_CLASIFICAR,
    nivelOrden: nivelValido ? NIVELES.indexOf(r.nivel) : NIVELES.length,
    totalEvidencias: (r.evidencias || []).length,
  };
}

function poblarFiltros() {
  const selTorre = document.getElementById('filtroTorre');
  const valorSeleccionado = selTorre.value;

  selTorre.innerHTML = '<option value="">Todas las torres</option>';
  if (catalogos && catalogos.torres) {
    catalogos.torres.forEach((t) => selTorre.add(new Option(t, t)));
  }
  
  if (valorSeleccionado && Array.from(selTorre.options).some(o => o.value === valorSeleccionado)) {
    selTorre.value = valorSeleccionado;
  }
}

// ─── Filtrado y Ordenamiento ─────────────────────────────────

function obtenerFiltrados() {
  const texto = document.getElementById('filtroTexto').value.trim().toLowerCase();
  const torre = document.getElementById('filtroTorre').value;
  const nivel = document.getElementById('filtroNivel').value;
  const estado = document.getElementById('filtroEstado').value;

  let lista = registros.filter((r) => {
    if (torre && r.torre !== torre) return false;
    if (nivel && r.nivelClave !== nivel) return false;
    if (estado && r.estado !== estado) return false;
    if (texto) {
      const haystack = `${r.torre} ${r.apartamento} ${r.registrador} ${r.telefono} ${r.correo} ${r.descripcion || ''}`.toLowerCase();
      if (!haystack.includes(texto)) return false;
    }
    return true;
  });

  lista.sort((a, b) => {
    const va = a[orden.campo];
    const vb = b[orden.campo];
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va || '').localeCompare(String(vb || ''), 'es');
    return orden.dir === 'asc' ? cmp : -cmp;
  });

  return lista;
}

function renderizarTodo() {
  const filtrados = obtenerFiltrados();
  renderKpis(filtrados);
  renderGraficoNivel(filtrados);
  renderGraficoTorre(filtrados);
  renderTabla(filtrados);
  requestAnimationFrame(igualarAlturaGraficos);
}

function igualarAlturaGraficos() {
  const nivel = document.querySelector('.grafico-nivel');
  const municipio = document.querySelector('.grafico-municipio');
  if (!nivel || !municipio) return;
  if (window.innerWidth <= 1000) {
    municipio.style.height = '';
    return;
  }
  municipio.style.height = nivel.getBoundingClientRect().height + 'px';
}

// ─── KPIs ────────────────────────────────────────────────────

function renderKpis(filtrados) {
  const total = filtrados.length;
  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiTotalSub').textContent = `${registros.length} aptos en total`;

  const completas = filtrados.filter((r) => r.estado === 'Completo').length;
  document.getElementById('kpiCompletas').textContent = completas;
  document.getElementById('kpiCompletasSub').textContent = `de ${total} reportados`;

  const totalEv = filtrados.reduce((acc, r) => acc + r.totalEvidencias, 0);
  document.getElementById('kpiEvidencias').textContent = totalEv;

  const criticas = filtrados.filter((r) => r.nivelClave === 'Grave' || r.nivelClave === 'Inhabilitada').length;
  document.getElementById('kpiCriticas').textContent = criticas;
}

// ─── Gráficos: Nivel y Torre ─────────────────────────────────

function claseNivelBg(clave) {
  const mapa = {
    'Sin daños': 'var(--nivel-sindanos)',
    Leve: 'var(--nivel-leve)',
    Moderado: 'var(--nivel-moderado)',
    Grave: 'var(--nivel-grave)',
    Inhabilitada: 'var(--nivel-inhab)',
  };
  return mapa[clave] || 'var(--nivel-ns)';
}

function renderGraficoNivel(filtrados) {
  const cont = document.getElementById('graficoNivel');
  const claves = [...NIVELES, NIVEL_SIN_CLASIFICAR];
  const conteos = claves.map((c) => filtrados.filter((r) => r.nivelClave === c).length);
  const max = Math.max(...conteos, 1);
  const nivelActivo = document.getElementById('filtroNivel').value;

  cont.innerHTML = claves
    .map((clave, i) => {
      const etiqueta = clave === NIVEL_SIN_CLASIFICAR ? 'Sin clasificar' : clave;
      const n = conteos[i];
      const pct = Math.round((n / max) * 100);
      const abierto = nivelActivo === clave;

      // Desglose: qué torres componen esta franja
      const porTorre = {};
      filtrados.forEach((r) => {
        if (r.nivelClave !== clave) return;
        porTorre[r.torre] = (porTorre[r.torre] || 0) + 1;
      });
      const detalle = Object.entries(porTorre).sort((a, b) => b[1] - a[1]);

      return `
        <div class="fila-barra-detalle-wrap${abierto ? ' abierto' : ''}" data-clave="${clave}">
          <div class="fila-barra fila-barra-click" data-role="fila-clicable">
            <span class="etiqueta-barra">${escaparHtml(etiqueta)}</span>
            <div class="pista-barra">
              <div class="segmento" style="width:${pct}%; background:${claseNivelBg(clave)};"></div>
            </div>
            <span class="valor-barra">${n}</span>
          </div>
          <div class="detalle-expandido"${abierto ? '' : ' style="display:none;"'}>
            ${
              detalle.length
                ? detalle.map(([torre, cant]) => `<div class="detalle-expandido-item"><span>${escaparHtml(torre)}</span><span>${cant} apto(s)</span></div>`).join('')
                : '<p class="detalle-expandido-vacio">Sin apartamentos en este nivel.</p>'
            }
          </div>
        </div>`;
    })
    .join('');

  cont.querySelectorAll('[data-clave]').forEach((fila) => {
    fila.querySelector('[data-role="fila-clicable"]').addEventListener('click', () => {
      const sel = document.getElementById('filtroNivel');
      sel.value = sel.value === fila.dataset.clave ? '' : fila.dataset.clave;
      renderizarTodo();
    });
  });
}

function renderGraficoTorre(filtrados) {
  const cont = document.getElementById('graficoMunicipio');
  const porTorre = {};
  
  if (catalogos && catalogos.torres) {
    catalogos.torres.forEach((t) => {
      porTorre[t] = {};
    });
  }

  filtrados.forEach((r) => {
    if (!porTorre[r.torre]) porTorre[r.torre] = {};
    porTorre[r.torre][r.nivelClave] = (porTorre[r.torre][r.nivelClave] || 0) + 1;
  });

  const filas = Object.entries(porTorre)
    .map(([torre, niveles]) => ({ torre, total: Object.values(niveles).reduce((a, b) => a + b, 0), niveles }))
    .sort((a, b) => {
      const numA = parseInt(a.torre.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.torre.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

  const max = Math.max(...filas.map((f) => f.total), 1);
  const claves = [...NIVELES, NIVEL_SIN_CLASIFICAR];
  const torreActiva = document.getElementById('filtroTorre').value;

  document.getElementById('notaMunicipios').textContent = `Muestra reportes en las 15 torres · click en torre para filtrar`;

  cont.innerHTML = filas
    .map((f) => {
      const detalle = claves.filter((c) => f.niveles[c]);
      const segmentos = detalle
        .map((c) => {
          const pctDelTotal = (f.niveles[c] / (f.total || 1)) * 100;
          const etiqueta = c === NIVEL_SIN_CLASIFICAR ? 'Sin clasificar' : c;
          return `<div class="segmento" data-tip="${etiqueta}: ${f.niveles[c]}" style="width:${pctDelTotal}%; background:${claseNivelBg(c)};"></div>`;
        })
        .join('');
      const anchoTotal = Math.round((f.total / max) * 100);
      const abierto = torreActiva === f.torre;

      return `
        <div class="fila-barra-detalle-wrap${abierto ? ' abierto' : ''}" data-clave="${escaparHtml(f.torre)}">
          <div class="fila-barra fila-barra-click" data-role="fila-clicable">
            <span class="etiqueta-barra" style="width: 80px;">${escaparHtml(f.torre)}</span>
            <div class="pista-barra" style="width:100%;">
              <div style="display:flex; width:${anchoTotal}%; height:100%;">${segmentos}</div>
            </div>
            <span class="valor-barra">${f.total}</span>
          </div>
          <div class="detalle-expandido"${abierto ? '' : ' style="display:none;"'}>
            ${
              detalle.length
                ? detalle.map((c) => `<div class="detalle-expandido-item">${placaNivel(c)}<span>${f.niveles[c]}</span></div>`).join('')
                : '<p class="detalle-expandido-vacio">Sin reportes cargados.</p>'
            }
          </div>
        </div>`;
    })
    .join('');

  cont.querySelectorAll('[data-clave]').forEach((fila) => {
    fila.querySelector('[data-role="fila-clicable"]').addEventListener('click', () => {
      const sel = document.getElementById('filtroTorre');
      sel.value = sel.value === fila.dataset.clave ? '' : fila.dataset.clave;
      renderizarTodo();
    });
  });

  const leyenda = document.createElement('div');
  leyenda.className = 'leyenda-nivel';
  leyenda.innerHTML = claves
    .map((c) => {
      const etiqueta = c === NIVEL_SIN_CLASIFICAR ? 'Sin clasificar' : c;
      return `<span class="leyenda-nivel-item"><span class="leyenda-nivel-punto" style="background:${claseNivelBg(c)};"></span>${escaparHtml(etiqueta)}</span>`;
    })
    .join('');
  cont.appendChild(leyenda);
}

// ─── Tabla de Apartamentos ───────────────────────────────────

function placaNivel(nivelClave) {
  const etiqueta = nivelClave === NIVEL_SIN_CLASIFICAR || !nivelClave ? 'Sin clasificar' : nivelClave;
  return `<span class="placa-nivel" data-nivel="${nivelClave || NIVEL_SIN_CLASIFICAR}">${escaparHtml(etiqueta)}</span>`;
}

function placaEstado(estado) {
  return `<span class="placa-estado" data-estado="${estado}">${escaparHtml(estado)}</span>`;
}

function formatearFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderTabla(filtrados) {
  const tbody = document.getElementById('tablaSedesBody');
  const vacia = document.getElementById('tablaVacia');
  document.getElementById('notaTabla').textContent = `${filtrados.length} apartamento${filtrados.length === 1 ? '' : 's'}`;

  if (filtrados.length === 0) {
    tbody.innerHTML = '';
    vacia.classList.remove('oculto');
    return;
  }
  vacia.classList.add('oculto');

  tbody.innerHTML = filtrados
    .map(
      (r, i) => `
      <tr data-idx="${i}">
        <td>${escaparHtml(r.torre)}</td>
        <td>${escaparHtml(r.apartamento)}</td>
        <td>${escaparHtml(r.registrador)}</td>
        <td>${escaparHtml(r.telefono)}</td>
        <td>${placaNivel(r.nivelClave)}</td>
        <td>${placaEstado(r.estado)}</td>
        <td><span class="contador-evidencia">${iconoSvg('icono-portapapeles')} ${r.totalEvidencias}</span></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => abrirDetalle(filtrados[Number(tr.dataset.idx)]));
  });

  window._filasFiltradasActuales = filtrados;
}

function actualizarEncabezadosOrden() {
  document.querySelectorAll('#tablaSedes thead th[data-orden]').forEach((th) => {
    const activo = th.dataset.orden === orden.campo;
    th.classList.toggle('orden-activo', activo);
    th.classList.toggle('orden-desc', activo && orden.dir === 'desc');
  });
}

// ─── Detalle del Reporte ─────────────────────────────────────

function idDriveDeEvidencia(ev) {
  if (ev.id) return ev.id;
  const m = /\/d\/([^/]+)/.exec(ev.url || '');
  return m ? m[1] : '';
}

function iconoParaTipo(tipo) {
  if (tipo === 'foto') return 'icono-camara';
  if (tipo === 'video') return 'icono-video';
  return 'icono-documento';
}

function abrirDetalle(r) {
  const panel = document.getElementById('panelDetalle');
  const cuerpo = document.getElementById('panelDetalleCuerpo');

  const evidenciasHtml = (r.evidencias || []).length
    ? `<div class="detalle-evidencias">${r.evidencias
        .map((ev) => {
          const id = idDriveDeEvidencia(ev);
          if (!id) return `<div class="detalle-evidencia-item">${iconoSvg(iconoParaTipo(ev.tipo))}</div>`;
          if (ev.tipo === 'foto' || ev.tipo === 'video') {
            return `<div class="detalle-evidencia-item" data-id="${id}" data-nombre="${escaparHtml(ev.nombre)}" data-url="${escaparHtml(ev.url || '')}" data-tipo="${ev.tipo}">
              <img src="https://drive.google.com/thumbnail?id=${id}&sz=w300" loading="lazy" alt="" />
              ${ev.tipo === 'video' ? `<span class="miniatura-play">${iconoSvg('icono-video')}</span>` : ''}
            </div>`;
          }
          return `<div class="detalle-evidencia-item" data-id="${id}" data-nombre="${escaparHtml(ev.nombre)}" data-url="${escaparHtml(ev.url || '')}" data-tipo="documento">${iconoSvg('icono-documento')}</div>`;
        })
        .join('')}</div>`
    : '<p class="detalle-sin-evidencia">Sin evidencia adjunta todavía.</p>';

  cuerpo.innerHTML = `
    <div class="detalle-titulo">${escaparHtml(r.torre)} — Apto ${escaparHtml(r.apartamento)}</div>
    <div class="detalle-sub">Conjunto Club Residencial El Nogal</div>
    <div class="detalle-placas">${placaNivel(r.nivelClave)}${placaEstado(r.estado)}</div>

    <div class="detalle-bloque">
      <h3>Propietario / Residente</h3>
      <div class="detalle-linea"><span>Nombre</span><span>${escaparHtml(r.registrador)}</span></div>
      <div class="detalle-linea"><span>Teléfono</span><span>${escaparHtml(r.telefono)}</span></div>
      <div class="detalle-linea"><span>Correo</span><span>${escaparHtml(r.correo)}</span></div>
    </div>

    ${
      r.descripcion
        ? `<div class="detalle-bloque"><h3>Descripción del daño</h3><div class="detalle-descripcion">${escaparHtml(r.descripcion)}</div></div>`
        : ''
    }

    <div class="detalle-bloque">
      <h3>Evidencias (${r.totalEvidencias})</h3>
      ${evidenciasHtml}
      ${r.urlSede ? `<a class="detalle-enlace-drive" href="${escaparHtml(r.urlSede)}" target="_blank" rel="noopener">${iconoSvg('icono-marcador')} Ver carpeta en Drive</a>` : ''}
    </div>
  `;

  cuerpo.querySelectorAll('.detalle-evidencia-item[data-id]').forEach((el) => {
    el.addEventListener('click', () => abrirPrevia(el.dataset.nombre, el.dataset.url, el.dataset.id, el.dataset.tipo));
    const img = el.querySelector('img');
    if (img) img.addEventListener('error', () => { img.replaceWith(document.createRange().createContextualFragment(iconoSvg(iconoParaTipo(el.dataset.tipo)))); }, { once: true });
  });

  panel.classList.remove('oculto');
}

function cerrarDetalle() {
  document.getElementById('panelDetalle').classList.add('oculto');
}

// ─── Previsualización de Evidencia ────────────────────────────

function etiquetaTipo(tipo) {
  if (tipo === 'foto') return 'Foto';
  if (tipo === 'video') return 'Video';
  return 'Documento';
}

function abrirPrevia(nombre, url, id, tipo) {
  const modal = document.getElementById('modalPrevia');
  modal.querySelector('[data-role="modal-nombre"]').textContent = nombre;
  modal.querySelector('[data-role="modal-tipo"]').innerHTML = `${iconoSvg(iconoParaTipo(tipo))} ${etiquetaTipo(tipo)}`;
  modal.querySelector('[data-role="modal-abrir"]').href = url || `https://drive.google.com/file/d/${id}/view`;
  modal.querySelector('[data-role="modal-cuerpo"]').innerHTML =
    `<iframe src="https://drive.google.com/file/d/${id}/preview" allow="autoplay" allowfullscreen></iframe>`;
  modal.classList.remove('oculto');
}

function cerrarPrevia() {
  const modal = document.getElementById('modalPrevia');
  modal.classList.add('oculto');
  modal.querySelector('[data-role="modal-cuerpo"]').innerHTML = '';
}

// ─── Descarga CSV ────────────────────────────────────────────

function descargarCsv() {
  const filas = window._filasFiltradasActuales || [];
  const encabezados = [
    'Fecha', 'Torre', 'Apartamento', 'Residente', 'Teléfono', 'Correo',
    'Nivel', 'Estado', 'Descripción', '# Evidencias', 'Carpeta Drive',
  ];
  const csvEscapar = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

  const lineas = [encabezados.map(csvEscapar).join(',')];
  filas.forEach((r) => {
    lineas.push(
      [
        formatearFecha(r.timestamp), r.torre, r.apartamento, r.registrador, r.telefono, r.correo,
        r.nivelClave === NIVEL_SIN_CLASIFICAR ? '' : r.nivel, r.estado,
        r.descripcion, r.totalEvidencias, r.urlSede,
      ]
        .map(csvEscapar)
        .join(',')
    );
  });

  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reportes-el-nogal-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Inicialización de Eventos ───────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  let temporizadorResize;
  window.addEventListener('resize', () => {
    clearTimeout(temporizadorResize);
    temporizadorResize = setTimeout(igualarAlturaGraficos, 150);
  });

  ['filtroTexto', 'filtroTorre', 'filtroNivel', 'filtroEstado'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderizarTodo);
  });

  document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
    document.getElementById('filtroTexto').value = '';
    document.getElementById('filtroTorre').value = '';
    document.getElementById('filtroNivel').value = '';
    document.getElementById('filtroEstado').value = '';
    renderizarTodo();
  });

  document.querySelectorAll('#tablaSedes thead th[data-orden]').forEach((th) => {
    th.addEventListener('click', () => {
      const campo = th.dataset.orden;
      if (orden.campo === campo) orden.dir = orden.dir === 'asc' ? 'desc' : 'asc';
      else orden = { campo, dir: 'asc' };
      actualizarEncabezadosOrden();
      renderizarTodo();
    });
  });
  actualizarEncabezadosOrden();

  document.getElementById('btnRefrescar').addEventListener('click', cargarTodo);
  document.getElementById('btnReintentarCarga').addEventListener('click', cargarTodo);
  document.getElementById('btnDescargarCsv').addEventListener('click', descargarCsv);

  document.querySelectorAll('[data-role="detalle-cerrar"]').forEach((el) => el.addEventListener('click', cerrarDetalle));
  document.querySelectorAll('[data-role="modal-cerrar"]').forEach((el) => el.addEventListener('click', cerrarPrevia));
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    cerrarPrevia();
    cerrarDetalle();
  });

  // Manejo del formulario de Login
  const formLogin = document.getElementById('formLogin');
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = document.getElementById('loginCorreo').value.trim();
    const contrasena = document.getElementById('loginContrasena').value;
    const errorEl = document.getElementById('loginError');
    const errorTexto = document.getElementById('loginErrorTexto');
    const btnIngresar = document.getElementById('btnLoginIngresar');

    errorEl.classList.add('oculto');
    btnIngresar.disabled = true;
    btnIngresar.textContent = 'Autenticando...';

    try {
      await cargarTodoConCredenciales(correo, contrasena);
      document.getElementById('panelLogin').classList.add('oculto');
      document.getElementById('headerAcciones').classList.remove('oculto');
    } catch (err) {
      errorTexto.textContent = err.message || 'Error de conexión o credenciales incorrectas.';
      errorEl.classList.remove('oculto');
      btnIngresar.disabled = false;
      btnIngresar.textContent = 'Ingresar al Panel';
    }
  });
});
