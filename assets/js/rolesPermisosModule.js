import { supabaseDb } from "./supabaseClient.js";

function createInitialState() {
  return {
    roles: [],
    permissions: [],
    assignedPermissions: new Set(),
    selectedRoleId: "",
    filters: {
      query: ""
    },
    isDirty: false
  };
}

let state = createInitialState();

let selectors = {};

function resolveSelectors() {
  selectors = {
    saveButton: document.querySelector("#btn-save-role-permissions"),
    roleSelect: document.querySelector("#select-role"),
    searchInput: document.querySelector("#search-permission-role"),
    tableBody: document.querySelector("#role-permissions-table-body"),
    summary: document.querySelector("#role-permissions-summary"),
    confirmDialog: document.querySelector("#confirm-dialog"),
    confirmForm: document.querySelector("#confirm-form"),
    confirmCancel: document.querySelector("#confirm-cancel"),
    confirmMessage: document.querySelector("#confirm-message")
  };
}

export async function initializeRolesPermisosModule() {
  state = createInitialState();
  resolveSelectors();

  if (!selectors.roleSelect) {
    return;
  }

  await Promise.all([loadRoles(), loadPermissions()]);
  registerEventListeners();
  renderPermissions();
}

async function loadRoles() {
  const { data, error } = await supabaseDb.from("roles").select("id,nombre").order("nombre", { ascending: true });
  if (error) {
    console.error("Error al cargar roles", error);
    return;
  }

  state.roles = data ?? [];
  renderRoleOptions();
}

async function loadPermissions() {
  const { data, error } = await supabaseDb
    .from("permisos")
    .select("id,codigo,descripcion")
    .order("codigo", { ascending: true });

  if (error) {
    console.error("Error al cargar permisos", error);
    return;
  }

  state.permissions = data ?? [];
}

async function loadAssignedPermissions(roleId) {
  if (!roleId) {
    state.assignedPermissions = new Set();
    state.isDirty = false;
    renderPermissions();
    return;
  }

  const { data, error } = await supabaseDb
    .from("roles_permisos")
    .select("permiso_id")
    .eq("rol_id", roleId);

  if (error) {
    console.error("Error al cargar permisos asignados", error);
    state.assignedPermissions = new Set();
  } else {
    state.assignedPermissions = new Set((data ?? []).map((item) => Number(item.permiso_id)));
  }

  state.isDirty = false;
  renderPermissions();
}

