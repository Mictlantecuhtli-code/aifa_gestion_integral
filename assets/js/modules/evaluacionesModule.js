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

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const evaluacionesModule = {
  state: {
    currentUser: null,
    cursos: [],
    modulos: [],
    lecciones: [],
    evaluaciones: [],
    bancoPreguntas: [],
    filters: {
      query: "",
      cursoId: "todos",
      moduloId: "todos",
      leccionId: "todos"
    },
    editingEvaluacion: null,
    selectedEvaluacionId: null,
    isProcessing: false
  },
  selectors: {
    newEvaluacionButton: null,
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
    tituloInput: null,
    descripcionInput: null,
    instruccionesInput: null,
    preguntasInput: null,
    versionesInput: null,
    intentosInput: null,
    tiempoInput: null,
    activoCheckbox: null,
    versionesPanel: null
  },

  async init(currentUser = null) {
    this.state = {
      currentUser: currentUser ?? null,
      cursos: [],
      modulos: [],
      lecciones: [],
      evaluaciones: [],
      bancoPreguntas: [],
      filters: {
        query: "",
        cursoId: "todos",
        moduloId: "todos",
        leccionId: "todos"
      },
      editingEvaluacion: null,
      selectedEvaluacionId: null,
      isProcessing: false
    };

    this.selectors = {
      newEvaluacionButton: document.querySelector("#btn-new-evaluacion"),
      dialog: document.querySelector("#evaluacion-dialog"),
      dialogTitle: document.querySelector("#evaluacion-dialog-title"),
      dialogClose: document.querySelector("#evaluacion-dialog-close"),
      dialogCancel: document.querySelector("#evaluacion-dialog-cancel"),
      dialogHint: document.querySelector("#evaluacion-dialog-hint"),
      form: document.querySelector("#evaluacion-form"),
      tableBody: document.querySelector("#evaluaciones-table-body"),
      summary: document.querySelector("#evaluaciones-summary"),
      searchInput: document.querySelector("#search-evaluacion"),
      cursoFilter: document.querySelector("#filter-evaluacion-curso"),
      moduloFilter: document.querySelector("#filter-evaluacion-modulo"),
      leccionFilter: document.querySelector("#filter-evaluacion-leccion"),
      cursoSelect: document.querySelector("#evaluacion-curso"),
      moduloSelect: document.querySelector("#evaluacion-modulo"),
      leccionSelect: document.querySelector("#evaluacion-leccion"),
      tituloInput: document.querySelector("#evaluacion-titulo"),
      descripcionInput: document.querySelector("#evaluacion-descripcion"),
      instruccionesInput: document.querySelector("#evaluacion-instrucciones"),
      preguntasInput: document.querySelector("#evaluacion-preguntas"),
      versionesInput: document.querySelector("#evaluacion-versiones"),
      intentosInput: document.querySelector("#evaluacion-intentos"),
      tiempoInput: document.querySelector("#evaluacion-tiempo"),
      activoCheckbox: document.querySelector("#evaluacion-activo"),
      versionesPanel: document.querySelector("#evaluaciones-versiones-panel")
    };

    if (!this.selectors.form || !this.selectors.tableBody) {
      return;
    }

    this.bindEvents();
    await this.loadCursos();
    await this.loadModulos();
    await this.loadLecciones();
    await this.loadBancoPreguntas();
    await this.loadEvaluaciones();
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

  async loadBancoPreguntas() {
    try {
      const { data, error } = await supabaseDb
        .from("banco_preguntas")
        .select("id,leccion_id,activo")
        .eq("activo", true);

      if (error) {
        console.error("Error al cargar banco de preguntas", error);
        this.state.bancoPreguntas = [];
      } else {
        this.state.bancoPreguntas = data ?? [];
      }
    } catch (error) {
      console.error("Error inesperado al cargar banco de preguntas", error);
      this.state.bancoPreguntas = [];
    }
  },

  async loadEvaluaciones() {
    if (this.selectors.tableBody) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="5" class="table__empty">Cargando evaluaciones…</td></tr>`;
    }

    try {
      let query = supabaseDb
        .from("evaluaciones")
        .select(
          `id,leccion_id,titulo,descripcion,instrucciones,preguntas_por_examen,versiones,intentos_max,tiempo_limite,activo,created_at,
          lecciones:leccion_id(id,nombre,modulo_id,modulos:modulo_id(id,nombre,curso_id,cursos:curso_id(id,nombre))),
          evaluaciones_versiones(id,numero_version,preguntas)`
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
        console.error("Error al cargar evaluaciones", error);
        if (this.selectors.tableBody) {
          this.selectors.tableBody.innerHTML = `<tr><td colspan="5" class="table__empty">No se pudieron cargar las evaluaciones.</td></tr>`;
        }
        if (this.selectors.summary) this.selectors.summary.textContent = "";
        if (this.selectors.versionesPanel) {
          this.selectors.versionesPanel.innerHTML = `<p class="panel__empty">Selecciona una evaluación para ver sus versiones.</p>`;
        }
        return;
      }

      this.state.evaluaciones = (data ?? []).map((evaluacion) => ({
        ...evaluacion,
        evaluaciones_versiones: (evaluacion.evaluaciones_versiones ?? []).sort((a, b) => (a.numero_version ?? 0) - (b.numero_version ?? 0))
      }));

      if (this.state.selectedEvaluacionId) {
        const exists = this.state.evaluaciones.some((item) => String(item.id) === String(this.state.selectedEvaluacionId));
        if (!exists) {
          this.state.selectedEvaluacionId = null;
        }
      }

      this.renderEvaluaciones();
      this.renderVersiones();
    } catch (error) {
      console.error("Error inesperado al cargar evaluaciones", error);
      if (this.selectors.tableBody) {
        this.selectors.tableBody.innerHTML = `<tr><td colspan="5" class="table__empty">Ocurrió un error al cargar las evaluaciones.</td></tr>`;
      }
      if (this.selectors.summary) this.selectors.summary.textContent = "";
      if (this.selectors.versionesPanel) {
        this.selectors.versionesPanel.innerHTML = `<p class="panel__empty">Selecciona una evaluación para ver sus versiones.</p>`;
      }
    }
  },

  renderEvaluaciones() {
    if (!this.selectors.tableBody) return;

    const query = this.state.filters.query.trim().toLowerCase();

    const filtered = (this.state.evaluaciones ?? []).filter((evaluacion) => {
      if (!this.passesFilter(evaluacion)) return false;

      if (!query) return true;
      const titulo = (evaluacion.titulo ?? "").toLowerCase();
      const descripcion = (evaluacion.descripcion ?? "").toLowerCase();
      const leccion = evaluacion.lecciones?.nombre?.toLowerCase?.() ?? "";
      return titulo.includes(query) || descripcion.includes(query) || leccion.includes(query);
    });

    if (!filtered.length) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="5" class="table__empty">No hay evaluaciones que coincidan con los filtros seleccionados.</td></tr>`;
      if (this.selectors.summary) this.selectors.summary.textContent = "";
      return;
    }

    const rows = filtered
      .map((evaluacion) => {
        const cursoNombre = evaluacion.lecciones?.modulos?.cursos?.nombre ?? "";
        const moduloNombre = evaluacion.lecciones?.modulos?.nombre ?? "";
        const leccionNombre = evaluacion.lecciones?.nombre ?? "";
        const contexto = [cursoNombre, moduloNombre, leccionNombre].filter(Boolean).join(" • ");
        const statusClass = evaluacion.activo ? "badge badge--success" : "badge badge--danger";
        const statusLabel = evaluacion.activo ? "Activa" : "Inactiva";
        const bancoCount = this.getBancoCount(evaluacion.leccion_id);
        const isSelected = String(evaluacion.id) === String(this.state.selectedEvaluacionId);

        return `<tr data-evaluacion-id="${evaluacion.id}"${isSelected ? " aria-selected=\"true\"" : ""}>
          <td>
            <div class="table__primary">${escapeHtml(evaluacion.titulo ?? "Sin título")}</div>
            <div class="table__meta">${escapeHtml(contexto || "Sin lección asociada")}</div>
          </td>
          <td>
            <div class="table__meta">${evaluacion.preguntas_por_examen ?? 0} pregunta(s) • ${evaluacion.versiones ?? 0} versión(es)</div>
            <div class="table__meta">${evaluacion.intentos_max ?? 0} intento(s) máx.${evaluacion.tiempo_limite ? ` • ${evaluacion.tiempo_limite} min` : ""}</div>
          </td>
          <td>
            <div class="table__meta">${bancoCount} pregunta(s) disponibles</div>
          </td>
          <td><span class="${statusClass}">${statusLabel}</span></td>
          <td>
            <div class="table__actions">
              <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
              <button class="btn btn--ghost" data-action="toggle" type="button">${evaluacion.activo ? "Desactivar" : "Activar"}</button>
              <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    this.selectors.tableBody.innerHTML = rows;
    if (this.selectors.summary) {
      this.selectors.summary.textContent = `${filtered.length} evaluación(es) listadas`;
    }
  },

  renderVersiones() {
    if (!this.selectors.versionesPanel) return;

    const evaluacion = (this.state.evaluaciones ?? []).find((item) => String(item.id) === String(this.state.selectedEvaluacionId));

    if (!evaluacion) {
      this.selectors.versionesPanel.innerHTML = `<p class="panel__empty">Selecciona una evaluación para ver sus versiones.</p>`;
      return;
    }

    const versiones = evaluacion.evaluaciones_versiones ?? [];
    if (!versiones.length) {
      this.selectors.versionesPanel.innerHTML = `<p class="panel__empty">Aún no se han generado versiones para esta evaluación.</p>`;
      return;
    }

    const rows = versiones
      .map((version) => {
        const preguntas = Array.isArray(version.preguntas) ? version.preguntas.length : 0;
        return `<tr>
          <td>Versión ${escapeHtml(version.numero_version)}</td>
          <td>${preguntas} pregunta(s)</td>
        </tr>`;
      })
      .join("");

    this.selectors.versionesPanel.innerHTML = `
      <div class="table-wrapper" role="region" aria-live="polite">
        <table class="table">
          <thead>
            <tr>
              <th>Versión</th>
              <th>Contenido</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },

  openDialog(evaluacion = null) {
    if (!this.selectors.dialog) return;

    this.state.editingEvaluacion = evaluacion;
    const isEditing = Boolean(evaluacion);

    if (this.selectors.dialogTitle) {
      this.selectors.dialogTitle.textContent = isEditing ? "Editar evaluación" : "Nueva evaluación";
    }

    this.setDialogHint("");
    this.setDialogProcessing(false);

    const cursoId = isEditing ? evaluacion.lecciones?.modulos?.curso_id ?? evaluacion.lecciones?.modulos?.cursos?.id : this.state.filters.cursoId;
    const moduloId = isEditing ? evaluacion.lecciones?.modulo_id ?? evaluacion.lecciones?.modulos?.id : this.state.filters.moduloId;
    const leccionId = isEditing ? evaluacion.leccion_id : this.state.filters.leccionId;

    this.setSelectValue(this.selectors.cursoSelect, cursoId && cursoId !== "todos" ? String(cursoId) : "");
    this.renderModuloSelect();
    this.setSelectValue(this.selectors.moduloSelect, moduloId && moduloId !== "todos" ? String(moduloId) : "");
    this.renderLeccionSelect();
    this.setSelectValue(this.selectors.leccionSelect, leccionId && leccionId !== "todos" ? String(leccionId) : "");

    if (this.selectors.tituloInput) this.selectors.tituloInput.value = isEditing ? evaluacion.titulo ?? "" : "";
    if (this.selectors.descripcionInput) this.selectors.descripcionInput.value = isEditing ? evaluacion.descripcion ?? "" : "";
    if (this.selectors.instruccionesInput) this.selectors.instruccionesInput.value = isEditing ? evaluacion.instrucciones ?? "" : "";
    if (this.selectors.preguntasInput)
      this.selectors.preguntasInput.value = isEditing ? String(evaluacion.preguntas_por_examen ?? "") : "";
    if (this.selectors.versionesInput) this.selectors.versionesInput.value = isEditing ? String(evaluacion.versiones ?? "") : "";
    if (this.selectors.intentosInput) this.selectors.intentosInput.value = isEditing ? String(evaluacion.intentos_max ?? "") : "";
    if (this.selectors.tiempoInput)
      this.selectors.tiempoInput.value = isEditing && evaluacion.tiempo_limite != null ? String(evaluacion.tiempo_limite) : "";
    if (this.selectors.activoCheckbox) this.selectors.activoCheckbox.checked = isEditing ? Boolean(evaluacion.activo) : true;

    if (!this.selectors.dialog.open) {
      this.selectors.dialog.showModal();
    }
  },

  closeDialog() {
    if (!this.selectors.dialog) return;

    this.state.editingEvaluacion = null;
    this.setDialogProcessing(false);
    this.setDialogHint("");
    if (this.selectors.form) {
      this.selectors.form.reset();
    }
    this.renderModuloSelect();
    this.renderLeccionSelect();
    this.selectors.dialog.close();
  },

  async createEvaluacion(payload) {
    try {
      const insertPayload = { ...payload };
      if (this.state.currentUser?.id) {
        insertPayload.creado_por = this.state.currentUser.id;
      }

      const { data, error } = await supabaseDb.from("evaluaciones").insert([insertPayload]).select().single();
      if (error) {
        console.error("Error al crear evaluación", error);
        this.setDialogHint("No se pudo crear la evaluación. Intente nuevamente.", true);
        return;
      }

      await this.generateVersiones(data);
      this.closeDialog();
      this.state.selectedEvaluacionId = data.id;
      await this.loadBancoPreguntas();
      await this.loadEvaluaciones();
    } catch (error) {
      console.error("Error inesperado al crear evaluación", error);
      this.setDialogHint("Ocurrió un error inesperado al crear la evaluación.", true);
    }
  },

  async updateEvaluacion(id, payload) {
    try {
      const { data, error } = await supabaseDb.from("evaluaciones").update(payload).eq("id", id).select().single();
      if (error) {
        console.error("Error al actualizar evaluación", error);
        this.setDialogHint("No se pudo actualizar la evaluación.", true);
        return;
      }

      await this.generateVersiones({ ...data, ...payload });
      this.closeDialog();
      this.state.selectedEvaluacionId = id;
      await this.loadBancoPreguntas();
      await this.loadEvaluaciones();
    } catch (error) {
      console.error("Error inesperado al actualizar evaluación", error);
      this.setDialogHint("Ocurrió un error inesperado al actualizar la evaluación.", true);
    }
  },

  async generateVersiones(evaluacion) {
    if (!evaluacion) return;

    try {
      const totalPreguntas = Number.parseInt(evaluacion.preguntas_por_examen, 10) || 0;
      const totalVersiones = Number.parseInt(evaluacion.versiones, 10) || 0;

      if (!totalPreguntas || !totalVersiones) {
        return;
      }

      const { data: preguntasData, error: preguntasError } = await supabaseDb
        .from("banco_preguntas")
        .select("id")
        .eq("leccion_id", evaluacion.leccion_id)
        .eq("activo", true);

      if (preguntasError) {
        console.error("Error al obtener preguntas para la evaluación", preguntasError);
        return;
      }

      const preguntasIds = (preguntasData ?? []).map((item) => item.id);
      if (preguntasIds.length < totalPreguntas) {
        console.warn("No hay suficientes preguntas activas para generar las versiones");
        window.alert(
          "No fue posible generar las versiones porque la lección no cuenta con suficientes preguntas activas. Ajusta la configuración de la evaluación o actualiza el banco de preguntas."
        );
        return;
      }

      await supabaseDb.from("evaluaciones_versiones").delete().eq("evaluacion_id", evaluacion.id);

      const versiones = [];
      for (let numero = 1; numero <= totalVersiones; numero += 1) {
        const mezcladas = shuffle(preguntasIds);
        versiones.push({
          evaluacion_id: evaluacion.id,
          numero_version: numero,
          preguntas: mezcladas.slice(0, totalPreguntas)
        });
      }

      if (versiones.length) {
        const { error } = await supabaseDb.from("evaluaciones_versiones").insert(versiones);
        if (error) {
          console.error("Error al generar versiones de evaluación", error);
        }
      }
    } catch (error) {
      console.error("Error inesperado al generar versiones", error);
    }
  },

  async deleteEvaluacion(evaluacion) {
    try {
      const { error } = await supabaseDb.from("evaluaciones").delete().eq("id", evaluacion.id);
      if (error) {
        console.error("Error al eliminar evaluación", error);
        window.alert("No se pudo eliminar la evaluación.");
        return;
      }

      if (String(this.state.selectedEvaluacionId) === String(evaluacion.id)) {
        this.state.selectedEvaluacionId = null;
      }

      await this.loadEvaluaciones();
    } catch (error) {
      console.error("Error inesperado al eliminar evaluación", error);
    }
  },

  async toggleEstado(evaluacion) {
    try {
      const { error } = await supabaseDb
        .from("evaluaciones")
        .update({ activo: !evaluacion.activo })
        .eq("id", evaluacion.id);
      if (error) {
        console.error("Error al cambiar estado de la evaluación", error);
        window.alert("No se pudo cambiar el estado de la evaluación.");
        return;
      }

      await this.loadEvaluaciones();
    } catch (error) {
      console.error("Error inesperado al cambiar estado de la evaluación", error);
    }
  },

  bindEvents() {
    this.selectors.newEvaluacionButton?.addEventListener("click", () => {
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
      const editing = this.state.editingEvaluacion;

      if (editing) {
        await this.updateEvaluacion(editing.id, payload);
      } else {
        await this.createEvaluacion(payload);
      }

      this.setDialogProcessing(false);
    });

    this.selectors.searchInput?.addEventListener("input", () => {
      this.state.filters.query = this.selectors.searchInput?.value ?? "";
      this.renderEvaluaciones();
    });

    this.selectors.cursoFilter?.addEventListener("change", async () => {
      this.state.filters.cursoId = this.selectors.cursoFilter?.value ?? "todos";
      this.state.filters.moduloId = "todos";
      this.state.filters.leccionId = "todos";
      await this.loadModulos();
      await this.loadLecciones();
      await this.loadEvaluaciones();
    });

    this.selectors.moduloFilter?.addEventListener("change", async () => {
      this.state.filters.moduloId = this.selectors.moduloFilter?.value ?? "todos";
      this.state.filters.leccionId = "todos";
      await this.loadLecciones();
      await this.loadEvaluaciones();
    });

    this.selectors.leccionFilter?.addEventListener("change", async () => {
      this.state.filters.leccionId = this.selectors.leccionFilter?.value ?? "todos";
      await this.loadEvaluaciones();
    });

    this.selectors.cursoSelect?.addEventListener("change", () => {
      this.renderModuloSelect();
      this.renderLeccionSelect();
    });

    this.selectors.moduloSelect?.addEventListener("change", () => {
      this.renderLeccionSelect();
    });

    this.selectors.tableBody?.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const row = target.closest("tr[data-evaluacion-id]");
      const evaluacionId = row?.dataset.evaluacionId;
      if (!evaluacionId) return;

      const evaluacion = this.state.evaluaciones.find((item) => String(item.id) === String(evaluacionId));
      if (!evaluacion) return;

      const actionElement = target.closest("button[data-action]");
      if (actionElement) {
        const action = actionElement.dataset.action;
        if (action === "edit") {
          this.openDialog(evaluacion);
          return;
        }
        if (action === "toggle") {
          await this.toggleEstado(evaluacion);
          return;
        }
        if (action === "delete") {
          const confirmDelete = window.confirm("¿Deseas eliminar esta evaluación? Esta acción no se puede deshacer.");
          if (!confirmDelete) return;
          await this.deleteEvaluacion(evaluacion);
          return;
        }
        return;
      }

      this.state.selectedEvaluacionId = evaluacion.id;
      this.renderEvaluaciones();
      this.renderVersiones();
    });
  },

  buildPayloadFromForm() {
    if (!this.selectors.form) {
      return { isValid: false, message: "Formulario no disponible." };
    }

    const cursoId = this.selectors.cursoSelect?.value ?? "";
    const moduloId = this.selectors.moduloSelect?.value ?? "";
    const leccionId = this.selectors.leccionSelect?.value ?? "";
    const titulo = this.selectors.tituloInput?.value.trim() ?? "";
    const descripcion = this.selectors.descripcionInput?.value.trim() ?? "";
    const instrucciones = this.selectors.instruccionesInput?.value.trim() ?? "";
    const preguntasPorExamen = Number.parseInt(this.selectors.preguntasInput?.value ?? "", 10);
    const versiones = Number.parseInt(this.selectors.versionesInput?.value ?? "", 10);
    const intentos = Number.parseInt(this.selectors.intentosInput?.value ?? "", 10);
    const tiempoLimiteRaw = this.selectors.tiempoInput?.value ?? "";
    const tiempoLimite = tiempoLimiteRaw ? Number.parseInt(tiempoLimiteRaw, 10) : null;
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
    if (!titulo) {
      return { isValid: false, message: "El título es obligatorio." };
    }
    if (!Number.isFinite(preguntasPorExamen) || preguntasPorExamen <= 0) {
      return { isValid: false, message: "Ingresa un número válido de preguntas por examen." };
    }
    if (!Number.isFinite(versiones) || versiones <= 0) {
      return { isValid: false, message: "Ingresa una cantidad válida de versiones." };
    }
    if (!Number.isFinite(intentos) || intentos <= 0) {
      return { isValid: false, message: "Ingresa una cantidad válida de intentos máximos." };
    }
    if (tiempoLimite != null && (!Number.isFinite(tiempoLimite) || tiempoLimite < 0)) {
      return { isValid: false, message: "Ingresa un tiempo límite válido o deja el campo vacío." };
    }

    const bancoDisponible = this.getBancoCount(leccionId);
    if (bancoDisponible < preguntasPorExamen) {
      return {
        isValid: false,
        message: `La lección seleccionada solo tiene ${bancoDisponible} pregunta(s) activas. Ajusta el número de preguntas por examen.`
      };
    }

    return {
      isValid: true,
      payload: {
        leccion_id: leccionId,
        titulo,
        descripcion: descripcion || null,
        instrucciones: instrucciones || null,
        preguntas_por_examen: preguntasPorExamen,
        versiones,
        intentos_max: intentos,
        tiempo_limite: tiempoLimite ?? null,
        activo
      }
    };
  },

  passesFilter(evaluacion) {
    const cursoId = this.state.filters.cursoId;
    const moduloId = this.state.filters.moduloId;
    const leccionId = this.state.filters.leccionId;

    if (leccionId && leccionId !== "todos" && String(evaluacion.leccion_id) !== String(leccionId)) {
      return false;
    }

    if (moduloId && moduloId !== "todos") {
      const evaluacionModuloId = evaluacion.lecciones?.modulo_id ?? evaluacion.lecciones?.modulos?.id;
      if (String(evaluacionModuloId) !== String(moduloId)) {
        return false;
      }
    }

    if (cursoId && cursoId !== "todos") {
      const evaluacionCursoId = evaluacion.lecciones?.modulos?.curso_id ?? evaluacion.lecciones?.modulos?.cursos?.id;
      if (String(evaluacionCursoId) !== String(cursoId)) {
        return false;
      }
    }

    return true;
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

  getBancoCount(leccionId) {
    return (this.state.bancoPreguntas ?? []).filter((pregunta) => String(pregunta.leccion_id) === String(leccionId)).length;
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

export async function initializeEvaluacionesModule(currentUser) {
  await evaluacionesModule.init(currentUser);
}

