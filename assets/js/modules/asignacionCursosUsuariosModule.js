import { supabaseDb } from "../supabaseClient.js";
import { normalizeRoles } from "../constants/roles.js";

const statusClasses = {
  success: "is-success",
  error: "is-error",
  info: "is-info"
};

function createUiState() {
  return {
    adminId: null,
    isLoading: false
  };
}

let uiState = createUiState();
let selectors = {};

function resolveSelectors() {
  selectors = {
    userSelect: document.querySelector("#select-usuario-asignacion"),
    courseSelect: document.querySelector("#select-curso-asignacion"),
    assignButton: document.querySelector("#btn-asignar-curso"),
    refreshButton: document.querySelector("#btn-refresh-asignacion-cursos"),
    statusMessage: document.querySelector("#asignacion-estado")
  };
}

/**
 * Recupera los usuarios activos disponibles para asignación de cursos.
 * @returns {Promise<{success: boolean, data?: any[], message?: string}>}
 */
export async function obtenerUsuariosActivos() {
  const { data, error } = await supabaseDb
    .from("usuarios")
    .select("id,nombre,apellido,correo,activo")
    .eq("activo", true)
    .order("nombre", { ascending: true })
    .order("apellido", { ascending: true });

  if (error) {
    console.error("Error al obtener usuarios activos", error);
    return { success: false, message: "No fue posible recuperar los usuarios activos." };
  }

  return { success: true, data: data ?? [] };
}

/**
 * Recupera los cursos activos disponibles para asignación.
 * @returns {Promise<{success: boolean, data?: any[], message?: string}>}
 */
export async function obtenerCursosActivos() {
  const { data, error } = await supabaseDb
    .from("cursos")
    .select("id,nombre,descripcion,activo")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error al obtener cursos activos", error);
    return { success: false, message: "No fue posible recuperar los cursos activos." };
  }

  return { success: true, data: data ?? [] };
}

/**
 * Verifica si un usuario ya tiene asignado un curso específico.
 * @param {string} cursoId
 * @param {string} usuarioId
 * @returns {Promise<{success: boolean, existe: boolean, message?: string}>}
 */
export async function validarAsignacionDuplicada(cursoId, usuarioId) {
  const { data, error } = await supabaseDb
    .from("cursos_usuarios")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("curso_id", cursoId)
    .limit(1);

  if (error) {
    console.error("Error al validar duplicados", error);
    return { success: false, existe: false, message: "No fue posible validar la asignación." };
  }

  return { success: true, existe: Boolean(data?.length) };
}

/**
 * Inserta una nueva asignación de curso a usuario.
 * @param {string} cursoId
 * @param {string} usuarioId
 * @param {string} adminId
 * @returns {Promise<{success: boolean, data?: any, message?: string}>}
 */
export async function insertarAsignacion(cursoId, usuarioId, adminId) {
  const { data, error } = await supabaseDb
    .from("cursos_usuarios")
    .insert({
      curso_id: cursoId,
      usuario_id: usuarioId,
      creado_por: adminId,
      estatus: "ASIGNADO",
      progreso: 0
    })
    .select()
    .single();

  if (error) {
    console.error("Error al crear asignación", error);
    return { success: false, message: "No se pudo asignar el curso al usuario." };
  }

  return { success: true, data };
}

