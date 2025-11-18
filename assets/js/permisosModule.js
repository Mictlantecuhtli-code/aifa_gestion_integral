import { supabaseDb } from "./supabaseClient.js";

function createInitialState() {
  return {
    permissions: [],
    filters: {
      query: ""
    },
    editingPermission: null
  };
}

let state = createInitialState();

let selectors = {};

function resolveSelectors() {
  selectors = {
    newPermissionButton: document.querySelector("#btn-new-permission"),
    permissionDialog: document.querySelector("#permission-dialog"),
    permissionDialogTitle: document.querySelector("#permission-dialog-title"),
    permissionDialogClose: document.querySelector("#permission-dialog-close"),
    permissionDialogCancel: document.querySelector("#permission-dialog-cancel"),
    permissionDialogHint: document.querySelector("#permission-dialog-hint"),
    permissionForm: document.querySelector("#permission-form"),
    permissionsTableBody: document.querySelector("#permissions-table-body"),
    permissionsSummary: document.querySelector("#permissions-summary"),
    searchInput: document.querySelector("#search-permission"),
    permissionCodeInput: document.querySelector("#permission-code"),
    permissionDescriptionInput: document.querySelector("#permission-description")
  };
}

export async function initializePermisosModule() {
  state = createInitialState();
  resolveSelectors();

  if (!selectors.permissionForm) {
    return;
  }

  await loadPermissions();
  registerEventListeners();
}

async function loadPermissions() {
  if (selectors.permissionsTableBody) {
    selectors.permissionsTableBody.innerHTML = `<tr><td colspan="3" class="table__empty">Cargando permisos…</td></tr>`;
  }

  const { data, error } = await supabaseDb.from("permisos").select("id,codigo,descripcion").order("codigo", { ascending: true });

  if (error) {
    console.error("Error al cargar permisos", error);
    if (selectors.permissionsTableBody) {
      selectors.permissionsTableBody.innerHTML = `<tr><td colspan="3" class="table__empty">Ocurrió un error al cargar los permisos.</td></tr>`;
    }
    if (selectors.permissionsSummary) selectors.permissionsSummary.textContent = "";
    return;
  }

  state.permissions = data ?? [];
  renderPermissions();
}

