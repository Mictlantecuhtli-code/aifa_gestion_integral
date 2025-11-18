import { supabaseDb } from "./supabaseClient.js";

function createInitialState() {
  return {
    cursos: [],
    filters: {
      query: "",
      status: "todos"
    },
    editingCourse: null,
    currentUser: null
  };
}

let state = createInitialState();

let selectors = {};

function resolveSelectors() {
  selectors = {
    newCourseButton: document.querySelector("#btn-new-course"),
    courseDialog: document.querySelector("#course-dialog"),
    courseDialogTitle: document.querySelector("#course-dialog-title"),
    courseDialogClose: document.querySelector("#course-dialog-close"),
    courseDialogCancel: document.querySelector("#course-dialog-cancel"),
    courseDialogHint: document.querySelector("#course-dialog-hint"),
    courseForm: document.querySelector("#course-form"),
    coursesTableBody: document.querySelector("#courses-table-body"),
    coursesSummary: document.querySelector("#courses-summary"),
    searchInput: document.querySelector("#search-course"),
    statusSelect: document.querySelector("#filter-course-status"),
    courseNameInput: document.querySelector("#course-name"),
    courseDescriptionInput: document.querySelector("#course-description"),
    courseCoverInput: document.querySelector("#course-cover"),
    courseActiveCheckbox: document.querySelector("#course-active")
  };
}

export async function initializeCursosModule(currentUser) {
  state = createInitialState();
  state.currentUser = currentUser ?? null;
  resolveSelectors();

  if (!selectors.courseForm) {
    return;
  }

  await loadCursos();
  registerEventListeners();
}

async function loadCursos() {
  if (selectors.coursesTableBody) {
    selectors.coursesTableBody.innerHTML = `<tr><td colspan="4" class="table__empty">Cargando cursos…</td></tr>`;
  }

  const { data, error } = await supabaseDb
    .from("cursos")
    .select("id,nombre,descripcion,imagen_portada,activo,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al cargar cursos", error);
    if (selectors.coursesTableBody) {
      selectors.coursesTableBody.innerHTML = `<tr><td colspan="4" class="table__empty">Ocurrió un error al cargar los cursos.</td></tr>`;
    }
    if (selectors.coursesSummary) selectors.coursesSummary.textContent = "";
    return;
  }

  state.cursos = data ?? [];
  renderCursos();
}

