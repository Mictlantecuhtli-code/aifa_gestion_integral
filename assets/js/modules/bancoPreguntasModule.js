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

export const bancoPreguntasModule = {
  state: {
    currentUser: null,
    cursos: [],
    modulos: [],
    lecciones: [],
    preguntas: [],
    filters: {
      query: "",
      cursoId: "todos",
      moduloId: "todos",
      leccionId: "todos"
    },
    editingPregunta: null,
    isProcessing: false
  },
  selectors: {
    newPreguntaButton: null,
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
    leccionFilter: null,
    cursoSelect: null,
    moduloSelect: null,
    leccionSelect: null,
    enunciadoInput: null,
    tipoSelect: null,
    opcionesField: null,
    respuestaField: null,
    opcionesInput: null,
    respuestaInput: null,
    dificultadSelect: null,
    activoCheckbox: null
  },

  async init(currentUser = null) {
    this.state = {
      currentUser: currentUser ?? null,
      cursos: [],
      modulos: [],
      lecciones: [],
      preguntas: [],
      filters: {
        query: "",
        cursoId: "todos",
        moduloId: "todos",
        leccionId: "todos"
      },
      editingPregunta: null,
      isProcessing: false
    };

    this.selectors = {
      newPreguntaButton: document.querySelector("#btn-new-pregunta"),
      dialog: document.querySelector("#banco-pregunta-dialog"),
      dialogTitle: document.querySelector("#banco-pregunta-dialog-title"),
      dialogClose: document.querySelector("#banco-pregunta-dialog-close"),
      dialogCancel: document.querySelector("#banco-pregunta-dialog-cancel"),
      dialogHint: document.querySelector("#banco-pregunta-dialog-hint"),
      form: document.querySelector("#banco-pregunta-form"),
      tableBody: document.querySelector("#banco-preguntas-table-body"),
      summary: document.querySelector("#banco-preguntas-summary"),
      searchInput: document.querySelector("#search-preguntas"),
      cursoFilter: document.querySelector("#filter-bp-curso"),
      moduloFilter: document.querySelector("#filter-bp-modulo"),
      leccionFilter: document.querySelector("#filter-bp-leccion"),
      cursoSelect: document.querySelector("#banco-pregunta-curso"),
      moduloSelect: document.querySelector("#banco-pregunta-modulo"),
      leccionSelect: document.querySelector("#banco-pregunta-leccion"),
      enunciadoInput: document.querySelector("#banco-pregunta-enunciado"),
      tipoSelect: document.querySelector("#banco-pregunta-tipo"),
      opcionesField: document.querySelector("[data-field='opciones']"),
      respuestaField: document.querySelector("[data-field='respuesta']"),
      opcionesInput: document.querySelector("#banco-pregunta-opciones"),
      respuestaInput: document.querySelector("#banco-pregunta-respuesta"),
      dificultadSelect: document.querySelector("#banco-pregunta-dificultad"),
      activoCheckbox: document.querySelector("#banco-pregunta-activo")
    };

    if (!this.selectors.form || !this.selectors.tableBody) {
      return;
    }

    this.bindEvents();
    await this.loadCursos();
    await this.loadModulos();
    await this.loadLecciones();
    await this.loadPreguntas();
  },

  async loadCursos() {
    try {
      const { data, error } = await supabaseDb.from("cursos").select("id,nombre,activo").order("nombre", { ascending: true });
      if (error) {
        console.error("Error al cargar cursos", error);
        this.state.cursos = [];
      } else {
        this.state.cursos = data ?? [];
      }

      this.renderCursoFilters();
      this.renderCursoSelect();
    } catch (error) {
      console.error("Error inesperado al cargar cursos", error);
      this.state.cursos = [];
      this.renderCursoFilters();
      this.renderCursoSelect();
    }
  },

  async loadModulos() {
    try {
      const { data, error } = await supabaseDb
        .from("modulos_curso")
        .select("id,nombre,curso_id,activo,cursos:curso_id(id,nombre)")
        .order("orden", { ascending: true });
      if (error) {
        console.error("Error al cargar módulos", error);
        this.state.modulos = [];
      } else {
        this.state.modulos = data ?? [];
      }

      this.renderModuloFilters();
      this.renderModuloSelect();
    } catch (error) {
      console.error("Error inesperado al cargar módulos", error);
      this.state.modulos = [];
      this.renderModuloFilters();
      this.renderModuloSelect();
    }
  },

  async loadLecciones() {
    try {
      const { data, error } = await supabaseDb
        .from("lecciones")
        .select("id,nombre,modulo_id,activo,modulos:modulo_id(id,nombre,curso_id,cursos:curso_id(id,nombre))")
        .order("orden", { ascending: true });
      if (error) {
        console.error("Error al cargar lecciones", error);
        this.state.lecciones = [];
      } else {
        this.state.lecciones = data ?? [];
      }

      this.renderLeccionFilters();
      this.renderLeccionSelect();
    } catch (error) {
      console.error("Error inesperado al cargar lecciones", error);
      this.state.lecciones = [];
      this.renderLeccionFilters();
      this.renderLeccionSelect();
    }
  },

  async loadPreguntas() {
    if (this.selectors.tableBody) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="5" class="table__empty">Cargando preguntas…</td></tr>`;
    }

    try {
      let query = supabaseDb
        .from("banco_preguntas")
        .select(
          `id,leccion_id,enunciado,tipo,opciones,respuesta_correcta,dificultad,activo,created_at,
          lecciones:leccion_id(id,nombre,modulo_id,modulos:modulo_id(id,nombre,curso_id,cursos:curso_id(id,nombre)))`
        )
        .order("created_at", { ascending: false });

      if (this.state.filters.leccionId && this.state.filters.leccionId !== "todos") {
        query = query.eq("leccion_id", this.state.filters.leccionId);
      } else {
        const leccionIds = this.getFilteredLeccionIds();
        if (leccionIds.length) {
          query = query.in("leccion_id", leccionIds);
        }
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error al cargar preguntas", error);
        if (this.selectors.tableBody) {
          this.selectors.tableBody.innerHTML = `<tr><td colspan="5" class="table__empty">No se pudieron cargar las preguntas.</td></tr>`;
        }
        if (this.selectors.summary) this.selectors.summary.textContent = "";
        return;
      }

      this.state.preguntas = data ?? [];
      this.renderPreguntas();
    } catch (error) {
      console.error("Error inesperado al cargar preguntas", error);
      if (this.selectors.tableBody) {
        this.selectors.tableBody.innerHTML = `<tr><td colspan="5" class="table__empty">Ocurrió un error al cargar las preguntas.</td></tr>`;
      }
      if (this.selectors.summary) this.selectors.summary.textContent = "";
    }
  },

  renderPreguntas() {
    if (!this.selectors.tableBody) return;

    const query = this.state.filters.query.trim().toLowerCase();

    const filtered = (this.state.preguntas ?? []).filter((pregunta) => {
      if (!query) return true;
      const enunciado = (pregunta.enunciado ?? "").toLowerCase();
      const leccion = pregunta.lecciones?.nombre?.toLowerCase?.() ?? "";
      const modulo = pregunta.lecciones?.modulos?.nombre?.toLowerCase?.() ?? "";
      const curso = pregunta.lecciones?.modulos?.cursos?.nombre?.toLowerCase?.() ?? "";
      return enunciado.includes(query) || leccion.includes(query) || modulo.includes(query) || curso.includes(query);
    });

    if (!filtered.length) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="5" class="table__empty">No hay preguntas que coincidan con los filtros seleccionados.</td></tr>`;
      if (this.selectors.summary) this.selectors.summary.textContent = "";
      return;
    }

    const rows = filtered
      .map((pregunta) => {
        const cursoNombre = pregunta.lecciones?.modulos?.cursos?.nombre ?? "";
        const moduloNombre = pregunta.lecciones?.modulos?.nombre ?? "";
        const leccionNombre = pregunta.lecciones?.nombre ?? "";
        const contexto = [cursoNombre, moduloNombre, leccionNombre].filter(Boolean).join(" • ");
        const statusClass = pregunta.activo ? "badge badge--success" : "badge badge--danger";
        const statusLabel = pregunta.activo ? "Activa" : "Inactiva";
        const tipoLabel = this.getTipoLabel(pregunta.tipo);
        const dificultadLabel = this.getDificultadLabel(pregunta.dificultad);

        return `<tr data-pregunta-id="${pregunta.id}">
          <td>
            <div class="table__primary">${escapeHtml(pregunta.enunciado)}</div>
            <div class="table__meta">${escapeHtml(contexto || "Sin lección asociada")}</div>
          </td>
          <td>${escapeHtml(tipoLabel)}</td>
          <td>${escapeHtml(dificultadLabel)}</td>
          <td><span class="${statusClass}">${statusLabel}</span></td>
          <td>
            <div class="table__actions">
              <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
              <button class="btn btn--ghost" data-action="toggle" type="button">${pregunta.activo ? "Desactivar" : "Activar"}</button>
              <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    this.selectors.tableBody.innerHTML = rows;
    if (this.selectors.summary) {
      this.selectors.summary.textContent = `${filtered.length} pregunta(s) listadas`;
    }
  },

  openDialog(pregunta = null) {
    if (!this.selectors.dialog) return;

    this.state.editingPregunta = pregunta;
    const isEditing = Boolean(pregunta);

    if (this.selectors.dialogTitle) {
      this.selectors.dialogTitle.textContent = isEditing ? "Editar pregunta" : "Nueva pregunta";
    }

    this.setDialogHint("");
    this.setDialogProcessing(false);

    const cursoId = isEditing ? pregunta.lecciones?.modulos?.curso_id ?? pregunta.lecciones?.modulos?.cursos?.id : this.state.filters.cursoId;
    const moduloId = isEditing ? pregunta.lecciones?.modulo_id ?? pregunta.lecciones?.modulos?.id : this.state.filters.moduloId;
    const leccionId = isEditing ? pregunta.leccion_id : this.state.filters.leccionId;

    this.setSelectValue(this.selectors.cursoSelect, cursoId && cursoId !== "todos" ? String(cursoId) : "");
    this.renderModuloSelect();
    this.setSelectValue(this.selectors.moduloSelect, moduloId && moduloId !== "todos" ? String(moduloId) : "");
    this.renderLeccionSelect();
    this.setSelectValue(this.selectors.leccionSelect, leccionId && leccionId !== "todos" ? String(leccionId) : "");

    if (this.selectors.enunciadoInput) {
      this.selectors.enunciadoInput.value = isEditing ? pregunta.enunciado ?? "" : "";
    }

    this.setSelectValue(this.selectors.tipoSelect, isEditing ? pregunta.tipo ?? "" : "");
    if (this.selectors.opcionesInput) {
      const opcionesValue = isEditing && pregunta.opciones != null ? JSON.stringify(pregunta.opciones, null, 2) : "";
      this.selectors.opcionesInput.value = opcionesValue;
    }
    if (this.selectors.respuestaInput) {
      const respuestaValue = isEditing && pregunta.respuesta_correcta != null ? JSON.stringify(pregunta.respuesta_correcta, null, 2) : "";
      this.selectors.respuestaInput.value = respuestaValue;
    }
    if (this.selectors.dificultadSelect) {
      this.selectors.dificultadSelect.value = isEditing ? String(pregunta.dificultad ?? 1) : "1";
    }
    if (this.selectors.activoCheckbox) {
      this.selectors.activoCheckbox.checked = isEditing ? Boolean(pregunta.activo) : true;
    }

    this.updateTipoFields();

    if (!this.selectors.dialog.open) {
      this.selectors.dialog.showModal();
    }
  },

  closeDialog() {
    if (!this.selectors.dialog) return;

    this.state.editingPregunta = null;
    this.setDialogProcessing(false);
    this.setDialogHint("");
    if (this.selectors.form) {
      this.selectors.form.reset();
    }
    this.updateTipoFields();
    this.selectors.dialog.close();
  },

  async createPregunta(payload) {
    try {
      const insertPayload = { ...payload };
      if (this.state.currentUser?.id) {
        insertPayload.creado_por = this.state.currentUser.id;
      }

      const { error } = await supabaseDb.from("banco_preguntas").insert([insertPayload]);
      if (error) {
        console.error("Error al crear pregunta", error);
        this.setDialogHint("No se pudo crear la pregunta. Intente nuevamente.", true);
        return;
      }

      this.closeDialog();
      await this.loadPreguntas();
    } catch (error) {
      console.error("Error inesperado al crear pregunta", error);
      this.setDialogHint("Ocurrió un error inesperado al crear la pregunta.", true);
    }
  },

  async updatePregunta(id, payload) {
    try {
      const { error } = await supabaseDb.from("banco_preguntas").update(payload).eq("id", id);
      if (error) {
        console.error("Error al actualizar pregunta", error);
        this.setDialogHint("No se pudo actualizar la pregunta.", true);
        return;
      }

      this.closeDialog();
      await this.loadPreguntas();
    } catch (error) {
      console.error("Error inesperado al actualizar pregunta", error);
      this.setDialogHint("Ocurrió un error inesperado al actualizar la pregunta.", true);
    }
  },

  async deletePregunta(pregunta) {
    try {
      const { error } = await supabaseDb.from("banco_preguntas").delete().eq("id", pregunta.id);
      if (error) {
        console.error("Error al eliminar pregunta", error);
        window.alert("No se pudo eliminar la pregunta.");
        return;
      }

      await this.loadPreguntas();
    } catch (error) {
      console.error("Error inesperado al eliminar pregunta", error);
    }
  },

  async toggleEstado(pregunta) {
    try {
      const { error } = await supabaseDb
        .from("banco_preguntas")
        .update({ activo: !pregunta.activo })
        .eq("id", pregunta.id);
      if (error) {
        console.error("Error al cambiar estado de la pregunta", error);
        window.alert("No se pudo cambiar el estado de la pregunta.");
        return;
      }

      await this.loadPreguntas();
    } catch (error) {
      console.error("Error inesperado al cambiar estado de la pregunta", error);
    }
  },

  bindEvents() {
    this.selectors.newPreguntaButton?.addEventListener("click", () => {
      this.openDialog();
    });

    this.selectors.dialogClose?.addEventListener("click", () => this.closeDialog());
    this.selectors.dialogCancel?.addEventListener("click", () => this.closeDialog());

    this.selectors.dialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeDialog();
    });

    this.selectors.form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (this.state.isProcessing) return;

      const validation = this.buildPayloadFromForm();
      if (!validation.isValid) {
        this.setDialogHint(validation.message, true);
        return;
      }

      this.setDialogHint("");
      this.setDialogProcessing(true);

      const payload = validation.payload;
      const editing = this.state.editingPregunta;

      if (editing) {
        await this.updatePregunta(editing.id, payload);
      } else {
        await this.createPregunta(payload);
      }

      this.setDialogProcessing(false);
    });

    this.selectors.searchInput?.addEventListener("input", () => {
      this.state.filters.query = this.selectors.searchInput?.value ?? "";
      this.renderPreguntas();
    });

    this.selectors.cursoFilter?.addEventListener("change", async () => {
      this.state.filters.cursoId = this.selectors.cursoFilter?.value ?? "todos";
      this.state.filters.moduloId = "todos";
      this.state.filters.leccionId = "todos";
      await this.loadModulos();
      await this.loadLecciones();
      await this.loadPreguntas();
    });

    this.selectors.moduloFilter?.addEventListener("change", async () => {
      this.state.filters.moduloId = this.selectors.moduloFilter?.value ?? "todos";
      this.state.filters.leccionId = "todos";
      await this.loadLecciones();
      await this.loadPreguntas();
    });

    this.selectors.leccionFilter?.addEventListener("change", async () => {
      this.state.filters.leccionId = this.selectors.leccionFilter?.value ?? "todos";
      await this.loadPreguntas();
    });

    this.selectors.cursoSelect?.addEventListener("change", () => {
      this.renderModuloSelect();
      this.renderLeccionSelect();
    });

    this.selectors.moduloSelect?.addEventListener("change", () => {
      this.renderLeccionSelect();
    });

    this.selectors.tipoSelect?.addEventListener("change", () => {
      this.updateTipoFields();
    });

    this.selectors.tableBody?.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const action = target.dataset.action;
      if (!action) return;

      const row = target.closest("tr[data-pregunta-id]");
      const preguntaId = row?.dataset.preguntaId;
      if (!preguntaId) return;

      const pregunta = this.state.preguntas.find((item) => String(item.id) === String(preguntaId));
      if (!pregunta) return;

      if (action === "edit") {
        this.openDialog(pregunta);
        return;
      }

      if (action === "toggle") {
        await this.toggleEstado(pregunta);
        return;
      }

      if (action === "delete") {
        const confirmDelete = window.confirm("¿Deseas eliminar esta pregunta? Esta acción no se puede deshacer.");
        if (!confirmDelete) return;
        await this.deletePregunta(pregunta);
      }
    });
  },

  buildPayloadFromForm() {
    if (!this.selectors.form) {
      return { isValid: false, message: "Formulario no disponible." };
    }

    const cursoId = this.selectors.cursoSelect?.value ?? "";
    const moduloId = this.selectors.moduloSelect?.value ?? "";
    const leccionId = this.selectors.leccionSelect?.value ?? "";
    const enunciado = this.selectors.enunciadoInput?.value.trim() ?? "";
    const tipo = this.selectors.tipoSelect?.value ?? "";
    const dificultad = this.selectors.dificultadSelect?.value ?? "1";
    const activo = this.selectors.activoCheckbox?.checked ?? false;

    if (!cursoId) {
      return { isValid: false, message: "Selecciona un curso." };
    }
    if (!moduloId) {
      return { isValid: false, message: "Selecciona un módulo." };
    }
    if (!leccionId) {
      return { isValid: false, message: "Selecciona una lección." };
    }
    if (!enunciado) {
      return { isValid: false, message: "El enunciado es obligatorio." };
    }
    if (!tipo) {
      return { isValid: false, message: "Selecciona un tipo de pregunta." };
    }

    let opcionesValue = null;
    let respuestaValue = null;

    const opcionesRaw = this.selectors.opcionesInput?.value.trim() ?? "";
    const respuestaRaw = this.selectors.respuestaInput?.value.trim() ?? "";

    if (tipo === "opcion_multiple") {
      if (!opcionesRaw) {
        return { isValid: false, message: "Ingresa las opciones de respuesta en formato JSON." };
      }
      try {
        const parsed = JSON.parse(opcionesRaw);
        if (!Array.isArray(parsed) || parsed.length < 2) {
          return { isValid: false, message: "Las opciones deben ser un arreglo con al menos dos elementos." };
        }
        opcionesValue = parsed;
      } catch (error) {
        console.error("Error al parsear opciones", error);
        return { isValid: false, message: "El formato de opciones no es válido." };
      }

      if (!respuestaRaw) {
        return { isValid: false, message: "Ingresa la respuesta correcta en formato JSON." };
      }
      try {
        respuestaValue = JSON.parse(respuestaRaw);
      } catch (error) {
        console.error("Error al parsear respuesta", error);
        return { isValid: false, message: "El formato de la respuesta correcta no es válido." };
      }
    } else {
      if (opcionesRaw) {
        try {
          opcionesValue = JSON.parse(opcionesRaw);
        } catch (error) {
          console.error("Error al parsear opciones", error);
          return { isValid: false, message: "El formato de opciones no es válido." };
        }
      }
      if (respuestaRaw) {
        try {
          respuestaValue = JSON.parse(respuestaRaw);
        } catch (error) {
          console.error("Error al parsear respuesta", error);
          return { isValid: false, message: "El formato de la respuesta correcta no es válido." };
        }
      }
    }

    return {
      isValid: true,
      payload: {
        leccion_id: leccionId,
        enunciado,
        tipo,
        opciones: opcionesValue,
        respuesta_correcta: respuestaValue,
        dificultad: Number.parseInt(dificultad, 10) || 1,
        activo
      }
    };
  },

  renderCursoFilters() {
    const select = this.selectors.cursoFilter;
    if (!select) return;

    const previousValue = this.state.filters.cursoId ?? select.value;

    select.innerHTML = "";
    select.append(createOption("todos", "Todos los cursos", { selected: previousValue === "todos" }));

    (this.state.cursos ?? []).forEach((curso) => {
      select.append(createOption(String(curso.id), curso.nombre ?? "Sin nombre", {
        selected: String(curso.id) === String(previousValue)
      }));
    });
  },

  renderModuloFilters() {
    const select = this.selectors.moduloFilter;
    if (!select) return;

    const selectedCurso = this.state.filters.cursoId;
    const modulos = (this.state.modulos ?? []).filter((modulo) => {
      if (!selectedCurso || selectedCurso === "todos") return true;
      return String(modulo.curso_id) === String(selectedCurso);
    });

    const previousValue = this.state.filters.moduloId ?? select.value;

    select.innerHTML = "";
    select.append(createOption("todos", "Todos los módulos", { selected: previousValue === "todos" }));
    modulos.forEach((modulo) => {
      select.append(
        createOption(String(modulo.id), modulo.nombre ?? "Sin nombre", {
          selected: String(modulo.id) === String(previousValue)
        })
      );
    });
  },

  renderLeccionFilters() {
    const select = this.selectors.leccionFilter;
    if (!select) return;

    const selectedCurso = this.state.filters.cursoId;
    const selectedModulo = this.state.filters.moduloId;

    const lecciones = (this.state.lecciones ?? []).filter((leccion) => {
      if (selectedModulo && selectedModulo !== "todos") {
        return String(leccion.modulo_id) === String(selectedModulo);
      }
      if (selectedCurso && selectedCurso !== "todos") {
        return String(leccion.modulos?.curso_id ?? leccion.modulos?.cursos?.id) === String(selectedCurso);
      }
      return true;
    });

    const previousValue = this.state.filters.leccionId ?? select.value;

    select.innerHTML = "";
    select.append(createOption("todos", "Todas las lecciones", { selected: previousValue === "todos" }));
    lecciones.forEach((leccion) => {
      select.append(
        createOption(String(leccion.id), leccion.nombre ?? "Sin nombre", {
          selected: String(leccion.id) === String(previousValue)
        })
      );
    });
  },

  renderCursoSelect() {
    const select = this.selectors.cursoSelect;
    if (!select) return;

    const previousValue = select.value;

    select.innerHTML = "";
    select.append(createOption("", "Selecciona un curso", { disabled: true, selected: !previousValue }));

    (this.state.cursos ?? []).forEach((curso) => {
      select.append(createOption(String(curso.id), curso.nombre ?? "Sin nombre"));
    });

    if (previousValue) {
      this.setSelectValue(select, previousValue);
    }
  },

  renderModuloSelect() {
    const select = this.selectors.moduloSelect;
    if (!select) return;

    const selectedCurso = this.selectors.cursoSelect?.value;
    const previousValue = select.value;

    select.innerHTML = "";
    select.append(createOption("", "Selecciona un módulo", { disabled: true, selected: !previousValue }));

    const modulos = (this.state.modulos ?? []).filter((modulo) => {
      if (!selectedCurso) return true;
      return String(modulo.curso_id) === String(selectedCurso);
    });

    modulos.forEach((modulo) => {
      select.append(createOption(String(modulo.id), modulo.nombre ?? "Sin nombre"));
    });

    if (previousValue) {
      this.setSelectValue(select, previousValue);
    }
  },

  renderLeccionSelect() {
    const select = this.selectors.leccionSelect;
    if (!select) return;

    const selectedModulo = this.selectors.moduloSelect?.value;
    const selectedCurso = this.selectors.cursoSelect?.value;
    const previousValue = select.value;

    select.innerHTML = "";
    select.append(createOption("", "Selecciona una lección", { disabled: true, selected: !previousValue }));

    const lecciones = (this.state.lecciones ?? []).filter((leccion) => {
      if (selectedModulo) {
        return String(leccion.modulo_id) === String(selectedModulo);
      }
      if (selectedCurso) {
        return String(leccion.modulos?.curso_id ?? leccion.modulos?.cursos?.id) === String(selectedCurso);
      }
      return true;
    });

    lecciones.forEach((leccion) => {
      select.append(createOption(String(leccion.id), leccion.nombre ?? "Sin nombre"));
    });

    if (previousValue) {
      this.setSelectValue(select, previousValue);
    }
  },

  getFilteredLeccionIds() {
    const selectedCurso = this.state.filters.cursoId;
    const selectedModulo = this.state.filters.moduloId;

    return (this.state.lecciones ?? [])
      .filter((leccion) => {
        if (this.state.filters.leccionId && this.state.filters.leccionId !== "todos") {
          return String(leccion.id) === String(this.state.filters.leccionId);
        }
        if (selectedModulo && selectedModulo !== "todos") {
          return String(leccion.modulo_id) === String(selectedModulo);
        }
        if (selectedCurso && selectedCurso !== "todos") {
          return String(leccion.modulos?.curso_id ?? leccion.modulos?.cursos?.id) === String(selectedCurso);
        }
        return true;
      })
      .map((leccion) => leccion.id);
  },

  getTipoLabel(tipo) {
    switch (tipo) {
      case "opcion_multiple":
        return "Opción múltiple";
      case "vf":
        return "Verdadero / Falso";
      case "abierta":
        return "Respuesta abierta";
      default:
        return tipo ?? "Desconocido";
    }
  },

  getDificultadLabel(valor) {
    const dificultad = Number.parseInt(valor, 10) || 1;
    if (dificultad === 1) return "1 - Fácil";
    if (dificultad === 2) return "2 - Media";
    if (dificultad === 3) return "3 - Difícil";
    return String(dificultad);
  },

  setSelectValue(select, value) {
    if (!select) return;
    const option = Array.from(select.options).find((opt) => opt.value === String(value));
    if (option) {
      select.value = option.value;
    } else {
      select.value = "";
    }
  },

  updateTipoFields() {
    const tipo = this.selectors.tipoSelect?.value ?? "";
    const showOpciones = tipo === "opcion_multiple";
    if (this.selectors.opcionesField) {
      this.selectors.opcionesField.style.display = showOpciones ? "" : "none";
    }
    if (this.selectors.respuestaField) {
      this.selectors.respuestaField.style.display = "";
    }
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

export async function initializeBancoPreguntasModule(currentUser) {
  await bancoPreguntasModule.init(currentUser);
}