function renderPermissions() {
  if (!selectors.permissionsTableBody) return;

  const filteredPermissions = applyFilters(state.permissions);

  if (!filteredPermissions.length) {
    selectors.permissionsTableBody.innerHTML = `<tr><td colspan="3" class="table__empty">No hay permisos que coincidan con tu búsqueda.</td></tr>`;
    if (selectors.permissionsSummary) selectors.permissionsSummary.textContent = "";
    return;
  }

  const rows = filteredPermissions
    .map((permission) => {
      return `<tr data-permission-id="${permission.id}">
        <td>
          <div class="table__primary">${permission.codigo ?? "Sin código"}</div>
          <div class="table__meta">${permission.descripcion ? escapeHtml(permission.descripcion) : "Sin descripción"}</div>
        </td>
        <td>${permission.descripcion ? escapeHtml(permission.descripcion) : "-"}</td>
        <td>
          <div class="table__actions">
            <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
            <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  selectors.permissionsTableBody.innerHTML = rows;
  if (selectors.permissionsSummary) {
    selectors.permissionsSummary.textContent = `${filteredPermissions.length} permiso(s) listados`;
  }
}

function applyFilters(permissions) {
  const query = state.filters.query.trim().toLowerCase();
  if (!query) return permissions;

  return permissions.filter((permission) => {
    const codigo = (permission.codigo ?? "").toLowerCase();
    const descripcion = (permission.descripcion ?? "").toLowerCase();
    return codigo.includes(query) || descripcion.includes(query);
  });
}

function registerEventListeners() {
  selectors.newPermissionButton?.addEventListener("click", () => {
    state.editingPermission = null;
    openDialog("Nuevo permiso");
  });

  selectors.permissionDialogClose?.addEventListener("click", () => closeDialog());
  selectors.permissionDialogCancel?.addEventListener("click", () => closeDialog());

  selectors.permissionDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });

  selectors.permissionsTableBody?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) return;

    const row = target.closest("tr[data-permission-id]");
    const permissionId = row?.dataset.permissionId;
    if (!permissionId) return;

    const permission = state.permissions.find((item) => String(item.id) === permissionId);
    if (!permission) return;

    if (action === "edit") {
      state.editingPermission = permission;
      openDialog("Editar permiso", permission);
      return;
    }

    if (action === "delete") {
      const confirmDelete = window.confirm("¿Deseas eliminar este permiso? Esta acción no se puede deshacer.");
      if (!confirmDelete) return;
      await deletePermission(permission);
    }
  });

  selectors.searchInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    state.filters.query = target.value;
    renderPermissions();
  });

  selectors.permissionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectors.permissionForm) return;

    const formData = new FormData(selectors.permissionForm);
    const payload = {
      codigo: String(formData.get("codigo") ?? "").trim().toUpperCase(),
      descripcion: String(formData.get("descripcion") ?? "").trim()
    };

    if (!validatePermission(payload)) return;

    setDialogProcessing(true);

    if (state.editingPermission) {
      await updatePermission(state.editingPermission.id, payload);
    } else {
      await createPermission(payload);
    }

    setDialogProcessing(false);
  });
}

function openDialog(title, permission = null) {
  if (selectors.permissionDialogTitle) selectors.permissionDialogTitle.textContent = title;
  setDialogHint("");
  selectors.permissionForm?.reset();

  if (permission) {
    if (selectors.permissionCodeInput) selectors.permissionCodeInput.value = permission.codigo ?? "";
    if (selectors.permissionDescriptionInput) selectors.permissionDescriptionInput.value = permission.descripcion ?? "";
  }

  selectors.permissionDialog?.showModal();
}

function closeDialog() {
  selectors.permissionDialog?.close();
  setDialogHint("");
  state.editingPermission = null;
}

function setDialogHint(message, isError = false) {
  if (!selectors.permissionDialogHint) return;
  selectors.permissionDialogHint.textContent = message;
  selectors.permissionDialogHint.classList.toggle("is-error", Boolean(isError));
}

function setDialogProcessing(isProcessing) {
  if (!selectors.permissionForm) return;
  const submitButton = selectors.permissionForm.querySelector("button[type='submit']");
  if (!(submitButton instanceof HTMLButtonElement)) return;

  submitButton.disabled = isProcessing;
  submitButton.textContent = isProcessing ? "Guardando…" : "Guardar";
}

function validatePermission(payload) {
  if (!payload.codigo) {
    setDialogHint("El código es obligatorio.", true);
    return false;
  }

  if (payload.codigo.length < 3) {
    setDialogHint("El código debe tener al menos 3 caracteres.", true);
    return false;
  }

  if (!payload.descripcion) {
    setDialogHint("La descripción es obligatoria.", true);
    return false;
  }

  if (payload.descripcion.length < 10) {
    setDialogHint("La descripción debe tener al menos 10 caracteres.", true);
    return false;
  }

  setDialogHint("");
  return true;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (match) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[match] ?? match;
  });
}

async function createPermission(payload) {
  try {
    const { error } = await supabaseDb.from("permisos").insert([payload]);
    if (error) {
      console.error("Error al crear permiso", error);
      setDialogHint("No se pudo crear el permiso. Revisa la consola para más detalles.", true);
      return;
    }

    setDialogHint("Permiso creado correctamente.");
    closeDialog();
    await loadPermissions();
  } catch (error) {
    console.error("Error inesperado al crear permiso", error);
    setDialogHint("Ocurrió un error inesperado al crear el permiso.", true);
  }
}

async function updatePermission(permissionId, payload) {
  try {
    const { error } = await supabaseDb.from("permisos").update(payload).eq("id", permissionId);
    if (error) {
      console.error("Error al actualizar permiso", error);
      setDialogHint("No se pudo actualizar el permiso.", true);
      return;
    }

    setDialogHint("Cambios guardados correctamente.");
    closeDialog();
    await loadPermissions();
  } catch (error) {
    console.error("Error inesperado al actualizar permiso", error);
    setDialogHint("Ocurrió un error inesperado al actualizar el permiso.", true);
  }
}

async function deletePermission(permission) {
  try {
    const { error: deleteAssignmentsError } = await supabaseDb
      .from("roles_permisos")
      .delete()
      .eq("permiso_id", permission.id);

    if (deleteAssignmentsError) {
      console.error("Error al eliminar asignaciones del permiso", deleteAssignmentsError);
      window.alert("No se pudieron eliminar las asignaciones del permiso.");
      return;
    }

    const { error } = await supabaseDb.from("permisos").delete().eq("id", permission.id);
    if (error) {
      console.error("Error al eliminar permiso", error);
      window.alert("No se pudo eliminar el permiso.");
      return;
    }

    await loadPermissions();
  } catch (error) {
    console.error("Error inesperado al eliminar permiso", error);
  }
}