function renderCursos() {
  if (!selectors.coursesTableBody) return;

  const filtered = applyFilters(state.cursos);

  if (!filtered.length) {
    selectors.coursesTableBody.innerHTML = `<tr><td colspan="4" class="table__empty">No hay cursos que coincidan con los filtros seleccionados.</td></tr>`;
    if (selectors.coursesSummary) selectors.coursesSummary.textContent = "";
    return;
  }

  const rows = filtered
    .map((curso) => {
      const status = curso.activo ? { label: "Activo", className: "badge badge--success" } : { label: "Inactivo", className: "badge badge--danger" };
      const createdAt = curso.created_at ? new Date(curso.created_at).toLocaleDateString() : "-";
      const description = curso.descripcion ? escapeHtml(curso.descripcion) : "Sin descripción";

      return `<tr data-course-id="${curso.id}">
        <td>
          <div class="table__primary">${escapeHtml(curso.nombre ?? "Sin nombre")}</div>
          <div class="table__meta">${description}</div>
        </td>
        <td><span class="${status.className}">${status.label}</span></td>
        <td>${createdAt}</td>
        <td>
          <div class="table__actions">
            <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
            <button class="btn btn--ghost" data-action="toggle" type="button">${curso.activo ? "Desactivar" : "Activar"}</button>
            <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  selectors.coursesTableBody.innerHTML = rows;
  if (selectors.coursesSummary) {
    selectors.coursesSummary.textContent = `${filtered.length} curso(s) listados`;
  }
}

function applyFilters(cursos) {
  const query = state.filters.query.trim().toLowerCase();
  const statusFilter = state.filters.status;

  return cursos.filter((curso) => {
    const nombre = (curso.nombre ?? "").toLowerCase();
    const descripcion = (curso.descripcion ?? "").toLowerCase();
    const matchesQuery = !query || nombre.includes(query) || descripcion.includes(query);

    const activo = curso.activo ?? true;
    const matchesStatus =
      statusFilter === "todos" || (statusFilter === "activos" && activo) || (statusFilter === "inactivos" && !activo);

    return matchesQuery && matchesStatus;
  });
}

function registerEventListeners() {
  selectors.newCourseButton?.addEventListener("click", () => {
    state.editingCourse = null;
    openDialog("Nuevo curso");
  });

  selectors.courseDialogClose?.addEventListener("click", () => closeDialog());
  selectors.courseDialogCancel?.addEventListener("click", () => closeDialog());

  selectors.courseDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });

  selectors.coursesTableBody?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) return;

    const row = target.closest("tr[data-course-id]");
    const courseId = row?.dataset.courseId;
    if (!courseId) return;

    const curso = state.cursos.find((item) => String(item.id) === courseId);
    if (!curso) return;

    if (action === "edit") {
      state.editingCourse = curso;
      openDialog("Editar curso", curso);
      return;
    }

    if (action === "toggle") {
      await toggleCourseStatus(curso);
      return;
    }

    if (action === "delete") {
      const confirmDelete = window.confirm("¿Deseas eliminar este curso? Esta acción no se puede deshacer.");
      if (!confirmDelete) return;
      await deleteCourse(curso);
    }
  });

  selectors.searchInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    state.filters.query = target.value;
    renderCursos();
  });

  selectors.statusSelect?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    state.filters.status = target.value;
    renderCursos();
  });

  selectors.courseForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectors.courseForm) return;

    const formData = new FormData(selectors.courseForm);
    const payload = {
      nombre: formData.get("nombre")?.toString().trim() ?? "",
      descripcion: formData.get("descripcion")?.toString().trim() || null,
      imagen_portada: formData.get("imagen_portada")?.toString().trim() || null,
      activo: selectors.courseActiveCheckbox ? selectors.courseActiveCheckbox.checked : true
    };

    if (!payload.nombre) {
      setDialogHint("El nombre del curso es obligatorio.", true);
      return;
    }

    setDialogProcessing(true);

    if (state.editingCourse) {
      await updateCourse(state.editingCourse.id, payload);
    } else {
      await createCourse(payload);
    }

    setDialogProcessing(false);
  });
}

function openDialog(title, curso = null) {
  if (selectors.courseDialogTitle) selectors.courseDialogTitle.textContent = title;
  setDialogHint("");
  if (!selectors.courseForm) return;
  selectors.courseForm.reset();

  if (selectors.courseActiveCheckbox) selectors.courseActiveCheckbox.checked = true;

  if (curso) {
    if (selectors.courseNameInput instanceof HTMLInputElement) selectors.courseNameInput.value = curso.nombre ?? "";
    if (selectors.courseDescriptionInput instanceof HTMLTextAreaElement)
      selectors.courseDescriptionInput.value = curso.descripcion ?? "";
    if (selectors.courseCoverInput instanceof HTMLInputElement)
      selectors.courseCoverInput.value = curso.imagen_portada ?? "";
    if (selectors.courseActiveCheckbox) selectors.courseActiveCheckbox.checked = Boolean(curso.activo);
  }

  selectors.courseDialog?.showModal();
}

function closeDialog() {
  selectors.courseDialog?.close();
  setDialogHint("");
  state.editingCourse = null;
}

function setDialogHint(message, isError = false) {
  if (!selectors.courseDialogHint) return;
  selectors.courseDialogHint.textContent = message;
  selectors.courseDialogHint.classList.toggle("is-error", Boolean(isError));
}

function setDialogProcessing(isProcessing) {
  if (!selectors.courseForm) return;
  const submitButton = selectors.courseForm.querySelector("button[type='submit']");
  if (!(submitButton instanceof HTMLButtonElement)) return;

  submitButton.disabled = isProcessing;
  submitButton.textContent = isProcessing ? "Guardando…" : "Guardar";
}

async function createCourse(payload) {
  try {
    const insertPayload = { ...payload };
    if (!insertPayload.imagen_portada) delete insertPayload.imagen_portada;
    if (!insertPayload.descripcion) delete insertPayload.descripcion;
    insertPayload.activo = Boolean(insertPayload.activo);
    if (state.currentUser?.id) {
      insertPayload.creado_por = state.currentUser.id;
    }

    const { error } = await supabaseDb.from("cursos").insert([insertPayload]);
    if (error) {
      console.error("Error al crear curso", error);
      setDialogHint("No se pudo crear el curso. Revisa la consola para más detalles.", true);
      return;
    }

    setDialogHint("Curso creado correctamente.");
    closeDialog();
    await loadCursos();
  } catch (error) {
    console.error("Error inesperado al crear curso", error);
    setDialogHint("Ocurrió un error inesperado al crear el curso.", true);
  }
}

async function updateCourse(courseId, payload) {
  try {
    const updatePayload = { ...payload };
    if (!updatePayload.imagen_portada) updatePayload.imagen_portada = null;
    if (!updatePayload.descripcion) updatePayload.descripcion = null;
    updatePayload.activo = Boolean(updatePayload.activo);

    const { error } = await supabaseDb.from("cursos").update(updatePayload).eq("id", courseId);
    if (error) {
      console.error("Error al actualizar curso", error);
      setDialogHint("No se pudo actualizar el curso.", true);
      return;
    }

    setDialogHint("Cambios guardados correctamente.");
    closeDialog();
    await loadCursos();
  } catch (error) {
    console.error("Error inesperado al actualizar curso", error);
    setDialogHint("Ocurrió un error inesperado al actualizar el curso.", true);
  }
}

async function toggleCourseStatus(curso) {
  try {
    const { error } = await supabaseDb.from("cursos").update({ activo: !curso.activo }).eq("id", curso.id);
    if (error) {
      console.error("Error al cambiar estado", error);
      window.alert("No se pudo actualizar el estado del curso.");
      return;
    }

    await loadCursos();
  } catch (error) {
    console.error("Error inesperado al cambiar estado", error);
  }
}

async function deleteCourse(curso) {
  try {
    const { error } = await supabaseDb.from("cursos").delete().eq("id", curso.id);
    if (error) {
      console.error("Error al eliminar curso", error);
      window.alert("No se pudo eliminar el curso.");
      return;
    }

    await loadCursos();
  } catch (error) {
    console.error("Error inesperado al eliminar curso", error);
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
