import { supabaseDb } from "../supabaseClient.js";

const STORAGE_BUCKET = "aifa_integral";
const STORAGE_S3_ENDPOINT = "https://dpvsmibnlkwsbdmsnsjr.storage.supabase.co/storage/v1/s3";
const PERMISSION_ERROR_MESSAGE = "No tienes permisos para guardar el material. Contacta al administrador del sistema.";
const FILE_REQUIRED_TYPES = new Set(["pdf", "video", "imagen", "archivo"]);
const TIPO_LABELS = {
  pdf: "PDF",
  video: "Video",
  imagen: "Imagen",
  archivo: "Archivo",
  enlace: "Enlace"
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function formatTipoLabel(tipo) {
  return TIPO_LABELS[tipo] ?? (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Desconocido");
}

function requiresFile(tipo) {
  return FILE_REQUIRED_TYPES.has(tipo);
}

function generateFileName(originalName) {
  const extension = originalName?.split(".").pop()?.toLowerCase() ?? "bin";
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${random}.${extension}`;
}

const ROW_LEVEL_SECURITY_PATTERN = /row-level security/i;

function isPermissionError(error) {
  return ROW_LEVEL_SECURITY_PATTERN.test(String(error?.message ?? ""));
}

function translateSupabaseError(error, context) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (ROW_LEVEL_SECURITY_PATTERN.test(message)) {
    const normalizedContext = String(context ?? "").toLowerCase();
    if (normalizedContext.includes("material")) {
      return `${PERMISSION_ERROR_MESSAGE} Endpoint: ${STORAGE_S3_ENDPOINT}`;
    }
    return `No tienes permisos para ${context}. Contacta al administrador del sistema. Endpoint: ${STORAGE_S3_ENDPOINT}`;
  }
  return null;
}

function markFileInputError(input, message) {
  if (!(input instanceof HTMLInputElement)) return;
  input.setCustomValidity(message ?? "");
  input.reportValidity();
}

function clearFileInputError(input) {
  if (!(input instanceof HTMLInputElement)) return;
  input.setCustomValidity("");
}

async function removeFileFromStorage(path) {
  if (!path) return;
  try {
    const { error } = await supabaseDb.storage.from(STORAGE_BUCKET).remove([path]);
    if (error) {
      console.error("No se pudo eliminar el archivo temporal del almacenamiento", error);
    }
  } catch (removeError) {
    console.error("Error inesperado al intentar eliminar el archivo temporal", removeError);
  }
}

async function uploadUsingSignedUrl(filePath, file, options = {}) {
  try {
    const { data: signedData, error: signedError } = await supabaseDb.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(filePath);

    if (signedError) {
      return { error: signedError };
    }

    const { error: signedUploadError } = await supabaseDb.storage
      .from(STORAGE_BUCKET)
      .uploadToSignedUrl(filePath, signedData.token, file, options);

    if (signedUploadError) {
      return { error: signedUploadError };
    }

    return { error: null };
  } catch (error) {
    return { error };
  }
}

export const materialesModule = {
  state: {},
  selectors: {},

  async init(currentUser = null) {
    this.state = {
      currentUser: currentUser ?? null,
      cursos: [],
      modulos: [],
      lecciones: [],
      materiales: [],
      filters: {
        query: "",
        cursoId: "todos",
        moduloId: "todos",
        leccionId: "todos"
      },
      editingMaterial: null,
      isProcessing: false
    };

    this.selectors = {
      newMaterialButton: document.querySelector("#btn-new-material"),
      dialog: document.querySelector("#material-dialog"),
      dialogTitle: document.querySelector("#material-dialog-title"),
      dialogClose: document.querySelector("#material-dialog-close"),
      dialogCancel: document.querySelector("#material-dialog-cancel"),
      dialogHint: document.querySelector("#material-dialog-hint"),
      form: document.querySelector("#material-form"),
      tableBody: document.querySelector("#materiales-table-body"),
      summary: document.querySelector("#materiales-summary"),
      searchInput: document.querySelector("#search-material"),
      cursoFilter: document.querySelector("#filter-material-curso"),
      moduloFilter: document.querySelector("#filter-material-modulo"),
      leccionFilter: document.querySelector("#filter-material-leccion"),
      cursoSelect: document.querySelector("#material-curso"),
      moduloSelect: document.querySelector("#material-modulo"),
      leccionSelect: document.querySelector("#material-leccion"),
      tipoSelect: document.querySelector("#material-tipo"),
      tituloInput: document.querySelector("#material-titulo"),
      descripcionInput: document.querySelector("#material-descripcion"),
      archivoInput: document.querySelector("#material-archivo"),
      enlaceInput: document.querySelector("#material-enlace"),
      ordenInput: document.querySelector("#material-orden"),
      activoCheckbox: document.querySelector("#material-activo")
    };

    if (!this.selectors.tableBody || !this.selectors.form) {
      return;
    }

    this.bindEvents();
    await Promise.all([this.loadCursos(), this.loadModulos(), this.loadLecciones()]);
    await this.loadMateriales();
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
      } else {
        this.state.cursos = data ?? [];
      }

      this.renderCursoFilter();
      this.populateCursoSelect();
    } catch (error) {
      console.error("Error inesperado al cargar cursos", error);
      this.state.cursos = [];
      this.renderCursoFilter();
      this.populateCursoSelect();
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
      } else {
        this.state.modulos = data ?? [];
      }

      this.renderModuloFilter();
      this.populateModuloSelect();
    } catch (error) {
      console.error("Error inesperado al cargar módulos", error);
      this.state.modulos = [];
      this.renderModuloFilter();
      this.populateModuloSelect();
    }
  },

  async loadLecciones() {
    try {
      const { data, error } = await supabaseDb
        .from("lecciones")
        .select(
          `id,modulo_id,nombre,descripcion,orden,activo,
           modulos_curso:modulo_id(id,curso_id,nombre)`
        )
        .order("orden", { ascending: true });

      if (error) {
        console.error("Error al cargar lecciones", error);
        this.state.lecciones = [];
      } else {
        this.state.lecciones = data ?? [];
      }

      this.renderLeccionFilter();
      this.populateLeccionSelect();
    } catch (error) {
      console.error("Error inesperado al cargar lecciones", error);
      this.state.lecciones = [];
      this.renderLeccionFilter();
      this.populateLeccionSelect();
    }
  },

  async loadMateriales() {
    if (this.selectors.tableBody) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">Cargando materiales…</td></tr>`;
    }

    try {
      let query = supabaseDb
        .from("materiales")
        .select(
          `id,leccion_id,tipo,titulo,descripcion,url_archivo,url_enlace,orden,activo,created_at,
           lecciones:leccion_id(
             id,nombre,modulo_id,
             modulos_curso:modulo_id(
               id,nombre,curso_id,
               cursos:curso_id(id,nombre)
             )
           )`
        )
        .order("orden", { ascending: true })
        .order("created_at", { ascending: false });

      const { cursoId, moduloId, leccionId } = this.state.filters;

      if (leccionId && leccionId !== "todos") {
        query = query.eq("leccion_id", leccionId);
      } else if (moduloId && moduloId !== "todos") {
        const leccionIds = this.getLeccionesByModulo(moduloId).map((item) => item.id);
        if (!leccionIds.length) {
          this.state.materiales = [];
          this.renderMateriales();
          return;
        }
        query = query.in("leccion_id", leccionIds);
      } else if (cursoId && cursoId !== "todos") {
        const leccionIds = this.getLeccionesByCurso(cursoId).map((item) => item.id);
        if (!leccionIds.length) {
          this.state.materiales = [];
          this.renderMateriales();
          return;
        }
        query = query.in("leccion_id", leccionIds);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error al cargar materiales", error);
        const friendly = translateSupabaseError(error, "listar materiales");
        if (friendly) {
          console.error(friendly);
        }
        const message = friendly ?? "No se pudieron cargar los materiales.";
        if (this.selectors.tableBody) {
          this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">${message}</td></tr>`;
        }
        if (this.selectors.summary) this.selectors.summary.textContent = "";
        return;
      }

      this.state.materiales = data ?? [];
      this.renderMateriales();
    } catch (error) {
      console.error("Error inesperado al cargar materiales", error);
      const friendly = translateSupabaseError(error, "listar materiales");
      if (friendly) {
        console.error(friendly);
      }
      const message = friendly ?? "Ocurrió un error al cargar los materiales.";
      if (this.selectors.tableBody) {
        this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">${message}</td></tr>`;
      }
      if (this.selectors.summary) this.selectors.summary.textContent = "";
    }
  },

  renderMateriales() {
    if (!this.selectors.tableBody) return;

    const query = this.state.filters.query.trim().toLowerCase();
    const { cursoId, moduloId, leccionId } = this.state.filters;

    const filtered = (this.state.materiales ?? []).filter((material) => {
      const leccion = material.lecciones ?? this.getLeccionById(material.leccion_id);
      const modulo = leccion?.modulos_curso ?? this.getModuloById(leccion?.modulo_id ?? material.lecciones?.modulo_id);
      const curso = modulo?.cursos ?? this.getCursoById(modulo?.curso_id ?? material.lecciones?.modulos_curso?.curso_id);

      const matchesCurso = cursoId === "todos" || String(curso?.id) === String(cursoId);
      if (!matchesCurso) return false;

      const matchesModulo = moduloId === "todos" || String(modulo?.id) === String(moduloId);
      if (!matchesModulo) return false;

      const matchesLeccion = leccionId === "todos" || String(leccion?.id) === String(leccionId);
      if (!matchesLeccion) return false;

      if (!query) return true;
      const titulo = (material.titulo ?? "").toLowerCase();
      const descripcion = (material.descripcion ?? "").toLowerCase();
      const leccionNombre = (leccion?.nombre ?? "").toLowerCase();
      const moduloNombre = (modulo?.nombre ?? "").toLowerCase();
      const cursoNombre = (curso?.nombre ?? "").toLowerCase();

      return (
        titulo.includes(query)
        || descripcion.includes(query)
        || leccionNombre.includes(query)
        || moduloNombre.includes(query)
        || cursoNombre.includes(query)
      );
    });

    if (!filtered.length) {
      this.selectors.tableBody.innerHTML = `<tr><td colspan="4" class="table__empty">No hay materiales que coincidan con los criterios seleccionados.</td></tr>`;
      if (this.selectors.summary) this.selectors.summary.textContent = "0 material(es) listados";
      return;
    }

    const rows = filtered
      .map((material) => {
        const leccion = material.lecciones ?? this.getLeccionById(material.leccion_id);
        const modulo = leccion?.modulos_curso ?? this.getModuloById(leccion?.modulo_id ?? material.lecciones?.modulo_id);
        const curso = modulo?.cursos ?? this.getCursoById(modulo?.curso_id ?? material.lecciones?.modulos_curso?.curso_id);
        const status = material.activo
          ? { label: "Activo", className: "badge badge--success" }
          : { label: "Inactivo", className: "badge badge--danger" };

        const preview = this.buildPreview(material);
        const tipoLabel = formatTipoLabel(material.tipo);
        const orden = Number.isFinite(material.orden) ? material.orden : "-";

        return `<tr data-material-id="${material.id}">
          <td>
            <div class="table__primary">${escapeHtml(material.titulo ?? "Sin título")}</div>
            <div class="table__meta">${escapeHtml(tipoLabel)} · Orden: ${orden}</div>
            <div class="table__meta">${escapeHtml(leccion?.nombre ?? "Lección sin nombre")} · ${escapeHtml(modulo?.nombre ?? "Módulo sin nombre")} · ${escapeHtml(curso?.nombre ?? "Curso sin nombre")}</div>
            ${preview}
          </td>
          <td>${escapeHtml(tipoLabel)}</td>
          <td><span class="${status.className}">${status.label}</span></td>
          <td>
            <div class="table__actions">
              <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
              <button class="btn btn--ghost" data-action="toggle" type="button">${material.activo ? "Desactivar" : "Activar"}</button>
              <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    this.selectors.tableBody.innerHTML = rows;
    if (this.selectors.summary) {
      this.selectors.summary.textContent = `${filtered.length} material(es) listados`;
    }
  },

  openDialog(material = null) {
    if (!this.selectors.dialog) return;

    this.state.editingMaterial = material;
    this.setDialogHint("");
    this.setDialogProcessing(false);
    this.selectors.form?.reset();

    const cursoIdFromMaterial = material?.lecciones?.modulos_curso?.curso_id
      ?? this.getModuloById(material?.lecciones?.modulo_id ?? this.getLeccionById(material?.leccion_id)?.modulo_id)?.curso_id
      ?? null;
    const moduloIdFromMaterial = material?.lecciones?.modulo_id ?? this.getLeccionById(material?.leccion_id)?.modulo_id ?? null;
    const leccionIdFromMaterial = material?.leccion_id ?? null;

    const defaultCursoId = cursoIdFromMaterial ?? (this.state.filters.cursoId !== "todos" ? this.state.filters.cursoId : "");
    const defaultModuloId = moduloIdFromMaterial ?? (this.state.filters.moduloId !== "todos" ? this.state.filters.moduloId : "");
    const defaultLeccionId = leccionIdFromMaterial ?? (this.state.filters.leccionId !== "todos" ? this.state.filters.leccionId : "");

    this.populateCursoSelect(defaultCursoId || "");
    this.populateModuloSelect(defaultModuloId || "", defaultCursoId || "");
    this.populateLeccionSelect(defaultLeccionId || "", defaultModuloId || "", defaultCursoId || "");

    if (material) {
      if (this.selectors.dialogTitle) this.selectors.dialogTitle.textContent = "Editar material";
      if (this.selectors.tipoSelect) this.selectors.tipoSelect.value = material.tipo ?? "";
      if (this.selectors.tituloInput) this.selectors.tituloInput.value = material.titulo ?? "";
      if (this.selectors.descripcionInput) this.selectors.descripcionInput.value = material.descripcion ?? "";
      if (this.selectors.enlaceInput) this.selectors.enlaceInput.value = material.url_enlace ?? "";
      if (this.selectors.ordenInput) {
        this.selectors.ordenInput.value = Number.isFinite(material.orden) ? String(material.orden) : "";
      }
      if (this.selectors.activoCheckbox) this.selectors.activoCheckbox.checked = Boolean(material.activo);
    } else {
      if (this.selectors.dialogTitle) this.selectors.dialogTitle.textContent = "Nuevo material";
      if (this.selectors.activoCheckbox) this.selectors.activoCheckbox.checked = true;
    }

    if (this.selectors.tipoSelect) {
      const currentTipo = this.selectors.tipoSelect.value || "archivo";
      this.updateFormFieldsForTipo(currentTipo);
    }

    clearFileInputError(this.selectors.archivoInput);

    this.selectors.dialog.showModal();
  },

  closeDialog() {
    this.selectors.dialog?.close();
    this.setDialogHint("");
    this.setDialogProcessing(false);
    this.state.editingMaterial = null;
    if (this.selectors.form) {
      this.selectors.form.reset();
      if (this.selectors.tipoSelect) this.selectors.tipoSelect.value = this.selectors.tipoSelect.options?.[0]?.value ?? "";
      this.updateFormFieldsForTipo(this.selectors.tipoSelect?.value ?? "");
    }
    clearFileInputError(this.selectors.archivoInput);
  },

  async createMaterial(payload) {
    try {
      const insertPayload = { ...payload };
      insertPayload.id = crypto.randomUUID();
      insertPayload.descripcion = insertPayload.descripcion || null;
      insertPayload.url_enlace = insertPayload.url_enlace || null;
      insertPayload.url_archivo = insertPayload.url_archivo || null;
      insertPayload.orden = Number.isFinite(insertPayload.orden) ? insertPayload.orden : 0;
      insertPayload.activo = Boolean(insertPayload.activo);
      if (this.state.currentUser?.id) {
        insertPayload.creado_por = this.state.currentUser.id;
      }

      const { error } = await supabaseDb.from("materiales").insert([insertPayload]);
      if (error) {
        console.error("Error al crear material", error);
        const friendly = translateSupabaseError(error, "guardar el material");
        if (friendly) {
          console.error(friendly);
        }
        this.setDialogHint(friendly ?? "No se pudo crear el material. Revisa la consola para más detalles.", true);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error inesperado al crear material", error);
      const friendly = translateSupabaseError(error, "guardar el material");
      if (friendly) {
        console.error(friendly);
      }
      this.setDialogHint(friendly ?? "Ocurrió un error inesperado al crear el material.", true);
      return false;
    }
  },

  async updateMaterial(materialId, payload) {
    try {
      const updatePayload = { ...payload };
      updatePayload.descripcion = updatePayload.descripcion || null;
      updatePayload.url_enlace = updatePayload.url_enlace || null;
      updatePayload.url_archivo = updatePayload.url_archivo || null;
      updatePayload.orden = Number.isFinite(updatePayload.orden) ? updatePayload.orden : 0;
      updatePayload.activo = Boolean(updatePayload.activo);

      const { error } = await supabaseDb.from("materiales").update(updatePayload).eq("id", materialId);
      if (error) {
        console.error("Error al actualizar material", error);
        const friendly = translateSupabaseError(error, "guardar el material");
        if (friendly) {
          console.error(friendly);
        }
        this.setDialogHint(friendly ?? "No se pudo actualizar el material.", true);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error inesperado al actualizar material", error);
      const friendly = translateSupabaseError(error, "guardar el material");
      if (friendly) {
        console.error(friendly);
      }
      this.setDialogHint(friendly ?? "Ocurrió un error inesperado al actualizar el material.", true);
      return false;
    }
  },

  async deleteMaterial(material) {
    try {
      const { error } = await supabaseDb.from("materiales").delete().eq("id", material.id);
      if (error) {
        console.error("Error al eliminar material", error);
        const friendly = translateSupabaseError(error, "eliminar materiales");
        window.alert(friendly ?? "No se pudo eliminar el material.");
        return;
      }

      await this.loadMateriales();
    } catch (error) {
      console.error("Error inesperado al eliminar material", error);
    }
  },

  async toggleEstado(material) {
    try {
      const { error } = await supabaseDb
        .from("materiales")
        .update({ activo: !material.activo })
        .eq("id", material.id);

      if (error) {
        console.error("Error al cambiar estado del material", error);
        const friendly = translateSupabaseError(error, "actualizar el estado de los materiales");
        window.alert(friendly ?? "No se pudo cambiar el estado del material.");
        return;
      }

      await this.loadMateriales();
    } catch (error) {
      console.error("Error inesperado al cambiar el estado del material", error);
    }
  },

  async uploadFile(file) {
    if (!file) return { url: null, path: null };

    clearFileInputError(this.selectors.archivoInput);
    const fileName = generateFileName(file.name);
    const filePath = `materiales/${fileName}`;
    const uploadOptions = {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined
    };

    const { error: uploadError } = await supabaseDb.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, uploadOptions);

    let finalError = uploadError;

    if (uploadError && isPermissionError(uploadError)) {
      console.error("Error al subir archivo", uploadError);
      console.error("Endpoint de almacenamiento restringido:", STORAGE_S3_ENDPOINT);
      console.warn("Intentando subida mediante URL firmada debido a restricciones de seguridad.");
      const { error: signedError } = await uploadUsingSignedUrl(filePath, file, uploadOptions);
      finalError = signedError ?? null;
    }

    if (finalError) {
      console.error("Error al subir archivo", finalError);
      const friendly = translateSupabaseError(finalError, "subir archivos de materiales");
      if (friendly) {
        console.error(friendly);
        this.setDialogHint(friendly, true);
        markFileInputError(this.selectors.archivoInput, friendly);
      }
      throw finalError;
    }

    const { data: urlData, error: urlError } = await supabaseDb.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    if (urlError) {
      console.error("Error al obtener URL pública del archivo", urlError);
      const friendly = translateSupabaseError(urlError, "obtener la URL pública del material");
      if (friendly) {
        console.error(friendly);
        this.setDialogHint(friendly, true);
        markFileInputError(this.selectors.archivoInput, friendly);
      }
      throw urlError;
    }

    return {
      url: urlData?.publicUrl ?? null,
      path: filePath
    };
  },

  bindEvents() {
    this.selectors.newMaterialButton?.addEventListener("click", () => {
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

      const row = target.closest("tr[data-material-id]");
      const materialId = row?.dataset.materialId;
      if (!materialId) return;

      const material = this.state.materiales.find((item) => String(item.id) === materialId);
      if (!material) return;

      if (action === "edit") {
        this.openDialog(material);
        return;
      }

      if (action === "toggle") {
        await this.toggleEstado(material);
        return;
      }

      if (action === "delete") {
        const confirmDelete = window.confirm("¿Deseas eliminar este material? Esta acción no se puede deshacer.");
        if (!confirmDelete) return;
        await this.deleteMaterial(material);
      }
    });

    this.selectors.searchInput?.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      this.state.filters.query = target.value;
      this.renderMateriales();
    });

    this.selectors.cursoFilter?.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      this.state.filters.cursoId = target.value || "todos";
      this.state.filters.moduloId = "todos";
      this.state.filters.leccionId = "todos";
      this.renderModuloFilter();
      this.renderLeccionFilter();
      this.populateModuloSelect();
      this.populateLeccionSelect();
      await this.loadMateriales();
    });

    this.selectors.moduloFilter?.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      this.state.filters.moduloId = target.value || "todos";
      this.state.filters.leccionId = "todos";
      this.renderLeccionFilter();
      this.populateLeccionSelect();
      await this.loadMateriales();
    });

    this.selectors.leccionFilter?.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      this.state.filters.leccionId = target.value || "todos";
      await this.loadMateriales();
    });

    this.selectors.tipoSelect?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const tipo = target.value;
      this.updateFormFieldsForTipo(tipo);
    });

    this.selectors.cursoSelect?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const cursoId = target.value;
      this.populateModuloSelect("", cursoId);
      this.populateLeccionSelect("", "", cursoId);
    });

    this.selectors.moduloSelect?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const moduloId = target.value;
      this.populateLeccionSelect("", moduloId);
    });

    this.selectors.form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!this.selectors.form || this.state.isProcessing) return;

      const { ok, data, message } = this.collectFormData();
      if (!ok) {
        this.setDialogHint(message, true);
        return;
      }

      this.setDialogHint("");
      this.setDialogProcessing(true);

      let uploadedFilePath = null;
      let success = false;

      try {
        let urlArchivo = this.state.editingMaterial?.url_archivo ?? null;

        if (requiresFile(data.tipo)) {
          if (data.file) {
            this.setDialogHint("Subiendo archivo…", false);
            const uploadResult = await this.uploadFile(data.file);
            urlArchivo = uploadResult.url;
            uploadedFilePath = uploadResult.path ?? null;
            this.setDialogHint("");
            clearFileInputError(this.selectors.archivoInput);
          } else if (!urlArchivo) {
            const message = "Selecciona un archivo para el material.";
            this.setDialogHint(message, true);
            markFileInputError(this.selectors.archivoInput, message);
            this.setDialogProcessing(false);
            return;
          }
        } else {
          urlArchivo = null;
          clearFileInputError(this.selectors.archivoInput);
        }

        const payload = {
          leccion_id: data.leccionId,
          tipo: data.tipo,
          titulo: data.titulo,
          descripcion: data.descripcion,
          url_enlace: data.tipo === "enlace" ? data.urlEnlace : null,
          url_archivo: urlArchivo,
          orden: data.orden,
          activo: data.activo
        };

        if (this.state.editingMaterial) {
          success = await this.updateMaterial(this.state.editingMaterial.id, payload);
        } else {
          success = await this.createMaterial(payload);
        }

        if (!success && requiresFile(data.tipo) && uploadedFilePath) {
          const message = this.selectors.dialogHint?.textContent?.trim();
          if (message) {
            markFileInputError(this.selectors.archivoInput, message);
          }
        }

        if (success) {
          this.closeDialog();
          await this.loadMateriales();
        }
      } catch (error) {
        console.error("Error al guardar material", error);
        const friendly = translateSupabaseError(error, "guardar el material");
        if (friendly) {
          console.error(friendly);
          this.setDialogHint(friendly, true);
          if (requiresFile(data.tipo)) {
            markFileInputError(this.selectors.archivoInput, friendly);
          }
        } else {
          this.setDialogHint("Ocurrió un error al guardar el material.", true);
        }
      }

      if (!success && uploadedFilePath) {
        await removeFileFromStorage(uploadedFilePath);
      }

      this.setDialogProcessing(false);
    });
  },

  collectFormData() {
    if (!this.selectors.form) {
      return { ok: false, message: "Formulario no disponible" };
    }

    const formData = new FormData(this.selectors.form);
    const cursoId = this.selectors.cursoSelect ? String(formData.get("curso_id") ?? "").trim() : "";
    const moduloId = this.selectors.moduloSelect ? String(formData.get("modulo_id") ?? "").trim() : "";
    const leccionId = String(formData.get("leccion_id") ?? "").trim();
    const tipo = String(formData.get("tipo") ?? "").trim();
    const titulo = String(formData.get("titulo") ?? "").trim();
    const descripcion = String(formData.get("descripcion") ?? "").trim();
    const urlEnlace = String(formData.get("url_enlace") ?? "").trim();
    const ordenValue = String(formData.get("orden") ?? "").trim();
    const orden = ordenValue ? Number.parseInt(ordenValue, 10) : NaN;
    const activo = Boolean(this.selectors.activoCheckbox?.checked);
    const file = this.selectors.archivoInput?.files?.[0] ?? null;

    const allowedTipos = Object.keys(TIPO_LABELS);
    if (!allowedTipos.includes(tipo)) {
      return { ok: false, message: "Selecciona un tipo de material válido." };
    }

    if (this.selectors.cursoSelect && !cursoId) {
      return { ok: false, message: "Selecciona el curso correspondiente." };
    }

    if (this.selectors.moduloSelect && !moduloId) {
      return { ok: false, message: "Selecciona el módulo correspondiente." };
    }

    if (!leccionId) {
      return { ok: false, message: "Selecciona la lección a la que pertenece el material." };
    }

    if (!titulo) {
      return { ok: false, message: "El título del material es obligatorio." };
    }

    if (!Number.isInteger(orden)) {
      return { ok: false, message: "Define un orden numérico para el material." };
    }

    if (tipo === "enlace" && !urlEnlace) {
      return { ok: false, message: "Ingresa el enlace del material." };
    }

    return {
      ok: true,
      data: {
        cursoId,
        moduloId,
        leccionId,
        tipo,
        titulo,
        descripcion,
        urlEnlace,
        orden,
        activo,
        file
      }
    };
  },

  renderCursoFilter() {
    const select = this.selectors.cursoFilter;
    if (!select) return;

    const cursos = this.state.cursos ?? [];
    select.innerHTML = "";

    const optionTodos = document.createElement("option");
    optionTodos.value = "todos";
    optionTodos.textContent = "Todos los cursos";
    select.append(optionTodos);

    cursos.forEach((curso) => {
      const option = document.createElement("option");
      option.value = String(curso.id);
      option.textContent = curso.nombre ?? "Curso sin nombre";
      select.append(option);
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
    const optionTodos = document.createElement("option");
    optionTodos.value = "todos";
    optionTodos.textContent = placeholderLabel;
    select.append(optionTodos);

    modulos.forEach((modulo) => {
      const option = document.createElement("option");
      option.value = String(modulo.id);
      option.textContent = modulo.nombre ?? "Módulo sin nombre";
      select.append(option);
    });

    if (this.state.filters.moduloId !== "todos") {
      const exists = modulos.some((modulo) => String(modulo.id) === this.state.filters.moduloId);
      if (!exists) {
        this.state.filters.moduloId = "todos";
      }
    }

    select.value = this.state.filters.moduloId;
  },

  renderLeccionFilter() {
    const select = this.selectors.leccionFilter;
    if (!select) return;

    const { cursoId, moduloId } = this.state.filters;
    let lecciones = [];
    if (moduloId !== "todos") {
      lecciones = this.getLeccionesByModulo(moduloId);
    } else if (cursoId !== "todos") {
      lecciones = this.getLeccionesByCurso(cursoId);
    } else {
      lecciones = this.state.lecciones ?? [];
    }

    select.innerHTML = "";
    const optionTodos = document.createElement("option");
    optionTodos.value = "todos";
    optionTodos.textContent = moduloId !== "todos" ? "Todas las lecciones del módulo" : "Todas las lecciones";
    select.append(optionTodos);

    lecciones.forEach((leccion) => {
      const option = document.createElement("option");
      option.value = String(leccion.id);
      option.textContent = leccion.nombre ?? "Lección sin nombre";
      select.append(option);
    });

    if (this.state.filters.leccionId !== "todos") {
      const exists = lecciones.some((leccion) => String(leccion.id) === this.state.filters.leccionId);
      if (!exists) {
        this.state.filters.leccionId = "todos";
      }
    }

    select.value = this.state.filters.leccionId;
  },

  populateCursoSelect(selectedId = "") {
    const select = this.selectors.cursoSelect;
    if (!select) return;

    const cursos = this.state.cursos ?? [];
    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona un curso";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);

    cursos.forEach((curso) => {
      const option = document.createElement("option");
      option.value = String(curso.id);
      option.textContent = curso.nombre ?? "Curso sin nombre";
      select.append(option);
    });

    if (selectedId) {
      const exists = cursos.some((curso) => String(curso.id) === String(selectedId));
      if (!exists) {
        const curso = this.getCursoById(selectedId);
        if (curso) {
          const option = document.createElement("option");
          option.value = String(curso.id);
          option.textContent = curso.nombre ?? "Curso sin nombre";
          select.append(option);
        }
      }

      if (Array.from(select.options).some((option) => option.value === String(selectedId))) {
        select.value = String(selectedId);
      }
    }
  },

  populateModuloSelect(selectedId = "", cursoId = "") {
    const select = this.selectors.moduloSelect;
    if (!select) return;

    let modulos = this.state.modulos ?? [];
    if (cursoId) {
      modulos = this.getModulosByCurso(cursoId);
    }

    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = cursoId ? "Selecciona un módulo del curso" : "Selecciona un módulo";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);

    modulos.forEach((modulo) => {
      const option = document.createElement("option");
      option.value = String(modulo.id);
      option.textContent = modulo.nombre ?? "Módulo sin nombre";
      select.append(option);
    });

    if (selectedId) {
      const exists = modulos.some((modulo) => String(modulo.id) === String(selectedId));
      if (!exists) {
        const modulo = this.getModuloById(selectedId);
        if (modulo) {
          const option = document.createElement("option");
          option.value = String(modulo.id);
          option.textContent = modulo.nombre ?? "Módulo sin nombre";
          select.append(option);
        }
      }

      if (Array.from(select.options).some((option) => option.value === String(selectedId))) {
        select.value = String(selectedId);
      }
    }
  },

  populateLeccionSelect(selectedId = "", moduloId = "", cursoId = "") {
    const select = this.selectors.leccionSelect;
    if (!select) return;

    let lecciones = this.state.lecciones ?? [];
    if (moduloId) {
      lecciones = this.getLeccionesByModulo(moduloId);
    } else if (cursoId) {
      lecciones = this.getLeccionesByCurso(cursoId);
    }

    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = moduloId ? "Selecciona una lección del módulo" : "Selecciona una lección";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);

    lecciones.forEach((leccion) => {
      const option = document.createElement("option");
      option.value = String(leccion.id);
      option.textContent = leccion.nombre ?? "Lección sin nombre";
      select.append(option);
    });

    if (selectedId) {
      const exists = lecciones.some((leccion) => String(leccion.id) === String(selectedId));
      if (!exists) {
        const leccion = this.getLeccionById(selectedId);
        if (leccion) {
          const option = document.createElement("option");
          option.value = String(leccion.id);
          option.textContent = leccion.nombre ?? "Lección sin nombre";
          select.append(option);
        }
      }

      if (Array.from(select.options).some((option) => option.value === String(selectedId))) {
        select.value = String(selectedId);
      }
    }
  },

  updateFormFieldsForTipo(tipo) {
    const requires = requiresFile(tipo);
    if (this.selectors.archivoInput) {
      const field = this.selectors.archivoInput.closest(".form__field");
      if (field) field.hidden = !requires;
      this.selectors.archivoInput.required = requires && !this.state.editingMaterial?.url_archivo;
      if (!requires) {
        this.selectors.archivoInput.value = "";
        clearFileInputError(this.selectors.archivoInput);
      }
    }

    if (this.selectors.enlaceInput) {
      const field = this.selectors.enlaceInput.closest(".form__field");
      const isLink = tipo === "enlace";
      if (field) field.hidden = !isLink;
      this.selectors.enlaceInput.required = isLink;
      if (!isLink) {
        this.selectors.enlaceInput.value = "";
      }
    }
  },

  buildPreview(material) {
    const tipo = material.tipo;
    const urlArchivo = material.url_archivo ?? "";
    const urlEnlace = material.url_enlace ?? "";

    if (tipo === "enlace" && urlEnlace) {
      return `<div class="table__meta"><a href="${urlEnlace}" target="_blank" rel="noopener">Abrir enlace externo</a></div>`;
    }

    if (requiresFile(tipo) && urlArchivo) {
      if (tipo === "imagen") {
        return `<div class="table__meta"><a href="${urlArchivo}" target="_blank" rel="noopener">Ver imagen</a></div>`;
      }
      if (tipo === "video") {
        return `<div class="table__meta"><a href="${urlArchivo}" target="_blank" rel="noopener">Reproducir video</a></div>`;
      }
      if (tipo === "pdf") {
        return `<div class="table__meta"><a href="${urlArchivo}" target="_blank" rel="noopener">Abrir PDF</a></div>`;
      }
      return `<div class="table__meta"><a href="${urlArchivo}" target="_blank" rel="noopener">Descargar archivo</a></div>`;
    }

    return `<div class="table__meta">Sin vista previa disponible</div>`;
  },

  getCursoById(id) {
    if (!id) return null;
    return (this.state.cursos ?? []).find((curso) => String(curso.id) === String(id)) ?? null;
  },

  getModuloById(id) {
    if (!id) return null;
    return (this.state.modulos ?? []).find((modulo) => String(modulo.id) === String(id)) ?? null;
  },

  getLeccionById(id) {
    if (!id) return null;
    return (this.state.lecciones ?? []).find((leccion) => String(leccion.id) === String(id)) ?? null;
  },

  getModulosByCurso(cursoId) {
    return (this.state.modulos ?? []).filter((modulo) => String(modulo.curso_id) === String(cursoId));
  },

  getLeccionesByModulo(moduloId) {
    return (this.state.lecciones ?? []).filter((leccion) => String(leccion.modulo_id) === String(moduloId));
  },

  getLeccionesByCurso(cursoId) {
    return (this.state.lecciones ?? []).filter((leccion) => String(leccion.modulos_curso?.curso_id ?? this.getModuloById(leccion.modulo_id)?.curso_id) === String(cursoId));
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

export async function initializeMaterialesModule(currentUser) {
  await materialesModule.init(currentUser);
}
