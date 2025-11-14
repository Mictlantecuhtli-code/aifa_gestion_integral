import { supabaseDb, supabaseAdminDb, setSupabaseServiceRoleKey } from "./supabaseClient.js";

function createInitialState() {
  return {
    users: [],
    areas: [],
    jerarquias: [],
    roles: [],
    filters: {
      query: "",
      status: "todos"
    },
    editingUser: null
  };
}

let state = createInitialState();

let selectors = {};

function resolveSelectors() {
  selectors = {
    newUserButton: document.querySelector("#btn-new-user"),
    userDialog: document.querySelector("#user-dialog"),
    dialogTitle: document.querySelector("#dialog-title"),
    dialogClose: document.querySelector("#dialog-close"),
    dialogCancel: document.querySelector("#dialog-cancel"),
    dialogHint: document.querySelector("#dialog-hint"),
    userForm: document.querySelector("#user-form"),
    usersTableBody: document.querySelector("#users-table-body"),
    panelSummary: document.querySelector("#panel-summary"),
    searchInput: document.querySelector("#search-user"),
    statusSelect: document.querySelector("#filter-status"),
    areaSelect: document.querySelector("#user-area"),
    jerarquiaSelect: document.querySelector("#user-rank"),
    roleSelect: document.querySelector("#user-role"),
    activeCheckbox: document.querySelector("#user-active"),
    serviceRoleNotice: document.querySelector("#service-role-notice"),
    serviceRoleConfigureButton: document.querySelector("#configure-service-role"),
    serviceRoleStatus: document.querySelector("#service-role-status")
  };
}

export async function initializeUsersModule() {
  state = createInitialState();
  resolveSelectors();

  if (!selectors.userForm) {
    return;
  }

  await Promise.all([loadCatalogs(), loadUsers()]);
  updateServiceRoleNotice();
  registerEventListeners();
}

async function loadCatalogs() {
  const [areas, jerarquias, roles] = await Promise.all([
    supabaseDb
      .from("areas")
      .select("id,nombre,parent_area_id,orden_visualizacion,nivel")
      .eq("estado", "ACTIVO")
      .order("nivel", { ascending: true })
      .order("orden_visualizacion", { ascending: true }),
    supabaseDb.from("jerarquias").select("id,nombre,nivel").order("nivel", { ascending: true }),
    supabaseDb.from("roles").select("id,nombre").order("nombre", { ascending: true })
  ]);

  if (areas.error) console.error("Error al cargar áreas", areas.error);
  if (jerarquias.error) console.error("Error al cargar jerarquías", jerarquias.error);
  if (roles.error) console.error("Error al cargar roles", roles.error);

  state.areas = areas.data ?? [];
  state.jerarquias = jerarquias.data ?? [];
  state.roles = roles.data ?? [];

  renderAreasCatalog(selectors.areaSelect, state.areas, "Selecciona un área");
  renderCatalog(selectors.jerarquiaSelect, state.jerarquias, "Selecciona una jerarquía", (item) =>
    `${item.nombre} (Nivel ${item.nivel})`
  );
  renderCatalog(selectors.roleSelect, state.roles, "Selecciona un rol (opcional)");
}

function renderCatalog(select, items, placeholder, formatter = (item) => item.nombre) {
  if (!select) return;
  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = placeholder;
  defaultOption.disabled = true;
  defaultOption.selected = true;
  select.append(defaultOption);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = formatter(item);
    select.append(option);
  });
}

function renderAreasCatalog(select, areas, placeholder) {
  if (!select) return;
  select.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = placeholder;
  defaultOption.disabled = true;
  defaultOption.selected = true;
  select.append(defaultOption);

  const hierarchicalAreas = buildAreaHierarchy(areas);

  hierarchicalAreas.forEach(({ area, depth }) => {
    const option = document.createElement("option");
    option.value = area.id;
    const indent = depth > 0 ? `${"\u00A0\u00A0".repeat(depth)}- ` : "";
    option.textContent = `${indent}${area.nombre}`;
    select.append(option);
  });
}