function renderRoleOptions() {
  if (!selectors.roleSelect) return;

  const currentValue = selectors.roleSelect.value;
  selectors.roleSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleccione un rol";
  placeholder.disabled = true;
  placeholder.selected = true;
  selectors.roleSelect.append(placeholder);

  state.roles.forEach((role) => {
    const option = document.createElement("option");
    option.value = String(role.id);
    option.textContent = role.nombre ?? `Rol ${role.id}`;
    selectors.roleSelect?.append(option);
  });

  if (currentValue && state.roles.some((role) => String(role.id) === currentValue)) {
    selectors.roleSelect.value = currentValue;
    placeholder.selected = false;
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

function renderPermissions() {
  if (!selectors.tableBody) return;

  if (!state.selectedRoleId) {
    selectors.tableBody.innerHTML = `<tr><td colspan="3" class="table__empty">Seleccione un rol para ver los permisos.</td></tr>`;
    if (selectors.summary) selectors.summary.textContent = "";
    return;
  }

  const filteredPermissions = applyFilters(state.permissions);

  if (!filteredPermissions.length) {
    selectors.tableBody.innerHTML = `<tr><td colspan="3" class="table__empty">No hay permisos que coincidan con tu búsqueda.</td></tr>`;
    if (selectors.summary) selectors.summary.textContent = "";
    return;
  }

  const rows = filteredPermissions
    .map((permission) => {
      const isAssigned = state.assignedPermissions.has(Number(permission.id));
      const badgeClass = isAssigned ? "badge badge--success" : "badge";
      const badgeLabel = isAssigned ? "Asignado" : "No asignado";

      return `<tr data-permission-id="${permission.id}" ${isAssigned ? "class=\"is-selected\"" : ""} aria-selected="${isAssigned}">
        <td>
          <div class="table__primary">${permission.codigo ?? "Sin código"}</div>
          <div class="table__meta">${permission.descripcion ? escapeHtml(permission.descripcion) : "Sin descripción"}</div>
        </td>
        <td>${permission.descripcion ? escapeHtml(permission.descripcion) : "-"}</td>
        <td>
          <div class="form__field form__field--inline">
            <input type="checkbox" ${isAssigned ? "checked" : ""} />
            <span>${badgeLabel}</span>
          </div>
          <span class="${badgeClass}">${badgeLabel}</span>
        </td>
      </tr>`;
    })
    .join("");

  selectors.tableBody.innerHTML = rows;
  updateSummary(filteredPermissions.length);
}

function updateSummary(totalVisible) {
  if (!selectors.summary) return;

  const totalAssigned = state.assignedPermissions.size;
  const totalPermissions = state.permissions.length;
  const summaryParts = [
    `${totalAssigned} permiso(s) asignados`,
    `${totalPermissions} permiso(s) totales`
  ];

  if (state.filters.query) {
    summaryParts.push(`${totalVisible} resultado(s) visibles`);
  }

  selectors.summary.textContent = summaryParts.join(" · ");
}

function registerEventListeners() {
  selectors.roleSelect?.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    state.selectedRoleId = target.value;
    state.filters.query = "";
    if (selectors.searchInput) selectors.searchInput.value = "";
    await loadAssignedPermissions(state.selectedRoleId);
  });

  selectors.searchInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    state.filters.query = target.value;
    renderPermissions();
  });

  selectors.tableBody?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;

    const row = target.closest("tr[data-permission-id]");
    const permissionId = row?.dataset.permissionId;
    if (!permissionId) return;

    const numericId = Number(permissionId);
    if (target.checked) {
      state.assignedPermissions.add(numericId);
    } else {
      state.assignedPermissions.delete(numericId);
    }

    state.isDirty = true;
    renderPermissions();
  });

  selectors.saveButton?.addEventListener("click", () => {
    if (!state.selectedRoleId) {
      window.alert("Selecciona un rol antes de guardar los cambios.");
      return;
    }

    if (!state.isDirty) {
      window.alert("No hay cambios por guardar.");
      return;
    }

    openConfirmDialog();
  });

  selectors.confirmCancel?.addEventListener("click", () => closeConfirmDialog());

  selectors.confirmDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeConfirmDialog();
  });

  selectors.confirmForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveRolePermissions();
  });
}

function openConfirmDialog() {
  if (selectors.confirmMessage) {
    selectors.confirmMessage.textContent = "¿Deseas guardar los cambios de permisos?";
  }
  selectors.confirmDialog?.showModal();
}

function closeConfirmDialog() {
  selectors.confirmDialog?.close();
}

async function saveRolePermissions() {
  try {
    closeConfirmDialog();
    const roleId = Number(state.selectedRoleId);

    const { error: deleteError } = await supabaseDb
      .from("roles_permisos")
      .delete()
      .eq("rol_id", roleId);

    if (deleteError) {
      console.error("Error al limpiar permisos", deleteError);
      window.alert("No se pudieron guardar los cambios del rol.");
      return;
    }

    const assignments = Array.from(state.assignedPermissions).map((permisoId) => ({
      rol_id: roleId,
      permiso_id: permisoId
    }));

    if (assignments.length) {
      const { error: insertError } = await supabaseDb.from("roles_permisos").insert(assignments);
      if (insertError) {
        console.error("Error al asignar permisos", insertError);
        window.alert("Ocurrió un problema al asignar los permisos.");
        return;
      }
    }

    state.isDirty = false;
    renderPermissions();
    window.alert("Permisos actualizados correctamente.");
  } catch (error) {
    console.error("Error inesperado al guardar permisos", error);
    window.alert("Ocurrió un error inesperado al guardar los permisos.");
  }
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
