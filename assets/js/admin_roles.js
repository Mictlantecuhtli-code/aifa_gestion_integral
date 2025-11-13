import { supabaseDb } from "./supabaseClient.js";

const state = {
  roles: [],
  filters: {
    query: "",
    status: "todos"
  },
  editingRole: null,
  currentUser: null
};

const selectors = {
  logoutButton: document.querySelector("#btn-logout"),
  newRoleButton: document.querySelector("#btn-new-role"),
  roleDialog: document.querySelector("#role-dialog"),
  roleDialogTitle: document.querySelector("#role-dialog-title"),
  roleDialogClose: document.querySelector("#role-dialog-close"),
  roleDialogCancel: document.querySelector("#role-dialog-cancel"),
  roleDialogHint: document.querySelector("#role-dialog-hint"),
  roleForm: document.querySelector("#role-form"),
  rolesTableBody: document.querySelector("#roles-table-body"),
  rolesSummary: document.querySelector("#roles-summary"),
  searchInput: document.querySelector("#search-role"),
  statusSelect: document.querySelector("#filter-role-status"),
  roleNameInput: document.querySelector("#role-name"),
  roleDescriptionInput: document.querySelector("#role-description"),
  roleActiveCheckbox: document.querySelector("#role-active")
};

async function ensureAuthenticated() {
  const {
    data: { session }
  } = await supabaseDb.auth.getSession();

  if (!session) {
    window.location.replace("index.html");
    return null;
  }

  const { data, error } = await supabaseDb
    .from("usuarios_roles")
    .select("roles:rol_id(nombre)")
    .eq("usuario_id", session.user.id);

  if (error) {
    console.error("Error al verificar permisos", error);
    window.location.replace("index.html");
    return null;
  }

  const isAdmin = (data ?? []).some((row) => (row.roles?.nombre ?? "").toLowerCase() === "administrador");
  if (!isAdmin) {
    await supabaseDb.auth.signOut();
    window.location.replace("index.html");
    return null;
  }

  return session.user;
}

async function initialize() {
  const user = await ensureAuthenticated();
  if (!user) return;

  state.currentUser = user;
  await loadRoles();
  registerEventListeners();
}

async function loadRoles() {
  if (selectors.rolesTableBody) {
    selectors.rolesTableBody.innerHTML = `<tr><td colspan="5" class="table__empty">Cargando roles…</td></tr>`;
  }

  const { data, error } = await supabaseDb
    .from("roles")
    .select("id,nombre,descripcion,activo,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al cargar roles", error);
    if (selectors.rolesTableBody) {
      selectors.rolesTableBody.innerHTML = `<tr><td colspan="5" class="table__empty">Ocurrió un error al cargar los roles.</td></tr>`;
    }
    if (selectors.rolesSummary) selectors.rolesSummary.textContent = "";
    return;
  }

  state.roles = data ?? [];
  renderRoles();
}

