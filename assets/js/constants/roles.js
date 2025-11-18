export const ALLOWED_ROLES = ["administrador", "maestro", "instructor", "alumno"];

export function normalizeRoles(roleRows = []) {
  return roleRows.map((row) => (row.roles?.nombre ?? "").toLowerCase());
}

