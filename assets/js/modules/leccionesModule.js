import { supabaseDb } from "../supabaseClient.js";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function createOption(value, label, { disabled = false, selected = false } = {}) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  option.selected = selected;
  return option;
}

export const leccionesModule = {
  state: {
    currentUser: null,
    cursos: [],
    modulos: [],
    lecciones: [],
    filters: {
      query: "",
      cursoId: "todos",
      moduloId: "todos"
    },
    editingLeccion: null,
    isProcessing: false
  },
  selectors: {
    newLeccionButton: null,
    dialog: null,
    dialogTitle: null,
    dialogClose: null,
    dialogCancel: null,
    dialogHint: null,
    form: null,
    tableBody: null,
    summary: null,
    searchInput: null,
    cursoFilter: null,
    moduloFilter: null,
    moduloSelect: null,
    nombreInput: null,
    descripcionInput: null,
    contenidoInput: null,
    ordenInput: null,
    activoCheckbox: null
  },

  async init(currentUser = null) {
    this.state = {
      currentUser: currentUser ?? null,
      cursos: [],
      modulos: [],
      lecciones: [],
      filters: {
        query: "",
        cursoId: "todos",
        moduloId: "todos"
      },
      editingLeccion: null,
      isProcessing: false
    };

    this.selectors = {
      newLeccionButton: document.querySelector("#btn-new-leccion"),
      dialog: document.querySelector("#leccion-dialog"),
      dialogTitle: document.querySelector("#leccion-dialog-title"),
      dialogClose: document.querySelector("#leccion-dialog-close"),
      dialogCancel: document.querySelector("#leccion-dialog-cancel"),
      dialogHint: document.querySelector("#leccion-dialog-hint"),
      form: document.querySelector("#leccion-form"),
      tableBody: document.querySelector("#lecciones-table-body"),
      summary: document.querySelector("#lecciones-summary"),
      searchInput: document.querySelector("#search-leccion"),
      cursoFilter: document.querySelector("#filter-leccion-curso"),
      moduloFilter: document.querySelector("#filter-leccion-modulo"),
      moduloSelect: document.querySelector("#leccion-modulo"),
      nombreInput: document.querySelector("#leccion-nombre"),
      descripcionInput: document.querySelector("#leccion-descripcion"),
      contenidoInput: document.querySelector("#leccion-contenido"),
      ordenInput: document.querySelector("#leccion-orden"),
      activoCheckbox: document.querySelector("#leccion-activo")
    };

    if (!this.selectors.form || !this.selectors.tableBody) {
      return;
    }

    this.bindEvents();
    await this.loadCursos();
    await this.loadModulos();
    await this.loadLecciones();
  },

  async loadCursos() {
    try {
      const { data, error } = await supabaseDb
        .from("cursos")
        .select("id,nombre,activo")
        .order("nombre", { ascending: true });

      if (error) {
        console.error("Error al cargar cursos", error);
        this.state.cursos = [];
        this.renderCursoFilter();
        return;
      }

      this.state.cursos = data ?? [];
      this.renderCursoFilter();
    } catch (error) {
      console.error("Error inesperado al cargar cursos", error);
      this.state.cursos = [];
      this.renderCursoFilter();
    }
  },

  async loadModulos() {
    try {
      const { data, error } = await supabaseDb
        .from("modulos_curso")
        .select("id,curso_id,nombre,descripcion,orden,activo")
        .order("orden", { ascending: true });

      if (error) {
        console.error("Error al cargar módulos", error);
        this.state.modulos = [];
        this.renderModuloFilter();
        this.populateModalModuloOptions();
        return;
      }

      this.state.modulos = data ?? [];
      this.renderModuloFilter();
      this.populateModalModuloOptions();
    } catch (error) {
      console.error("Error inesperado al cargar módulos", error);
      this.state.modulos = [];
      this.renderModuloFilter();
      this.populateModalModuloOptions();
    }
  },

  async loadLecciones() {
    if (this.selectors.tableBody) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">Cargando lecciones…</td></tr>`;
    }

    try {
      let query = supabaseDb
        .from("lecciones")
        .select(
          `id,modulo_id,nombre,descripcion,contenido_html,orden,activo,created_at,
          modulos_curso:modulo_id (id,nombre,curso_id,
            cursos:curso_id (id,nombre)
          )`
        )
        .order("orden", { ascending: true });

      const { cursoId, moduloId } = this.state.filters;

      if (moduloId && moduloId !== "todos") {
        query = query.eq("modulo_id", moduloId);
      } else if (cursoId && cursoId !== "todos") {
        const moduloIds = this.getModulosByCurso(cursoId).map((modulo) => modulo.id);
        if (!moduloIds.length) {
          this.state.lecciones = [];
          this.renderLecciones();
          return;
        }
        query = query.in("modulo_id", moduloIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error al cargar lecciones", error);
        if (this.selectors.tableBody) {
          this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">No se pudieron cargar las lecciones.</td></tr>`;
        }
        if (this.selectors.summary) this.selectors.summary.textContent = "";
        return;
      }

      this.state.lecciones = data ?? [];
      this.renderLecciones();
    } catch (error) {
      console.error("Error inesperado al cargar lecciones", error);
      if (this.selectors.tableBody) {
        this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">Ocurrió un error al cargar las lecciones.</td></tr>`;
      }
      if (this.selectors.summary) this.selectors.summary.textContent = "";
    }
  },

  renderLecciones() {
    if (!this.selectors.tableBody) return;

    const query = this.state.filters.query.trim().toLowerCase();

    const filtered = (this.state.lecciones ?? []).filter((leccion) => {
      if (!query) return true;
      const nombre = (leccion.nombre ?? "").toLowerCase();
      const descripcion = (leccion.descripcion ?? "").toLowerCase();
      const modulo = (leccion.modulos_curso?.nombre ?? this.getModuloNombre(leccion.modulo_id) ?? "").toLowerCase();
      const curso = (leccion.modulos_curso?.cursos?.nombre ?? this.getCursoNombre(leccion.modulos_curso?.curso_id) ?? "").toLowerCase();
      return nombre.includes(query) || descripcion.includes(query) || modulo.includes(query) || curso.includes(query);
    });

    if (!filtered.length) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">No hay lecciones que coincidan con la búsqueda.</td></tr>`;
      if (this.selectors.summary) this.selectors.summary.textContent = "0 lección(es) listadas";
      return;
    }

    const rows = filtered
      .map((leccion) => {
        const moduloNombre = leccion.modulos_curso?.nombre ?? this.getModuloNombre(leccion.modulo_id) ?? "Módulo sin nombre";
        const cursoNombre =
          leccion.modulos_curso?.cursos?.nombre ?? this.getCursoNombre(leccion.modulos_curso?.curso_id) ?? "Curso sin nombre";
        const descripcion = leccion.descripcion ? escapeHtml(leccion.descripcion) : "Sin descripción";
        const status = leccion.activo
          ? { label: "Activa", className: "badge badge--success" }
          : { label: "Inactiva", className: "badge badge--danger" };

        return `<tr data-leccion-id="${leccion.id}">
          <td>
            <div class="table__primary">${escapeHtml(leccion.nombre ?? "Sin nombre")}</div>
            <div class="table__meta">${escapeHtml(moduloNombre)} · ${escapeHtml(cursoNombre)}</div>
            <div class="table__meta">${descripcion}</div>
          </td>
          <td>${Number.isFinite(leccion.orden) ? leccion.orden : "-"}</td>
          <td><span class="${status.className}">${status.label}</span></td>
          <td>
            <div class="table__actions">
              <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
              <button class="btn btn--ghost" data-action="toggle" type="button">${leccion.activo ? "Desactivar" : "Activar"}</button>
              <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    this.selectors.tableBody.innerHTML = rows;
    if (this.selectors.summary) {
      this.selectors.summary.textContent = `${filtered.length} lección(es) listadas`;
    }
  },

  openDialog(data = null) {
    if (!this.selectors.dialog) return;

    this.state.editingLeccion = data;
    this.setDialogHint("");
    this.setDialogProcessing(false);
    this.selectors.form?.reset();

    if (this.selectors.dialogTitle) {
      this.selectors.dialogTitle.textContent = data ? "Editar lección" : "Nueva lección";
    }

    const preferredCursoId = data?.modulos_curso?.curso_id ?? this.getModuloById(data?.modulo_id)?.curso_id ?? null;
    const selectedModuloId = data?.modulo_id ?? null;
    this.populateModalModuloOptions(selectedModuloId, preferredCursoId);

    if (data) {
      if (this.selectors.nombreInput) this.selectors.nombreInput.value = data.nombre ?? "";
      if (this.selectors.descripcionInput) this.selectors.descripcionInput.value = data.descripcion ?? "";
      if (this.selectors.contenidoInput) this.selectors.contenidoInput.value = data.contenido_html ?? "";
      if (this.selectors.ordenInput)
        this.selectors.ordenInput.value = Number.isFinite(data.orden) ? String(data.orden) : "";
      if (this.selectors.activoCheckbox) this.selectors.activoCheckbox.checked = Boolean(data.activo);
    } else if (this.selectors.activoCheckbox) {
      this.selectors.activoCheckbox.checked = true;
    }

    this.selectors.dialog.showModal();
  },

  closeDialog() {
    this.selectors.dialog?.close();
    this.setDialogHint("");
    this.state.editingLeccion = null;
    this.setDialogProcessing(false);
  },

  async createLeccion(payload) {
    try {
      const insertPayload = { ...payload };
      insertPayload.id = crypto.randomUUID();
      insertPayload.descripcion = insertPayload.descripcion || null;
      insertPayload.contenido_html = insertPayload.contenido_html || null;
      insertPayload.orden = Number.isFinite(insertPayload.orden) ? insertPayload.orden : 0;
      insertPayload.activo = Boolean(insertPayload.activo);
      if (this.state.currentUser?.id) {
        insertPayload.creado_por = this.state.currentUser.id;
      }

      const { error } = await supabaseDb.from("lecciones").insert([insertPayload]);
      if (error) {
        console.error("Error al crear lección", error);
        this.setDialogHint("No se pudo crear la lección. Revisa la consola para más detalles.", true);
        return;
      }

      this.closeDialog();
      await this.loadLecciones();
    } catch (error) {
      console.error("Error inesperado al crear lección", error);
      this.setDialogHint("Ocurrió un error inesperado al crear la lección.", true);
    }
  },

  async updateLeccion(leccionId, payload) {
    try {
      const updatePayload = { ...payload };
      updatePayload.descripcion = updatePayload.descripcion || null;
      updatePayload.contenido_html = updatePayload.contenido_html || null;
      updatePayload.orden = Number.isFinite(updatePayload.orden) ? updatePayload.orden : 0;
      updatePayload.activo = Boolean(updatePayload.activo);

      const { error } = await supabaseDb.from("lecciones").update(updatePayload).eq("id", leccionId);
      if (error) {
        console.error("Error al actualizar lección", error);
        this.setDialogHint("No se pudo actualizar la lección.", true);
        return;
      }

      this.closeDialog();
      await this.loadLecciones();
    } catch (error) {
      console.error("Error inesperado al actualizar lección", error);
      this.setDialogHint("Ocurrió un error inesperado al actualizar la lección.", true);
    }
  },

  async deleteLeccion(leccion) {
    try {
      const { error } = await supabaseDb.from("lecciones").delete().eq("id", leccion.id);
      if (error) {
        console.error("Error al eliminar lección", error);
        window.alert("No se pudo eliminar la lección.");
        return;
      }

      await this.loadLecciones();
    } catch (error) {
      console.error("Error inesperado al eliminar lección", error);
    }
  },

  async toggleEstado(leccion) {
    try {
      const { error } = await supabaseDb
        .from("lecciones")
        .update({ activo: !leccion.activo })
        .eq("id", leccion.id);
      if (error) {
        console.error("Error al cambiar estado de la lección", error);
        window.alert("No se pudo cambiar el estado de la lección.");
        return;
      }

      await this.loadLecciones();
    } catch (error) {
      console.error("Error inesperado al cambiar el estado de la lección", error);
    }
  },

  bindEvents() {
    this.selectors.newLeccionButton?.addEventListener("click", () => {
      this.openDialog();
    });

    this.selectors.dialogClose?.addEventListener("click", () => this.closeDialog());
    this.selectors.dialogCancel?.addEventListener("click", () => this.closeDialog());

    this.selectors.dialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeDialog();
    });

    this.selectors.tableBody?.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (!action) return;

      const row = target.closest("tr[data-leccion-id]");
      const leccionId = row?.dataset.leccionId;
      if (!leccionId) return;

      const leccion = this.state.lecciones.find((item) => String(item.id) === leccionId);
      if (!leccion) return;

      if (action === "edit") {
        this.openDialog(leccion);
        return;
      }

      if (action === "toggle") {
        await this.toggleEstado(leccion);
        return;
      }

      if (action === "delete") {
        const confirmDelete = window.confirm("¿Deseas eliminar esta lección? Esta acción no se puede deshacer.");
        if (!confirmDelete) return;
        await this.deleteLeccion(leccion);
      }
    });

    this.selectors.searchInput?.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      this.state.filters.query = target.value;
      this.renderLecciones();
    });

    this.selectors.cursoFilter?.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      this.state.filters.cursoId = target.value || "todos";
      this.state.filters.moduloId = "todos";
      this.renderModuloFilter();
      this.populateModalModuloOptions();
      await this.loadLecciones();
    });

    this.selectors.moduloFilter?.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      this.state.filters.moduloId = target.value || "todos";
      await this.loadLecciones();
    });

    this.selectors.form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!this.selectors.form || this.state.isProcessing) return;

      const formData = new FormData(this.selectors.form);
      const moduloId = String(formData.get("modulo_id") ?? "").trim();
      const nombre = String(formData.get("nombre") ?? "").trim();
      const descripcion = String(formData.get("descripcion") ?? "").trim();
      const contenidoHtml = String(formData.get("contenido_html") ?? "").trim();
      const ordenValue = String(formData.get("orden") ?? "").trim();
      const orden = ordenValue ? Number.parseInt(ordenValue, 10) : NaN;
      const activo = Boolean(this.selectors.activoCheckbox?.checked);

      if (!moduloId) {
        this.setDialogHint("Selecciona el módulo al que pertenece la lección.", true);
        return;
      }

      if (!nombre) {
        this.setDialogHint("El nombre de la lección es obligatorio.", true);
        return;
      }

      if (!Number.isInteger(orden)) {
        this.setDialogHint("Define un orden numérico para la lección.", true);
        return;
      }

      const payload = {
        modulo_id: moduloId,
        nombre,
        descripcion,
        contenido_html: contenidoHtml,
        orden,
        activo
      };

      this.setDialogHint("");
      this.setDialogProcessing(true);

      if (this.state.editingLeccion) {
        await this.updateLeccion(this.state.editingLeccion.id, payload);
      } else {
        await this.createLeccion(payload);
      }

      this.setDialogProcessing(false);
    });
  },

  renderCursoFilter() {
    const cursos = this.state.cursos ?? [];
    const select = this.selectors.cursoFilter;
    if (!select) return;

    select.innerHTML = "";
    select.append(createOption("todos", "Todos los cursos"));
    cursos.forEach((curso) => {
      select.append(createOption(String(curso.id), curso.nombre ?? "Curso sin nombre"));
    });

    if (this.state.filters.cursoId !== "todos") {
      const exists = cursos.some((curso) => String(curso.id) === this.state.filters.cursoId);
      if (!exists) {
        this.state.filters.cursoId = "todos";
      }
    }

    select.value = this.state.filters.cursoId;
  },

  renderModuloFilter() {
    const select = this.selectors.moduloFilter;
    if (!select) return;

    const cursoId = this.state.filters.cursoId;
    const modulos = cursoId === "todos" ? this.state.modulos ?? [] : this.getModulosByCurso(cursoId);

    select.innerHTML = "";
    const placeholderLabel = cursoId === "todos" ? "Todos los módulos" : "Todos los módulos del curso";
    select.append(createOption("todos", placeholderLabel));

    modulos.forEach((modulo) => {
      select.append(createOption(String(modulo.id), modulo.nombre ?? "Módulo sin nombre"));
    });

    if (this.state.filters.moduloId !== "todos") {
      const exists = modulos.some((modulo) => String(modulo.id) === this.state.filters.moduloId);
      if (!exists) {
        this.state.filters.moduloId = "todos";
      }
    }

    select.value = this.state.filters.moduloId;
  },

  populateModalModuloOptions(selectedModuloId = null, preferredCursoId = null) {
    const select = this.selectors.moduloSelect;
    if (!select) return;

    const cursoId = preferredCursoId ?? (this.state.filters.cursoId !== "todos" ? this.state.filters.cursoId : "todos");
    let modulos = [];
    if (cursoId === "todos" || cursoId === null) {
      modulos = this.state.modulos ?? [];
    } else {
      modulos = this.getModulosByCurso(cursoId);
    }

    select.innerHTML = "";
    select.append(createOption("", "Selecciona un módulo", { disabled: true, selected: true }));

    modulos.forEach((modulo) => {
      select.append(createOption(String(modulo.id), modulo.nombre ?? "Módulo sin nombre"));
    });

    if (selectedModuloId && !modulos.some((modulo) => String(modulo.id) === String(selectedModuloId))) {
      const modulo = this.getModuloById(selectedModuloId);
      if (modulo) {
        select.append(createOption(String(modulo.id), modulo.nombre ?? "Módulo sin nombre"));
      }
    }

    if (selectedModuloId && this.hasModuloOption(select, selectedModuloId)) {
      select.value = String(selectedModuloId);
    }
  },

  hasModuloOption(select, value) {
    return Array.from(select.options).some((option) => option.value === String(value));
  },

  getModulosByCurso(cursoId) {
    const modulos = this.state.modulos ?? [];
    return modulos.filter((modulo) => String(modulo.curso_id) === String(cursoId));
  },

  getModuloById(id) {
    const modulos = this.state.modulos ?? [];
    return modulos.find((modulo) => String(modulo.id) === String(id)) ?? null;
  },

  getModuloNombre(id) {
    return this.getModuloById(id)?.nombre ?? null;
  },

  getCursoNombre(id) {
    const cursos = this.state.cursos ?? [];
    const match = cursos.find((curso) => String(curso.id) === String(id));
    return match?.nombre ?? null;
  },

  setDialogHint(message, isError = false) {
    if (!this.selectors.dialogHint) return;
    this.selectors.dialogHint.textContent = message;
    this.selectors.dialogHint.classList.toggle("is-error", Boolean(isError));
  },

  setDialogProcessing(isProcessing) {
    this.state.isProcessing = isProcessing;
    if (!this.selectors.form) return;
    const submitButton = this.selectors.form.querySelector("button[type='submit']");
    if (!(submitButton instanceof HTMLButtonElement)) return;
    submitButton.disabled = isProcessing;
    submitButton.textContent = isProcessing ? "Guardando…" : "Guardar";
  }
};

export async function initializeLeccionesModule(currentUser) {
  await leccionesModule.init(currentUser);
}
