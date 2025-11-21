import { supabaseDb } from "../supabaseClient.js";
import { normalizeRoles } from "../constants/roles.js";

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