/**
 * Registra la auditoría de asignación de curso.
 * @param {string} adminId
 * @param {string} cursoId
 * @param {string} usuarioId
 * @param {string} ipOrigen
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function registrarAuditoria(adminId, cursoId, usuarioId, ipOrigen) {
  const { error } = await supabaseDb.from("auditoria").insert({
    usuario_id: adminId,
    accion: "asignacion_curso",
    descripcion: `Asignó el curso ${cursoId} al usuario ${usuarioId}`,
    ip: ipOrigen ?? null,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error("Error al registrar auditoría", error);
    return { success: false, message: "La asignación se realizó, pero no se registró la auditoría." };
  }

  return { success: true };
}

function setStatus(message, type = "info") {
  if (!selectors.statusMessage) return;

  selectors.statusMessage.textContent = message ?? "";
  selectors.statusMessage.classList.remove(...Object.values(statusClasses));
  const statusClass = statusClasses[type];
  if (statusClass) {
    selectors.statusMessage.classList.add(statusClass);
  }
}

function setLoading(isLoading) {
  uiState.isLoading = isLoading;
  if (selectors.assignButton) {
    selectors.assignButton.disabled = isLoading;
    selectors.assignButton.textContent = isLoading ? "Asignando…" : "Asignar curso";
  }
  if (selectors.refreshButton) {
    selectors.refreshButton.disabled = isLoading;
  }
}

function renderSelectOptions(select, options, placeholder) {
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  select.append(placeholderOption);

  options.forEach((option) => select.append(option));

  if (currentValue && Array.from(select.options).some((opt) => opt.value === currentValue)) {
    select.value = currentValue;
    placeholderOption.selected = false;
  }
}

function mapUsersToOptions(users) {
  return (users ?? []).map((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    const fullName = [user.nombre, user.apellido].filter(Boolean).join(" ");
    option.textContent = fullName || user.correo || "Usuario sin nombre";
    option.dataset.email = user.correo ?? "";
    return option;
  });
}

function mapCoursesToOptions(courses) {
  return (courses ?? []).map((course) => {
    const option = document.createElement("option");
    option.value = course.id;
    option.textContent = course.nombre ?? "Curso sin título";
    return option;
  });
}

async function loadLists() {
  setLoading(true);
  setStatus("Cargando usuarios y cursos activos…", "info");

  const [usuarios, cursos] = await Promise.all([obtenerUsuariosActivos(), obtenerCursosActivos()]);

  if (!usuarios.success) {
    setLoading(false);
    setStatus(usuarios.message ?? "No fue posible cargar los usuarios.", "error");
    return;
  }

  if (!cursos.success) {
    setLoading(false);
    setStatus(cursos.message ?? "No fue posible cargar los cursos.", "error");
    return;
  }

  renderSelectOptions(
    selectors.userSelect,
    mapUsersToOptions(usuarios.data),
    "Seleccione un usuario activo"
  );

  renderSelectOptions(
    selectors.courseSelect,
    mapCoursesToOptions(cursos.data),
    "Seleccione un curso activo"
  );

  setStatus("Listas actualizadas.", "success");
  setLoading(false);
}

async function handleAssignment() {
  if (!uiState.adminId) {
    setStatus("No se pudo identificar al usuario administrador.", "error");
    return;
  }

  const cursoId = selectors.courseSelect?.value;
  const usuarioId = selectors.userSelect?.value;

  if (!cursoId || !usuarioId) {
    setStatus("Seleccione un usuario y un curso antes de continuar.", "error");
    return;
  }

  setLoading(true);
  setStatus("Procesando asignación…", "info");

  const resultado = await asignarCurso(cursoId, usuarioId, uiState.adminId);

  if (!resultado.success) {
    setStatus(resultado.message ?? "No fue posible completar la asignación.", "error");
    setLoading(false);
    return;
  }

  setStatus(resultado.message ?? "Curso asignado correctamente.", "success");
  setLoading(false);
}

function registerEvents() {
  selectors.assignButton?.addEventListener("click", handleAssignment);
  selectors.refreshButton?.addEventListener("click", loadLists);
}

export async function initializeAsignacionCursosUsuariosModule(currentUser) {
  uiState = createUiState();
  uiState.adminId = currentUser?.id ?? null;

  resolveSelectors();
  if (!selectors.userSelect || !selectors.courseSelect) {
    return;
  }

  setStatus("Preparando módulo…", "info");
  registerEvents();
  await loadLists();
}

async function validarAdmin(adminId) {
  const { data, error } = await supabaseDb
    .from("usuarios_roles")
    .select("roles:rol_id(nombre)")
    .eq("usuario_id", adminId);

  if (error) {
    console.error("Error al validar rol de administrador", error);
    return false;
  }

  const roles = normalizeRoles(data ?? []);
  return roles.includes("administrador");
}

async function validarUsuarioActivo(usuarioId) {
  const { data, error } = await supabaseDb
    .from("usuarios")
    .select("id,activo")
    .eq("id", usuarioId)
    .maybeSingle();

  if (error) {
    console.error("Error al validar usuario", error);
    return { success: false, message: "No fue posible validar el usuario." };
  }

  if (!data || data.activo !== true) {
    return { success: false, message: "El usuario seleccionado no está activo." };
  }

  return { success: true };
}

async function validarCursoActivo(cursoId) {
  const { data, error } = await supabaseDb
    .from("cursos")
    .select("id,activo")
    .eq("id", cursoId)
    .maybeSingle();

  if (error) {
    console.error("Error al validar curso", error);
    return { success: false, message: "No fue posible validar el curso." };
  }

  if (!data || data.activo !== true) {
    return { success: false, message: "El curso seleccionado no está activo." };
  }

  return { success: true };
}

/**
 * Asigna un curso a un usuario validando duplicados y permisos.
 * @param {string} cursoId
 * @param {string} usuarioId
 * @param {string} adminId
 * @param {string} ipOrigen
 * @returns {Promise<{success: boolean, data?: any, message: string}>}
 */
export async function asignarCurso(cursoId, usuarioId, adminId, ipOrigen = null) {
  if (!cursoId || !usuarioId || !adminId) {
    return { success: false, message: "Faltan datos obligatorios para realizar la asignación." };
  }

  const esAdmin = await validarAdmin(adminId);
  if (!esAdmin) {
    return { success: false, message: "Solo los administradores pueden asignar cursos." };
  }

  const validacionUsuario = await validarUsuarioActivo(usuarioId);
  if (!validacionUsuario.success) return validacionUsuario;

  const validacionCurso = await validarCursoActivo(cursoId);
  if (!validacionCurso.success) return validacionCurso;

  const duplicado = await validarAsignacionDuplicada(cursoId, usuarioId);
  if (!duplicado.success) {
    return { success: false, message: duplicado.message ?? "Ocurrió un error al validar la asignación." };
  }

  if (duplicado.existe) {
    return { success: false, message: "Este usuario ya tiene asignado este curso." };
  }

  const resultadoInsercion = await insertarAsignacion(cursoId, usuarioId, adminId);
  if (!resultadoInsercion.success) return resultadoInsercion;

  const auditoria = await registrarAuditoria(adminId, cursoId, usuarioId, ipOrigen);
  if (!auditoria.success) {
    return {
      success: true,
      data: resultadoInsercion.data,
      message: auditoria.message ?? "Asignación realizada con advertencias."
    };
  }

  return {
    success: true,
    data: resultadoInsercion.data,
    message: "Curso asignado correctamente."
  };
}