function renderRoles() {
  if (!selectors.rolesTableBody) return;

  const filteredRoles = applyFilters(state.roles);

  if (!filteredRoles.length) {
    selectors.rolesTableBody.innerHTML = `<tr><td colspan="5" class="table__empty">No hay roles que coincidan con los filtros seleccionados.</td></tr>`;
    if (selectors.rolesSummary) selectors.rolesSummary.textContent = "";
    return;
  }

  const rows = filteredRoles
    .map((role) => {
      const status = getRoleStatus(role);
      const createdAt = role.created_at ? new Date(role.created_at).toLocaleDateString() : "-";

      return `<tr data-role-id="${role.id}">
        <td>
          <div class="table__primary">${role.nombre ?? "Sin nombre"}</div>
          <div class="table__meta">${role.descripcion ? escapeHtml(role.descripcion) : "Sin descripción"}</div>
        </td>
        <td>${role.descripcion ? escapeHtml(role.descripcion) : "-"}</td>
        <td><span class="${status.className}">${status.label}</span></td>
        <td>${createdAt}</td>
        <td>
          <div class="table__actions">
            <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
            <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  selectors.rolesTableBody.innerHTML = rows;
  if (selectors.rolesSummary) {
    selectors.rolesSummary.textContent = `${filteredRoles.length} rol(es) listados`;
  }
}

function applyFilters(roles) {
  const query = state.filters.query.trim().toLowerCase();
  const statusFilter = state.filters.status;

  return roles.filter((role) => {
    const nombre = (role.nombre ?? "").toLowerCase();
    const descripcion = (role.descripcion ?? "").toLowerCase();
    const matchesQuery = !query || nombre.includes(query) || descripcion.includes(query);

    const activo = role.activo ?? true;
    const matchesStatus =
      statusFilter === "todos" || (statusFilter === "activos" && activo) || (statusFilter === "inactivos" && !activo);

    return matchesQuery && matchesStatus;
  });
}

function registerEventListeners() {
  selectors.logoutButton?.addEventListener("click", async () => {
    await supabaseDb.auth.signOut();
    window.location.replace("index.html");
  });

  selectors.newRoleButton?.addEventListener("click", () => {
    state.editingRole = null;
    openDialog("Nuevo rol");
  });

  selectors.roleDialogClose?.addEventListener("click", () => closeDialog());
  selectors.roleDialogCancel?.addEventListener("click", () => closeDialog());

  selectors.roleDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });

  selectors.rolesTableBody?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) return;

    const row = target.closest("tr[data-role-id]");
    const roleId = row?.dataset.roleId;
    if (!roleId) return;

    const role = state.roles.find((item) => String(item.id) === roleId);
    if (!role) return;

    if (action === "edit") {
      state.editingRole = role;
      openDialog("Editar rol", role);
      return;
    }

    if (action === "delete") {
      const confirmDelete = window.confirm("¿Deseas eliminar este rol? Esta acción no se puede deshacer.");
      if (!confirmDelete) return;
      await deleteRole(role);
    }
  });

  selectors.searchInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    state.filters.query = target.value;
    renderRoles();
  });

  selectors.statusSelect?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    state.filters.status = target.value;
    renderRoles();
  });

  selectors.roleForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectors.roleForm) return;

    const formData = new FormData(selectors.roleForm);
    const payload = {
      nombre: String(formData.get("nombre") ?? "").trim(),
      descripcion: String(formData.get("descripcion") ?? "").trim(),
      activo: selectors.roleActiveCheckbox?.checked ?? true
    };

    if (!validateRole(payload)) return;

    setDialogProcessing(true);

    if (state.editingRole) {
      await updateRole(state.editingRole.id, payload);
    } else {
      await createRole(payload);
    }

    setDialogProcessing(false);
  });
}

function openDialog(title, role = null) {
  if (selectors.roleDialogTitle) selectors.roleDialogTitle.textContent = title;
  setDialogHint("");
  selectors.roleForm?.reset();

  if (selectors.roleActiveCheckbox) selectors.roleActiveCheckbox.checked = true;

  if (role) {
    if (selectors.roleNameInput) selectors.roleNameInput.value = role.nombre ?? "";
    if (selectors.roleDescriptionInput) selectors.roleDescriptionInput.value = role.descripcion ?? "";
    if (selectors.roleActiveCheckbox) selectors.roleActiveCheckbox.checked = role.activo ?? true;
  }

  selectors.roleDialog?.showModal();
}

function closeDialog() {
  selectors.roleDialog?.close();
  setDialogHint("");
  state.editingRole = null;
}

function setDialogHint(message, isError = false) {
  if (!selectors.roleDialogHint) return;
  selectors.roleDialogHint.textContent = message;
  selectors.roleDialogHint.classList.toggle("is-error", Boolean(isError));
}

function setDialogProcessing(isProcessing) {
  if (!selectors.roleForm) return;
  const submitButton = selectors.roleForm.querySelector("button[type='submit']");
  if (!(submitButton instanceof HTMLButtonElement)) return;

  submitButton.disabled = isProcessing;
  submitButton.textContent = isProcessing ? "Guardando…" : "Guardar";
}

function validateRole(payload) {
  if (!payload.nombre) {
    setDialogHint("El nombre es obligatorio.", true);
    return false;
  }

  if (payload.nombre.length < 3) {
    setDialogHint("El nombre debe tener al menos 3 caracteres.", true);
    return false;
  }

  if (payload.descripcion && payload.descripcion.length < 10) {
    setDialogHint("La descripción debe tener al menos 10 caracteres si se especifica.", true);
    return false;
  }

  setDialogHint("");
  return true;
}

function getRoleStatus(role) {
  const isActive = role.activo ?? true;
  return {
    label: isActive ? "Activo" : "Inactivo",
    className: isActive ? "badge badge--success" : "badge badge--danger"
  };
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

async function createRole(payload) {
  try {
    const insertPayload = { ...payload };
    if (state.currentUser?.id) insertPayload.creado_por = state.currentUser.id;

    const { error } = await supabaseDb.from("roles").insert([insertPayload]);
    if (error) {
      console.error("Error al crear rol", error);
      setDialogHint("No se pudo crear el rol. Revisa la consola para más detalles.", true);
      return;
    }

    setDialogHint("Rol creado correctamente.");
    closeDialog();
    await loadRoles();
  } catch (error) {
    console.error("Error inesperado al crear rol", error);
    setDialogHint("Ocurrió un error inesperado al crear el rol.", true);
  }
}

async function updateRole(roleId, payload) {
  try {
    const updatePayload = { ...payload };
    const { error } = await supabaseDb.from("roles").update(updatePayload).eq("id", roleId);
    if (error) {
      console.error("Error al actualizar rol", error);
      setDialogHint("No se pudo actualizar el rol.", true);
      return;
    }

    setDialogHint("Cambios guardados correctamente.");
    closeDialog();
    await loadRoles();
  } catch (error) {
    console.error("Error inesperado al actualizar rol", error);
    setDialogHint("Ocurrió un error inesperado al actualizar el rol.", true);
  }
}

async function deleteRole(role) {
  try {
    const { error: deleteAssignmentsError } = await supabaseDb
      .from("roles_permisos")
      .delete()
      .eq("rol_id", role.id);

    if (deleteAssignmentsError) {
      console.error("Error al eliminar permisos del rol", deleteAssignmentsError);
      window.alert("No se pudieron eliminar los permisos asignados al rol.");
      return;
    }

    const { error: deleteUserRolesError } = await supabaseDb
      .from("usuarios_roles")
      .delete()
      .eq("rol_id", role.id);

    if (deleteUserRolesError) {
      console.error("Error al desvincular usuarios del rol", deleteUserRolesError);
      window.alert("No se pudieron desvincular los usuarios del rol.");
      return;
    }

    const { error } = await supabaseDb.from("roles").delete().eq("id", role.id);
    if (error) {
      console.error("Error al eliminar rol", error);
      window.alert("No se pudo eliminar el rol.");
      return;
    }

    await loadRoles();
  } catch (error) {
    console.error("Error inesperado al eliminar rol", error);
  }
}

initialize();
