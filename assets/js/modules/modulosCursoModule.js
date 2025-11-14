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

export const modulosCursoModule = {
  state: {
    currentUser: null,
    cursos: [],
    modulos: [],
    filters: {
      query: "",
      cursoId: "todos"
    },
    editingModulo: null,
    isProcessing: false
  },
  selectors: {
    newModuloButton: null,
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
    nombreInput: null,
    descripcionInput: null,
    ordenInput: null,
    activoCheckbox: null,
    cursoSelect: null
  },

  async init(currentUser = null) {
    this.state = {
      currentUser: currentUser ?? null,
      cursos: [],
      modulos: [],
      filters: {
        query: "",
        cursoId: "todos"
      },
      editingModulo: null,
      isProcessing: false
    };

    this.selectors = {
      newModuloButton: document.querySelector("#btn-new-modulo"),
      dialog: document.querySelector("#modulo-curso-dialog"),
      dialogTitle: document.querySelector("#modulo-curso-dialog-title"),
      dialogClose: document.querySelector("#modulo-curso-dialog-close"),
      dialogCancel: document.querySelector("#modulo-curso-dialog-cancel"),
      dialogHint: document.querySelector("#modulo-curso-dialog-hint"),
      form: document.querySelector("#modulo-curso-form"),
      tableBody: document.querySelector("#modulos-curso-table-body"),
      summary: document.querySelector("#modulos-curso-summary"),
      searchInput: document.querySelector("#search-modulo"),
      cursoFilter: document.querySelector("#filter-modulo-curso"),
      nombreInput: document.querySelector("#modulo-curso-nombre"),
      descripcionInput: document.querySelector("#modulo-curso-descripcion"),
      ordenInput: document.querySelector("#modulo-curso-orden"),
      activoCheckbox: document.querySelector("#modulo-curso-activo"),
      cursoSelect: document.querySelector("#modulo-curso-curso")
    };

    if (!this.selectors.form || !this.selectors.tableBody) {
      return;
    }

    this.bindEvents();
    await this.loadCursos();
    await this.loadModulos();
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
        this.renderCursoSelects();
        return;
      }

      this.state.cursos = data ?? [];
      this.renderCursoSelects();
    } catch (error) {
      console.error("Error inesperado al cargar cursos", error);
      this.state.cursos = [];
      this.renderCursoSelects();
    }
  },

  async loadModulos() {
    if (this.selectors.tableBody) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">Cargando módulos…</td></tr>`;
    }

    try {
      let query = supabaseDb
        .from("modulos_curso")
        .select(
          `id,curso_id,nombre,descripcion,orden,activo,created_at,
          cursos:curso_id(id,nombre)`
        )
        .order("orden", { ascending: true });

      if (this.state.filters.cursoId && this.state.filters.cursoId !== "todos") {
        query = query.eq("curso_id", this.state.filters.cursoId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error al cargar módulos del curso", error);
        if (this.selectors.tableBody) {
          this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">No se pudieron cargar los módulos del curso.</td></tr>`;
        }
        if (this.selectors.summary) this.selectors.summary.textContent = "";
        return;
      }

      this.state.modulos = data ?? [];
      this.renderModulos();
    } catch (error) {
      console.error("Error inesperado al cargar módulos del curso", error);
      if (this.selectors.tableBody) {
        this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">Ocurrió un error inesperado al cargar los módulos.</td></tr>`;
      }
      if (this.selectors.summary) this.selectors.summary.textContent = "";
    }
  },

  renderModulos() {
    if (!this.selectors.tableBody) return;

    const query = this.state.filters.query.trim().toLowerCase();

    const filtered = (this.state.modulos ?? []).filter((modulo) => {
      const nombre = (modulo.nombre ?? "").toLowerCase();
      const descripcion = (modulo.descripcion ?? "").toLowerCase();
      const curso = (modulo.cursos?.nombre ?? this.getCursoNombre(modulo.curso_id) ?? "").toLowerCase();
      if (!query) return true;
      return nombre.includes(query) || descripcion.includes(query) || curso.includes(query);
    });

    if (!filtered.length) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">No hay módulos que coincidan con la búsqueda seleccionada.</td></tr>`;
      if (this.selectors.summary) this.selectors.summary.textContent = "0 módulo(s) listados";
      return;
    }

    const rows = filtered
      .map((modulo) => {
        const status = modulo.activo
          ? { label: "Activo", className: "badge badge--success" }
          : { label: "Inactivo", className: "badge badge--danger" };
        const cursoNombre = modulo.cursos?.nombre ?? this.getCursoNombre(modulo.curso_id);
        const descripcion = modulo.descripcion ? escapeHtml(modulo.descripcion) : "Sin descripción";

        return `<tr data-modulo-id="${modulo.id}">
          <td>
            <div class="table__primary">${escapeHtml(modulo.nombre ?? "Sin nombre")}</div>
            <div class="table__meta">${escapeHtml(cursoNombre ?? "Sin curso")}</div>
            <div class="table__meta">${descripcion}</div>
          </td>
          <td>${Number.isFinite(modulo.orden) ? modulo.orden : "-"}</td>
          <td><span class="${status.className}">${status.label}</span></td>
          <td>
            <div class="table__actions">
              <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
              <button class="btn btn--ghost" data-action="toggle" type="button">${modulo.activo ? "Desactivar" : "Activar"}</button>
              <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    this.selectors.tableBody.innerHTML = rows;
    if (this.selectors.summary) {
      this.selectors.summary.textContent = `${filtered.length} módulo(s) listados`;
    }
  },

  openDialog(data = null) {
    if (!this.selectors.dialog) return;

    this.state.editingModulo = data;
    this.setDialogHint("");
    this.setDialogProcessing(false);
    this.selectors.form?.reset();

    if (this.selectors.dialogTitle) {
      this.selectors.dialogTitle.textContent = data ? "Editar módulo" : "Nuevo módulo";
    }

    if (this.selectors.cursoSelect) {
      const value = data?.curso_id ?? "";
      this.selectors.cursoSelect.value = value && this.hasCursoOption(value) ? value : "";
    }

    if (data) {
      if (this.selectors.nombreInput) this.selectors.nombreInput.value = data.nombre ?? "";
      if (this.selectors.descripcionInput) this.selectors.descripcionInput.value = data.descripcion ?? "";
      if (this.selectors.ordenInput) this.selectors.ordenInput.value = Number.isFinite(data.orden) ? String(data.orden) : "";
      if (this.selectors.activoCheckbox) this.selectors.activoCheckbox.checked = Boolean(data.activo);
    } else if (this.selectors.activoCheckbox) {
      this.selectors.activoCheckbox.checked = true;
    }

    this.selectors.dialog.showModal();
  },

  closeDialog() {
    this.selectors.dialog?.close();
    this.setDialogHint("");
    this.state.editingModulo = null;
    this.setDialogProcessing(false);
  },

  async createModulo(payload) {
    try {
      const insertPayload = { ...payload };
      insertPayload.id = crypto.randomUUID();
      insertPayload.descripcion = insertPayload.descripcion || null;
      insertPayload.orden = Number.isFinite(insertPayload.orden) ? insertPayload.orden : 0;
      insertPayload.activo = Boolean(insertPayload.activo);
      if (this.state.currentUser?.id) {
        insertPayload.creado_por = this.state.currentUser.id;
      }

      const { error } = await supabaseDb.from("modulos_curso").insert([insertPayload]);
      if (error) {
        console.error("Error al crear módulo del curso", error);
        this.setDialogHint("No se pudo crear el módulo. Revisa la consola para más detalles.", true);
        return;
      }

      this.closeDialog();
      await this.loadModulos();
    } catch (error) {
      console.error("Error inesperado al crear módulo", error);
      this.setDialogHint("Ocurrió un error inesperado al crear el módulo.", true);
    }
  },

  async updateModulo(moduloId, payload) {
    try {
      const updatePayload = { ...payload };
      updatePayload.descripcion = updatePayload.descripcion || null;
      updatePayload.orden = Number.isFinite(updatePayload.orden) ? updatePayload.orden : 0;
      updatePayload.activo = Boolean(updatePayload.activo);

      const { error } = await supabaseDb.from("modulos_curso").update(updatePayload).eq("id", moduloId);
      if (error) {
        console.error("Error al actualizar módulo del curso", error);
        this.setDialogHint("No se pudo actualizar el módulo.", true);
        return;
      }

      this.closeDialog();
      await this.loadModulos();
    } catch (error) {
      console.error("Error inesperado al actualizar módulo", error);
      this.setDialogHint("Ocurrió un error inesperado al actualizar el módulo.", true);
    }
  },

  async deleteModulo(modulo) {
    try {
      const { error } = await supabaseDb.from("modulos_curso").delete().eq("id", modulo.id);
      if (error) {
        console.error("Error al eliminar módulo del curso", error);
        window.alert("No se pudo eliminar el módulo del curso.");
        return;
      }

      await this.loadModulos();
    } catch (error) {
      console.error("Error inesperado al eliminar módulo", error);
    }
  },

  async toggleEstado(modulo) {
    try {
      const { error } = await supabaseDb
        .from("modulos_curso")
        .update({ activo: !modulo.activo })
        .eq("id", modulo.id);
      if (error) {
        console.error("Error al cambiar estado del módulo", error);
        window.alert("No se pudo cambiar el estado del módulo.");
        return;
      }

      await this.loadModulos();
    } catch (error) {
      console.error("Error inesperado al cambiar el estado del módulo", error);
    }
  },

  bindEvents() {
    this.selectors.newModuloButton?.addEventListener("click", () => {
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

      const row = target.closest("tr[data-modulo-id]");
      const moduloId = row?.dataset.moduloId;
      if (!moduloId) return;

      const modulo = this.state.modulos.find((item) => String(item.id) === moduloId);
      if (!modulo) return;

      if (action === "edit") {
        this.openDialog(modulo);
        return;
      }

      if (action === "toggle") {
        await this.toggleEstado(modulo);
        return;
      }

      if (action === "delete") {
        const confirmDelete = window.confirm("¿Deseas eliminar este módulo? Esta acción no se puede deshacer.");
        if (!confirmDelete) return;
        await this.deleteModulo(modulo);
      }
    });

    this.selectors.searchInput?.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      this.state.filters.query = target.value;
      this.renderModulos();
    });

    this.selectors.cursoFilter?.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      this.state.filters.cursoId = target.value || "todos";
      await this.loadModulos();
    });

    this.selectors.form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!this.selectors.form || this.state.isProcessing) return;

      const formData = new FormData(this.selectors.form);
      const nombre = String(formData.get("nombre") ?? "").trim();
      const descripcion = String(formData.get("descripcion") ?? "").trim();
      const ordenValue = String(formData.get("orden") ?? "").trim();
      const cursoId = String(formData.get("curso_id") ?? "").trim();
      const orden = ordenValue ? Number.parseInt(ordenValue, 10) : NaN;
      const activo = Boolean(this.selectors.activoCheckbox?.checked);

      if (!nombre) {
        this.setDialogHint("El nombre del módulo es obligatorio.", true);
        return;
      }

      if (!cursoId) {
        this.setDialogHint("Selecciona el curso al que pertenece el módulo.", true);
        return;
      }

      if (!Number.isInteger(orden)) {
        this.setDialogHint("Define un orden numérico para el módulo.", true);
        return;
      }

      const payload = {
        nombre,
        descripcion,
        orden,
        activo,
        curso_id: cursoId
      };

      this.setDialogHint("");
      this.setDialogProcessing(true);

      if (this.state.editingModulo) {
        await this.updateModulo(this.state.editingModulo.id, payload);
      } else {
        await this.createModulo(payload);
      }

      this.setDialogProcessing(false);
    });
  },

  renderCursoSelects() {
    const cursos = this.state.cursos ?? [];

    if (this.selectors.cursoFilter) {
      const select = this.selectors.cursoFilter;
      select.innerHTML = "";
      select.append(createOption("todos", "Todos los cursos"));
      cursos.forEach((curso) => {
        const option = createOption(String(curso.id), curso.nombre ?? "Curso sin nombre");
        select.append(option);
      });

      if (cursos.length && this.state.filters.cursoId !== "todos") {
        const exists = cursos.some((curso) => String(curso.id) === this.state.filters.cursoId);
        if (!exists) {
          this.state.filters.cursoId = "todos";
        }
      }

      select.value = this.state.filters.cursoId;
    }

    if (this.selectors.cursoSelect) {
      const select = this.selectors.cursoSelect;
      select.innerHTML = "";
      select.append(createOption("", "Selecciona un curso", { disabled: true, selected: true }));
      cursos.forEach((curso) => {
        const option = createOption(String(curso.id), curso.nombre ?? "Curso sin nombre");
        select.append(option);
      });
    }
  },

  hasCursoOption(value) {
    if (!this.selectors.cursoSelect) return false;
    return Array.from(this.selectors.cursoSelect.options).some((option) => option.value === String(value));
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

export async function initializeModulosCursoModule(currentUser) {
  await modulosCursoModule.init(currentUser);
}

