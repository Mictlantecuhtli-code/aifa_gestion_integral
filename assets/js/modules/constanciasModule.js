import { supabaseDb } from "../supabaseClient.js";

const STORAGE_BUCKET = "aifa_integral";
const STORAGE_PREFIX = "constancias/";
const DEFAULT_VALIDATION_BASE = "https://aifa-certificaciones.vercel.app/validar/";

function createOption(value, label, { selected = false, disabled = false } = {}) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  option.disabled = disabled;
  return option;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

function formatScore(value) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(2)} pts`;
}

export const constanciasModule = {
  state: {},
  selectors: {},

  async init(currentUser = null) {
    this.state = {
      currentUser: currentUser ?? null,
      cursos: [],
      usuarios: [],
      constancias: [],
      pendientes: [],
      evaluaciones: [],
      intentos: [],
      isAdmin: false,
      isStudent: false,
      processing: false,
      validationBase: DEFAULT_VALIDATION_BASE,
      jsPdf: null,
      qrReady: false,
      filters: {
        cursoId: "todos",
        usuarioId: "todos",
        estado: "todos"
      }
    };

    this.resolveSelectors();
    await this.loadUserRoles();
    this.ensureMenuItems();

    if (!this.selectors.panel) return;

    await Promise.all([this.loadCursos(), this.loadUsuarios()]);
    await this.loadConstancias();
    await this.loadAprobados();
    this.renderListadoConstancias();
    this.renderPendientes();
    this.renderCatalogos();
    this.registerEventListeners();
  },

  resolveSelectors() {
    this.selectors = {
      panel: document.querySelector(".admin-module--constancias"),
      tableBody: document.querySelector("#constancias-table-body"),
      tableSummary: document.querySelector("#constancias-summary"),
      pendientesBody: document.querySelector("#constancias-pendientes-body"),
      pendientesSummary: document.querySelector("#constancias-pendientes-summary"),
      cursoFilter: document.querySelector("#constancias-filter-curso"),
      usuarioFilter: document.querySelector("#constancias-filter-usuario"),
      estadoFilter: document.querySelector("#constancias-filter-estado"),
      generarButton: document.querySelector("#btn-generar-constancia"),
      refreshPendientesButton: document.querySelector("#btn-refrescar-pendientes"),
      dialog: document.querySelector("#constancia-dialog"),
      dialogClose: document.querySelector("#constancia-dialog-close"),
      dialogTitle: document.querySelector("#constancia-dialog-title"),
      dialogContent: document.querySelector("#constancia-dialog-content"),
      dialogActions: document.querySelector("#constancia-dialog-actions"),
      aviso: document.querySelector("#constancias-aviso"),
      validationBaseInput: document.querySelector("#constancias-validation-base"),
      cursoSelect: document.querySelector("#constancias-curso"),
      usuarioSelect: document.querySelector("#constancias-usuario"),
      folioPreview: document.querySelector("#constancias-folio-preview")
    };
  },

  registerEventListeners() {
    this.selectors.generarButton?.addEventListener("click", async () => {
      const cursoId = this.selectors.cursoSelect?.value || "";
      const usuarioId = this.selectors.usuarioSelect?.value || "";
      await this.generarConstancia(cursoId, usuarioId);
    });

    this.selectors.refreshPendientesButton?.addEventListener("click", async () => {
      await this.loadAprobados();
      this.renderPendientes();
    });

    [this.selectors.cursoFilter, this.selectors.usuarioFilter, this.selectors.estadoFilter].forEach((input) => {
      input?.addEventListener("change", () => {
        this.state.filters = {
          cursoId: this.selectors.cursoFilter?.value ?? "todos",
          usuarioId: this.selectors.usuarioFilter?.value ?? "todos",
          estado: this.selectors.estadoFilter?.value ?? "todos"
        };
        this.renderListadoConstancias();
      });
    });

    this.selectors.cursoSelect?.addEventListener("change", () => {
      this.previewFolio();
    });
    this.selectors.usuarioSelect?.addEventListener("change", () => {
      this.previewFolio();
    });

    if (this.selectors.dialogClose && this.selectors.dialog) {
      this.selectors.dialogClose.addEventListener("click", () => this.selectors.dialog?.close());
    }

    if (this.selectors.validationBaseInput) {
      this.selectors.validationBaseInput.addEventListener("change", (event) => {
        const value = event.target.value?.trim();
        this.state.validationBase = value || DEFAULT_VALIDATION_BASE;
      });
    }
  },

  async loadUserRoles() {
    if (!this.state.currentUser) return;

    const { data, error } = await supabaseDb
      .from("usuarios_roles")
      .select("roles:rol_id(nombre)")
      .eq("usuario_id", this.state.currentUser.id);

    if (error) {
      console.error("Error al obtener roles del usuario", error);
      return;
    }

    const roles = (data ?? []).map((row) => row.roles?.nombre?.toLowerCase?.() ?? "");
    this.state.isAdmin = roles.includes("administrador");
    this.state.isStudent = roles.includes("alumno");
  },

  ensureMenuItems() {
    const adminMenuButton = document.querySelector(".admin-menu__button[data-module-target='constancias']");
    if (adminMenuButton) {
      adminMenuButton.removeAttribute("hidden");
    }

    const studentMenuSelectors = ["[data-student-menu]", "[data-menu='alumno']", "[data-role='alumno']", "#student-menu", "#alumno-menu"];
    const container = studentMenuSelectors
      .map((selector) => document.querySelector(selector))
      .find((element) => element instanceof HTMLElement);

    if (!container) return;

    let item = container.querySelector("li.menu-item[data-module='constanciasModule']");
    if (!item) {
      item = document.createElement("li");
      item.classList.add("menu-item");
      item.dataset.module = "constanciasModule";
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "Mis Constancias";
      link.dataset.action = "load-constancias-module";
      item.append(link);
      container.append(item);
    }

    const link = item.querySelector("a[data-action='load-constancias-module']");
    if (link && !link.dataset.bound) {
      link.dataset.bound = "true";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof window.loadModule === "function") {
          window.loadModule("constanciasModule");
        }
      });
    }

    if (!this.state.isStudent) {
      item.setAttribute("hidden", "true");
    } else {
      item.removeAttribute("hidden");
    }
  },

  async loadCursos() {
    const { data, error } = await supabaseDb
      .from("cursos")
      .select("id,nombre,activo")
      .order("nombre", { ascending: true });

    if (error) {
      console.error("Error al cargar cursos", error);
      this.state.cursos = [];
      return;
    }

    this.state.cursos = data ?? [];
  },

  async loadUsuarios() {
    if (!this.state.isAdmin) {
      this.state.usuarios = this.state.currentUser
        ? [
            {
              id: this.state.currentUser.id,
              nombre: this.state.currentUser.user_metadata?.nombre ?? "",
              apellido: this.state.currentUser.user_metadata?.apellido ?? "",
              activo: true
            }
          ]
        : [];
      return;
    }

    const { data, error } = await supabaseDb
      .from("usuarios")
      .select("id,nombre,apellido,activo")
      .order("nombre", { ascending: true });

    if (error) {
      console.error("Error al cargar usuarios", error);
      this.state.usuarios = [];
      return;
    }

    this.state.usuarios = data ?? [];
  },

  async loadConstancias() {
    let query = supabaseDb
      .from("constancias")
      .select(
        `id,usuario_id,curso_id,folio,calificacion_final,fecha_emision,url_pdf,url_validacion,created_at,
         usuarios:usuario_id(nombre,apellido),cursos:curso_id(nombre)`
      )
      .order("created_at", { ascending: false });

    if (!this.state.isAdmin && this.state.currentUser) {
      query = query.eq("usuario_id", this.state.currentUser.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error al cargar constancias", error);
      this.state.constancias = [];
      return;
    }

    this.state.constancias = data ?? [];
  },

  async loadAprobados() {
    const evaluacionesQuery = supabaseDb
      .from("evaluaciones")
      .select(
        `id,titulo,calificacion_minima,leccion_id,activo,
         lecciones:leccion_id(id,nombre,modulo_id,modulos:modulo_id(id,nombre,curso_id,cursos:curso_id(id,nombre)))`
      )
      .eq("activo", true);

    const intentosQuery = supabaseDb
      .from("evaluaciones_intentos")
      .select("id,usuario_id,evaluacion_id,calificacion,estatus,created_at")
      .order("created_at", { ascending: false });

    const [{ data: evaluaciones, error: evError }, { data: intentos, error: intError }] = await Promise.all([evaluacionesQuery, intentosQuery]);

    if (evError) console.error("Error al cargar evaluaciones", evError);
    if (intError) console.error("Error al cargar intentos", intError);

    this.state.evaluaciones = evaluaciones ?? [];
    this.state.intentos = intentos ?? [];

    const aprobados = [];
    this.state.usuarios.forEach((usuario) => {
      this.state.cursos.forEach((curso) => {
        const elegible = this.verificarElegibilidad(usuario.id, curso.id);
        if (elegible?.aprobado) {
          aprobados.push(elegible.detalle);
        }
      });
    });

    this.state.pendientes = aprobados.filter((item) => {
      return !this.state.constancias.some((c) => c.usuario_id === item.usuario_id && c.curso_id === item.curso_id);
    });
  },

  verificarElegibilidad(usuarioId, cursoId) {
    if (!usuarioId || !cursoId) return { aprobado: false };

    const evaluacionesCurso = (this.state.evaluaciones ?? []).filter(
      (eva) => String(eva.lecciones?.modulos?.curso_id ?? eva.lecciones?.modulos?.cursos?.id ?? "") === String(cursoId)
    );

    if (!evaluacionesCurso.length) {
      return { aprobado: false };
    }

    const mejores = new Map();
    (this.state.intentos ?? [])
      .filter((intent) => String(intent.usuario_id) === String(usuarioId))
      .forEach((intent) => {
        const current = mejores.get(intent.evaluacion_id);
        if (!current || (intent.calificacion ?? 0) > (current.calificacion ?? 0)) {
          mejores.set(intent.evaluacion_id, intent);
        }
      });

    const detalle = {
      usuario_id: usuarioId,
      curso_id: cursoId,
      mejor_calificacion: 0,
      evaluaciones: []
    };

    for (const evaluacion of evaluacionesCurso) {
      const intento = mejores.get(evaluacion.id);
      if (!intento) {
        return { aprobado: false };
      }

      const calificacion = Number(intento.calificacion ?? 0);
      detalle.evaluaciones.push({
        evaluacion_id: evaluacion.id,
        calificacion,
        calificacion_minima: Number(evaluacion.calificacion_minima ?? 0)
      });

      if (calificacion < Number(evaluacion.calificacion_minima ?? 0)) {
        return { aprobado: false };
      }
      detalle.mejor_calificacion = Math.max(detalle.mejor_calificacion, calificacion);
    }

    return { aprobado: true, detalle };
  },

  renderCatalogos() {
    const cursoOptions = [createOption("todos", "Todos los cursos", { selected: this.state.filters.cursoId === "todos" })];
    const usuarioOptions = [createOption("todos", "Todos los usuarios", { selected: this.state.filters.usuarioId === "todos" })];
    const cursosActivos = (this.state.cursos ?? []).filter((curso) => curso.activo || this.state.isAdmin);

    cursosActivos.forEach((curso) => {
      cursoOptions.push(createOption(String(curso.id), curso.nombre ?? "Curso sin nombre", { selected: this.state.filters.cursoId === String(curso.id) }));
    });

    (this.state.usuarios ?? []).forEach((usuario) => {
      const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(" ") || "Usuario sin nombre";
      usuarioOptions.push(createOption(String(usuario.id), nombre, { selected: this.state.filters.usuarioId === String(usuario.id) }));
    });

    const cursoInputs = [this.selectors.cursoFilter, this.selectors.cursoSelect];
    cursoInputs.forEach((select) => {
      if (!select) return;
      select.innerHTML = "";
      cursoOptions.forEach((option) => select.append(option.cloneNode(true)));
      if (select === this.selectors.cursoSelect) {
        select.prepend(createOption("", "Selecciona un curso", { disabled: true, selected: !select.value || select.value === "" }));
      }
    });

    const usuarioInputs = [this.selectors.usuarioFilter, this.selectors.usuarioSelect];
    usuarioInputs.forEach((select) => {
      if (!select) return;
      select.innerHTML = "";
      usuarioOptions.forEach((option) => select.append(option.cloneNode(true)));
      if (select === this.selectors.usuarioSelect) {
        select.prepend(createOption("", this.state.isAdmin ? "Selecciona un usuario" : "Tú mismo", { disabled: true, selected: !select.value || select.value === "" }));
      }
    });

    this.previewFolio();
  },

  previewFolio() {
    if (!this.selectors.folioPreview) return;
    const cursoId = this.selectors.cursoSelect?.value;
    const usuarioId = this.selectors.usuarioSelect?.value;
    if (!cursoId || !usuarioId) {
      this.selectors.folioPreview.textContent = "Selecciona curso y usuario para generar folio";
      return;
    }
    this.selectors.folioPreview.textContent = this.generarFolio(cursoId, usuarioId);
  },

  renderListadoConstancias() {
    if (!this.selectors.tableBody) return;

    const filtered = (this.state.constancias ?? []).filter((row) => {
      const matchCurso =
        !this.state.filters.cursoId ||
        this.state.filters.cursoId === "todos" ||
        String(row.curso_id) === String(this.state.filters.cursoId);
      const matchUsuario =
        !this.state.filters.usuarioId ||
        this.state.filters.usuarioId === "todos" ||
        String(row.usuario_id) === String(this.state.filters.usuarioId);
      const matchEstado = this.state.filters.estado === "todos" || Boolean(row.url_pdf) === (this.state.filters.estado === "emitidas");
      return matchCurso && matchUsuario && matchEstado;
    });

    if (!filtered.length) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="6" class="table__empty">No hay constancias registradas.</td></tr>`;
      if (this.selectors.tableSummary) this.selectors.tableSummary.textContent = "";
      return;
    }

    this.selectors.tableBody.innerHTML = filtered
      .map((row) => {
        const alumno = [row.usuarios?.nombre, row.usuarios?.apellido].filter(Boolean).join(" ") || "Usuario";
        const curso = row.cursos?.nombre ?? "Curso";
        const fecha = formatDate(row.fecha_emision ?? row.created_at);
        const estado = row.url_pdf
          ? '<span class="badge badge--success">Emitida</span>'
          : '<span class="badge badge--warning">Pendiente</span>';
        const acciones = [
          row.url_pdf ? `<a class="btn btn--ghost" href="${row.url_pdf}" target="_blank" rel="noreferrer">Descargar</a>` : "",
          `<button class="btn btn--ghost" data-action="ver" data-id="${row.id}" type="button">Detalle</button>`
        ]
          .filter(Boolean)
          .join("");

        return `<tr data-id="${row.id}">
          <td>
            <div class="table__primary">${escapeHtml(alumno)}</div>
            <div class="table__meta">${escapeHtml(row.folio)}</div>
          </td>
          <td>${escapeHtml(curso)}</td>
          <td>${formatScore(Number(row.calificacion_final))}</td>
          <td>${fecha}</td>
          <td>${estado}</td>
          <td><div class="table__actions">${acciones}</div></td>
        </tr>`;
      })
      .join("");

    if (this.selectors.tableSummary) {
      this.selectors.tableSummary.textContent = `${filtered.length} constancia(s) mostradas`;
    }

    this.selectors.tableBody.querySelectorAll("[data-action='ver']").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const constancia = this.state.constancias.find((item) => String(item.id) === String(id));
        if (constancia) this.mostrarConstancia(constancia);
      });
    });
  },

  renderPendientes() {
    if (!this.selectors.pendientesBody) return;

    if (!this.state.pendientes.length) {
      this.selectors.pendientesBody.innerHTML = `<tr><td colspan="4" class="table__empty">No hay constancias pendientes.</td></tr>`;
      if (this.selectors.pendientesSummary) this.selectors.pendientesSummary.textContent = "";
      return;
    }

    this.selectors.pendientesBody.innerHTML = this.state.pendientes
      .map((row) => {
        const alumno = this.getUsuarioNombre(row.usuario_id);
        const curso = this.getCursoNombre(row.curso_id);
        return `<tr data-usuario="${row.usuario_id}" data-curso="${row.curso_id}">
          <td>${escapeHtml(alumno)}</td>
          <td>${escapeHtml(curso)}</td>
          <td>${formatScore(row.mejor_calificacion)}</td>
          <td><button class="btn btn--ghost" data-action="emitir" type="button">Emitir</button></td>
        </tr>`;
      })
      .join("");

    if (this.selectors.pendientesSummary) {
      this.selectors.pendientesSummary.textContent = `${this.state.pendientes.length} pendiente(s) de emisión`;
    }

    this.selectors.pendientesBody.querySelectorAll("[data-action='emitir']").forEach((button) => {
      button.addEventListener("click", async () => {
        const row = button.closest("tr[data-usuario][data-curso]");
        if (!row) return;
        const usuarioId = row.dataset.usuario;
        const cursoId = row.dataset.curso;
        await this.generarConstancia(cursoId, usuarioId);
      });
    });
  },

  getUsuarioNombre(usuarioId) {
    const usuario = (this.state.usuarios ?? []).find((u) => String(u.id) === String(usuarioId));
    return [usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ") || "Usuario";
  },

  getCursoNombre(cursoId) {
    const curso = (this.state.cursos ?? []).find((c) => String(c.id) === String(cursoId));
    return curso?.nombre ?? "Curso";
  },

  async generarConstancia(cursoId, usuarioId) {
    if (!cursoId || !usuarioId) {
      window.alert("Selecciona curso y usuario para generar una constancia.");
      return;
    }

    if (this.state.processing) return;
    this.state.processing = true;
    this.setAviso("Generando constancia, por favor espere…");

    try {
      const elegible = this.verificarElegibilidad(usuarioId, cursoId);
      if (!elegible.aprobado) {
        this.setAviso("El usuario aún no cumple con los requisitos.", true);
        this.state.processing = false;
        return;
      }

      if (this.state.constancias.some((c) => c.usuario_id === usuarioId && c.curso_id === cursoId)) {
        this.setAviso("Ya existe una constancia para este curso y usuario.", true);
        this.state.processing = false;
        return;
      }

      const folio = this.generarFolio(cursoId, usuarioId);
      const urlValidacion = `${this.state.validationBase}${folio}`;
      const cursoNombre = this.getCursoNombre(cursoId);
      const alumnoNombre = this.getUsuarioNombre(usuarioId);
      const calificacionFinal = elegible.detalle.mejor_calificacion ?? 0;

      const pdfBlob = await this.generarPDF({
        folio,
        curso: cursoNombre,
        alumno: alumnoNombre,
        calificacion: calificacionFinal,
        fecha: new Date(),
        urlValidacion
      });

      const url_pdf = await this.subirPDF(folio, pdfBlob);
      const registro = await this.registrarConstancia({
        usuario_id: usuarioId,
        curso_id: cursoId,
        folio,
        calificacion_final: calificacionFinal,
        url_pdf,
        url_validacion: urlValidacion
      });

      if (registro) {
        this.state.constancias.unshift(registro);
        this.renderListadoConstancias();
        await this.loadAprobados();
        this.renderPendientes();
        this.setAviso("Constancia generada correctamente.");
        if (url_pdf) window.open(url_pdf, "_blank");
      }
    } catch (error) {
      console.error("Error al generar constancia", error);
      this.setAviso("No se pudo generar la constancia. Consulte la consola para más detalles.", true);
    }

    this.state.processing = false;
  },

  setAviso(message, isError = false) {
    if (!this.selectors.aviso) return;
    this.selectors.aviso.textContent = message ?? "";
    this.selectors.aviso.classList.toggle("text-danger", Boolean(isError));
  },

  generarFolio(cursoId, usuarioId) {
    const fecha = new Date();
    const ymd = `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, "0")}${String(fecha.getDate()).padStart(2, "0")}`;
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const cursoSlug = String(cursoId).slice(0, 6).toUpperCase();
    const userSlug = String(usuarioId).slice(0, 6).toUpperCase();
    return `AIFA-${ymd}-${cursoSlug}-${userSlug}-${random}`;
  },

  async generarQR(url) {
    if (this.state.qrReady && window.QRious) {
      const qr = new window.QRious({ value: url, size: 180, level: "M" });
      return qr.toDataURL();
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.append(script);
    });

    this.state.qrReady = true;
    return this.generarQR(url);
  },

  async ensureJsPdf() {
    if (this.state.jsPdf) return this.state.jsPdf;
    const module = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js");
    this.state.jsPdf = module.jsPDF;
    return this.state.jsPdf;
  },

  async generarPDF({ folio, curso, alumno, calificacion, fecha, urlValidacion }) {
    const jsPDF = await this.ensureJsPdf();
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    const qrDataUrl = await this.generarQR(urlValidacion);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Aeropuerto Internacional Felipe Ángeles", 40, 80);
    doc.setFontSize(14);
    doc.text("Sistema de Capacitación", 40, 105);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Se certifica que:`, 40, 150);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(alumno, 40, 180);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Ha completado satisfactoriamente el curso:`, 40, 210);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(curso, 40, 235);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Calificación final: ${calificacion.toFixed(2)} puntos`, 40, 265);
    doc.text(`Fecha de emisión: ${formatDate(fecha)}`, 40, 285);
    doc.text(`Folio: ${folio}`, 40, 305);
    doc.text(`Validar constancia: ${urlValidacion}`, 40, 325, { maxWidth: 400 });

    if (qrDataUrl) {
      doc.addImage(qrDataUrl, "PNG", 400, 180, 150, 150);
    }

    doc.setDrawColor(0);
    doc.line(40, 370, 250, 370);
    doc.text("Firma institucional", 60, 390);

    doc.setFontSize(10);
    doc.text(
      "Esta constancia es válida únicamente mediante la verificación del folio y el código QR en la plataforma oficial.",
      40,
      430,
      { maxWidth: 500 }
    );

    const pdfBlob = doc.output("blob");
    return pdfBlob;
  },

  async subirPDF(folio, blob) {
    if (!blob) return null;
    const filePath = `${STORAGE_PREFIX}${folio}.pdf`;

    const { error: uploadError } = await supabaseDb.storage.from(STORAGE_BUCKET).upload(filePath, blob, {
      contentType: "application/pdf",
      upsert: true
    });

    if (uploadError) {
      console.error("Error al subir PDF", uploadError);
      return null;
    }

    const {
      data: { publicUrl }
    } = supabaseDb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

    return publicUrl;
  },

  async registrarConstancia(payload) {
    const insertPayload = {
      ...payload,
      fecha_emision: new Date().toISOString(),
      creado_por: this.state.currentUser?.id ?? null
    };

    const { data, error } = await supabaseDb
      .from("constancias")
      .insert([insertPayload])
      .select(
        `id,usuario_id,curso_id,folio,calificacion_final,fecha_emision,url_pdf,url_validacion,created_at,
         usuarios:usuario_id(nombre,apellido),cursos:curso_id(nombre)`
      )
      .single();

    if (error) {
      console.error("Error al registrar constancia", error);
      return null;
    }

    return data;
  },

  mostrarConstancia(constancia) {
    if (!this.selectors.dialog || !this.selectors.dialogContent) return;

    const alumno = [constancia.usuarios?.nombre, constancia.usuarios?.apellido].filter(Boolean).join(" ") || "Usuario";
    const curso = constancia.cursos?.nombre ?? "Curso";

    this.selectors.dialogTitle.textContent = `Folio ${constancia.folio}`;
    this.selectors.dialogContent.innerHTML = `
      <p><strong>Alumno:</strong> ${escapeHtml(alumno)}</p>
      <p><strong>Curso:</strong> ${escapeHtml(curso)}</p>
      <p><strong>Calificación:</strong> ${formatScore(Number(constancia.calificacion_final))}</p>
      <p><strong>Fecha de emisión:</strong> ${formatDate(constancia.fecha_emision)}</p>
      <p><strong>URL de validación:</strong> ${escapeHtml(constancia.url_validacion ?? "")}</p>
    `;

    if (this.selectors.dialogActions) {
      this.selectors.dialogActions.innerHTML = "";
      if (constancia.url_pdf) {
        const link = document.createElement("a");
        link.href = constancia.url_pdf;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Descargar PDF";
        link.classList.add("btn", "btn--primary");
        this.selectors.dialogActions.append(link);
      }
    }

    this.selectors.dialog.showModal();
  }
};

export async function initializeConstanciasModule(currentUser) {
  await constanciasModule.init(currentUser);
}

if (typeof window !== "undefined") {
  window.constanciasModule = constanciasModule;
}