function buildAreaHierarchy(areas) {
  if (!Array.isArray(areas) || !areas.length) return [];

  const childrenByParent = new Map();

  const sortAreas = (list) =>
    list.sort((a, b) => {
      const orderA = typeof a.orden_visualizacion === "number" ? a.orden_visualizacion : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.orden_visualizacion === "number" ? b.orden_visualizacion : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return (a.nombre ?? "").localeCompare(b.nombre ?? "");
    });

  areas.forEach((area) => {
    if (!area || !area.parent_area_id) {
      return;
    }
    const collection = childrenByParent.get(area.parent_area_id) ?? [];
    collection.push(area);
    childrenByParent.set(area.parent_area_id, collection);
  });

  childrenByParent.forEach((list, key) => {
    childrenByParent.set(key, sortAreas(list));
  });

  const rootAreas = sortAreas(
    areas.filter((area) => area && area.nivel === 2)
  );

  const result = [];

  const traverse = (area, depth) => {
    if (!area) return;
    result.push({ area, depth });
    const children = childrenByParent.get(area.id) ?? [];
    children.forEach((child) => traverse(child, depth + 1));
  };

  rootAreas.forEach((area) => traverse(area, 0));

  return result;
}

async function loadUsers() {
  if (selectors.usersTableBody) {
    selectors.usersTableBody.innerHTML = `<tr><td colspan="6" class="table__empty">Cargando usuarios…</td></tr>`;
  }

  const { data, error } = await supabaseDb
    .from("usuarios")
    .select(
      `id,nombre,apellido,correo,activo,created_at,
      areas:area_id(id,nombre),
      jerarquias:jerarquia_id(id,nombre,nivel),
      usuarios_roles(roles:rol_id(id,nombre))`
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error al obtener usuarios", error);
    if (selectors.usersTableBody) {
      selectors.usersTableBody.innerHTML = `<tr><td colspan="6" class="table__empty">Ocurrió un error al cargar los usuarios.</td></tr>`;
    }
    return;
  }

  state.users = (data ?? []).map((user) => ({
    ...user,
    roles: (user.usuarios_roles ?? []).map((entry) => entry.roles).filter(Boolean)
  }));

  renderUsers();
}

function renderUsers() {
  if (!selectors.usersTableBody) return;

  const filteredUsers = applyFilters(state.users);

  if (!filteredUsers.length) {
    selectors.usersTableBody.innerHTML = `<tr><td colspan="6" class="table__empty">No hay usuarios que coincidan con los filtros seleccionados.</td></tr>`;
    if (selectors.panelSummary) selectors.panelSummary.textContent = "";
    return;
  }

  const rows = filteredUsers
    .map((user) => {
      const fullName = `${user.nombre ?? ""} ${user.apellido ?? ""}`.trim();
      const area = user.areas?.nombre ?? "Sin área";
      const jerarquia = user.jerarquias?.nombre ? `${user.jerarquias.nombre}` : "Sin jerarquía";
      const statusClass = user.activo ? "badge badge--success" : "badge badge--danger";
      const statusLabel = user.activo ? "Activo" : "Inactivo";
      const roleLabel = user.roles?.[0]?.nombre ?? "Sin rol";

      return `<tr data-user-id="${user.id}">
        <td>
          <div class="table__primary">${fullName || "Sin nombre"}</div>
          <div class="table__meta">${roleLabel}</div>
        </td>
        <td>${user.correo ?? "-"}</td>
        <td>${area}</td>
        <td>${jerarquia}</td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
        <td>
          <div class="table__actions">
            <button class="btn btn--ghost" data-action="edit" type="button">Editar</button>
            <button class="btn btn--ghost" data-action="toggle" type="button">${user.activo ? "Desactivar" : "Activar"}</button>
            <button class="btn btn--ghost" data-action="delete" type="button">Eliminar</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  selectors.usersTableBody.innerHTML = rows;
  if (selectors.panelSummary) {
    selectors.panelSummary.textContent = `${filteredUsers.length} usuario(s) listados`;
  }
}

function applyFilters(users) {
  const query = state.filters.query.trim().toLowerCase();
  const status = state.filters.status;

  return users.filter((user) => {
    const matchesQuery = !query
      || `${user.nombre ?? ""} ${user.apellido ?? ""}`.toLowerCase().includes(query)
      || (user.correo ?? "").toLowerCase().includes(query)
      || (user.areas?.nombre ?? "").toLowerCase().includes(query);

    const matchesStatus =
      status === "todos" || (status === "activos" && user.activo) || (status === "inactivos" && !user.activo);

    return matchesQuery && matchesStatus;
  });
}

function registerEventListeners() {
  selectors.newUserButton?.addEventListener("click", () => {
    state.editingUser = null;
    openDialog("Nuevo usuario");
  });

  selectors.dialogClose?.addEventListener("click", () => closeDialog());
  selectors.dialogCancel?.addEventListener("click", () => closeDialog());

  selectors.userDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });

  selectors.usersTableBody?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) return;

    const row = target.closest("tr[data-user-id]");
    const userId = row?.dataset.userId;
    if (!userId) return;

    const user = state.users.find((item) => item.id === userId);
    if (!user) return;

    if (action === "edit") {
      state.editingUser = user;
      openDialog("Editar usuario", user);
      return;
    }

    if (action === "toggle") {
      await toggleUserStatus(user);
      return;
    }

    if (action === "delete") {
      const confirmDelete = window.confirm("¿Deseas eliminar este usuario? Esta acción es irreversible.");
      if (!confirmDelete) return;
      await deleteUser(user);
    }
  });

  selectors.searchInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    state.filters.query = target.value;
    renderUsers();
  });

  selectors.statusSelect?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    state.filters.status = target.value;
    renderUsers();
  });

  selectors.serviceRoleConfigureButton?.addEventListener("click", () => {
    promptForServiceRoleKey();
  });

  selectors.userForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectors.userForm) return;
    const formData = new FormData(selectors.userForm);
    const areaIdValue = String(formData.get("area_id") ?? "").trim();
    const payload = {
      nombre: String(formData.get("nombre") ?? "").trim(),
      apellido: String(formData.get("apellido") ?? "").trim(),
      correo: String(formData.get("correo") ?? "").trim(),
      area_id: areaIdValue || null,
      jerarquia_id: Number(formData.get("jerarquia_id")) || null,
      activo: selectors.activeCheckbox?.checked ?? true,
      rol_id: Number(formData.get("rol_id")) || null
    };

    if (!payload.nombre || !payload.apellido || !payload.correo || !payload.area_id || !payload.jerarquia_id) {
      setDialogHint("Completa los campos obligatorios", true);
      return;
    }

    setDialogProcessing(true);

    if (state.editingUser) {
      await updateUser(state.editingUser.id, payload);
    } else {
      await createUser(payload);
    }

    setDialogProcessing(false);
  });
}

function openDialog(title, user = null) {
  if (selectors.dialogTitle) selectors.dialogTitle.textContent = title;
  setDialogHint("");
  if (!selectors.userForm) return;
  selectors.userForm.reset();

  if (selectors.areaSelect) selectors.areaSelect.value = "";
  if (selectors.jerarquiaSelect) selectors.jerarquiaSelect.value = "";
  if (selectors.roleSelect) selectors.roleSelect.value = "";
  if (selectors.activeCheckbox) selectors.activeCheckbox.checked = true;

  if (user) {
    const nameField = selectors.userForm.querySelector("#user-name");
    const lastnameField = selectors.userForm.querySelector("#user-lastname");
    const emailField = selectors.userForm.querySelector("#user-email");

    if (nameField instanceof HTMLInputElement) nameField.value = user.nombre ?? "";
    if (lastnameField instanceof HTMLInputElement) lastnameField.value = user.apellido ?? "";
    if (emailField instanceof HTMLInputElement) emailField.value = user.correo ?? "";
    if (selectors.areaSelect) selectors.areaSelect.value = user.areas?.id ?? "";
    if (selectors.jerarquiaSelect) selectors.jerarquiaSelect.value = user.jerarquias?.id ?? "";
    if (selectors.activeCheckbox) selectors.activeCheckbox.checked = Boolean(user.activo);
    if (selectors.roleSelect) selectors.roleSelect.value = user.roles?.[0]?.id ?? "";
  }

  selectors.userDialog?.showModal();
  updateServiceRoleNotice();
}

function closeDialog() {
  selectors.userDialog?.close();
  setDialogHint("");
  state.editingUser = null;
}

function setDialogHint(message, isError = false) {
  if (!selectors.dialogHint) return;
  selectors.dialogHint.textContent = message;
  selectors.dialogHint.classList.toggle("is-error", Boolean(isError));
}

function setDialogProcessing(isProcessing) {
  if (!selectors.userForm) return;
  const submitButton = selectors.userForm.querySelector("button[type='submit']");
  if (!(submitButton instanceof HTMLButtonElement)) return;

  submitButton.disabled = isProcessing;
  submitButton.textContent = isProcessing ? "Guardando…" : "Guardar";
}

function resolveAuthProvisionErrorMessage(result) {
  switch (result?.errorCode) {
    case "NO_SERVICE_ROLE_KEY":
      return "No hay una Service Role Key configurada para crear usuarios de autenticación.";
    case "INVITE_RATE_LIMIT":
      return "Se alcanzó el límite de invitaciones. Intenta nuevamente en unos minutos.";
    case "INVITE_ERROR":
      return result?.message ?? "No se pudo crear la cuenta de autenticación.";
    case "LIST_USERS_FAILED":
      return "No fue posible verificar si el correo ya estaba registrado.";
    case "MISSING_USER_ID":
      return "La cuenta de autenticación no devolvió un identificador válido.";
    default:
      return result?.message ?? "Ocurrió un problema al preparar la cuenta de autenticación.";
  }
}

async function provisionAuthUser({ nombre, apellido, correo }) {
  const adminClient = supabaseAdminDb.client;
  if (!adminClient) {
    updateServiceRoleNotice();
    return { errorCode: "NO_SERVICE_ROLE_KEY" };
  }

  const metadata = { nombre, apellido };

  try {
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      correo,
      {
        data: metadata
      }
    );

    if (!inviteError && inviteData?.user?.id) {
      return {
        userId: inviteData.user.id,
        invitationSent: Boolean(inviteData?.action_link)
      };
    }

    if (!inviteError) {
      return { errorCode: "MISSING_USER_ID" };
    }

    const normalizedStatus = inviteError.status ?? inviteError.code;
    if (normalizedStatus === 429) {
      return { errorCode: "INVITE_RATE_LIMIT", cause: inviteError };
    }

    if ([400, 404, 409, 422].includes(normalizedStatus)) {
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1,
        filter: `email.eq.${correo}`
      });

      if (listError) {
        console.error("No se pudo consultar usuarios existentes en Supabase Auth", listError);
        return {
          errorCode: "LIST_USERS_FAILED",
          message: listError.message,
          cause: listError
        };
      }

      const existingUser = listData?.users?.[0];
      if (existingUser?.id) {
        return {
          userId: existingUser.id,
          alreadyExists: true,
          invitationSent: false
        };
      }
    }

    console.error("No se pudo crear o localizar la cuenta de autenticación", inviteError);
    return {
      errorCode: "INVITE_ERROR",
      message: inviteError.message,
      cause: inviteError
    };
  } catch (error) {
    console.error("Error inesperado al crear la cuenta de Supabase Auth", error);
    return {
      errorCode: "UNEXPECTED",
      message: error.message,
      cause: error
    };
  }
}

async function createUser(payload) {
  try {
    const authProvision = await provisionAuthUser(payload);

    if (!authProvision?.userId) {
      const message = resolveAuthProvisionErrorMessage(authProvision);
      setDialogHint(message, true);
      if (authProvision?.errorCode === "NO_SERVICE_ROLE_KEY") {
        updateServiceRoleNotice();
      }
      return;
    }

    const newUserId = authProvision.userId;
    const insertPayload = { ...payload, id: newUserId };
    delete insertPayload.rol_id;

    console.group("🔍 DEBUG: Creación de Usuario");
    console.log("🆔 ID de autenticación:", newUserId);
    console.log("📤 Payload completo:", JSON.stringify(insertPayload, null, 2));
    console.table({
      id: { valor: insertPayload.id, tipo: typeof insertPayload.id },
      nombre: { valor: insertPayload.nombre, tipo: typeof insertPayload.nombre },
      apellido: { valor: insertPayload.apellido, tipo: typeof insertPayload.apellido },
      correo: { valor: insertPayload.correo, tipo: typeof insertPayload.correo },
      area_id: { valor: insertPayload.area_id, tipo: typeof insertPayload.area_id },
      jerarquia_id: { valor: insertPayload.jerarquia_id, tipo: typeof insertPayload.jerarquia_id },
      activo: { valor: insertPayload.activo, tipo: typeof insertPayload.activo }
    });
    console.groupEnd();

    const { data, error: userError } = await supabaseDb
      .from("usuarios")
      .insert([insertPayload])
      .select();

    if (userError) {
      console.group("❌ ERROR AL INSERTAR USUARIO");
      console.error("Código:", userError.code);
      console.error("Mensaje:", userError.message);
      console.error("Detalles:", userError.details);
      console.error("Hint:", userError.hint);
      console.error("Objeto completo:", userError);
      console.groupEnd();

      const errorMessages = {
        '23505': "Este correo electrónico ya está registrado.",
        '42501': "No tienes permisos para crear usuarios.",
        '23503': "El área o jerarquía seleccionada no existe.",
        '23502': "Falta un campo obligatorio.",
        '22P02': "Tipo de dato incorrecto en algún campo.",
        '409': "Conflicto con los datos existentes."
      };

      const message = errorMessages[userError.code] || `Error: ${userError.message}`;
      setDialogHint(message, true);
      return;
    }

    console.log("✅ Usuario creado exitosamente:", data);

    if (payload.rol_id) {
      console.log("🎭 Asignando rol:", payload.rol_id);

      const { error: roleError } = await supabaseDb
        .from("usuarios_roles")
        .insert([
          {
            usuario_id: newUserId,
            rol_id: payload.rol_id
          }
        ])
        .select();

      if (roleError) {
        console.error("⚠️ Error al asignar rol:", roleError);
        setDialogHint("Usuario creado, pero no se pudo asignar el rol.", true);
        await loadUsers();
        return;
      }

      console.log("✅ Rol asignado correctamente");
    }

    const successMessages = ["Usuario creado correctamente."];
    if (authProvision.invitationSent) {
      successMessages.push("Se envió una invitación al correo registrado para que active su cuenta.");
    } else if (authProvision.alreadyExists) {
      successMessages.push("Se reutilizó la cuenta existente en Supabase Auth.");
    }

    setDialogHint(successMessages.join(" "));
    closeDialog();
    await loadUsers();
  } catch (error) {
    console.group("💥 ERROR INESPERADO");
    console.error("Tipo:", error.constructor.name);
    console.error("Mensaje:", error.message);
    console.error("Stack:", error.stack);
    console.error("Objeto completo:", error);
    console.groupEnd();

    setDialogHint("Ocurrió un error inesperado al crear el usuario.", true);
  }
}
async function updateUser(userId, payload) {
  try {
    const updatePayload = { ...payload };
    delete updatePayload.rol_id;

    const { error: updateError } = await supabaseDb.from("usuarios").update(updatePayload).eq("id", userId);
    if (updateError) {
      console.error("Error al actualizar usuario", updateError);
      setDialogHint("No se pudo actualizar el usuario.", true);
      return;
    }

    await supabaseDb.from("usuarios_roles").delete().eq("usuario_id", userId);

    if (payload.rol_id) {
      const { error: roleError } = await supabaseDb.from("usuarios_roles").insert([
        {
          usuario_id: userId,
          rol_id: payload.rol_id
        }
      ]);
      if (roleError) {
        console.error("Error al actualizar rol", roleError);
        setDialogHint("Usuario actualizado, pero hubo problemas al asignar el rol.", true);
      }
    }

    setDialogHint("Cambios guardados correctamente.");
    closeDialog();
    await loadUsers();
  } catch (error) {
    console.error("Error inesperado al actualizar usuario", error);
    setDialogHint("Ocurrió un error inesperado al actualizar el usuario.", true);
  }
}

async function toggleUserStatus(user) {
  try {
    const { error } = await supabaseDb
      .from("usuarios")
      .update({ activo: !user.activo })
      .eq("id", user.id);

    if (error) {
      console.error("Error al cambiar estado", error);
      window.alert("No se pudo actualizar el estado del usuario.");
      return;
    }

    await loadUsers();
  } catch (error) {
    console.error("Error inesperado al cambiar estado", error);
  }
}

async function deleteUser(user) {
  try {
    const { error: rolesError } = await supabaseDb
      .from("usuarios_roles")
      .delete()
      .eq("usuario_id", user.id);

    if (rolesError) {
      console.error("Error al eliminar roles del usuario", rolesError);
      window.alert("No se pudieron eliminar los roles del usuario.");
      return;
    }

    const { error: userError } = await supabaseDb.from("usuarios").delete().eq("id", user.id);
    if (userError) {
      console.error("Error al eliminar usuario", userError);
      window.alert("No se pudo eliminar el usuario.");
      return;
    }

    await loadUsers();
  } catch (error) {
    console.error("Error inesperado al eliminar usuario", error);
  }
}

function updateServiceRoleNotice() {
  const hasAdminAccess = supabaseAdminDb.hasAccess();
  if (selectors.serviceRoleNotice) {
    selectors.serviceRoleNotice.classList.toggle("is-hidden", hasAdminAccess);
  }
  if (selectors.serviceRoleStatus) {
    selectors.serviceRoleStatus.textContent = hasAdminAccess
      ? "La creación de usuarios nuevos está habilitada."
      : "Para crear usuarios nuevos se requiere configurar la Service Role Key.";
  }
}

function promptForServiceRoleKey() {
  const hasAccess = supabaseAdminDb.hasAccess();
  const placeholder = hasAccess ? "********" : "";
  const userInput = window.prompt(
    "Ingresa la Service Role Key de Supabase para permitir la creación de cuentas de autenticación.\n\nDeja el campo en blanco para borrar la configuración almacenada.",
    placeholder
  );

  if (userInput === null) {
    return;
  }

  const trimmed = userInput.trim();
  if (!trimmed) {
    setSupabaseServiceRoleKey("");
    updateServiceRoleNotice();
    window.alert("Se eliminó la Service Role Key configurada.");
    return;
  }

  if (hasAccess && trimmed === placeholder) {
    return;
  }

  setSupabaseServiceRoleKey(trimmed);
  updateServiceRoleNotice();
  window.alert("Service Role Key configurada correctamente. Puedes volver a crear usuarios.");
}

