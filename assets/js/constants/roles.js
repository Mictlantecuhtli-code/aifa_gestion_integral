// Mantén los nombres normalizados en minúsculas para evitar discrepancias al comparar
export const ROLE_ACCESS_WHITELIST = ["administrador", "maestro", "instructor", "alumno"];

export function normalizeRoles(roleRows = []) {
  return roleRows.map((row) => (row.roles?.nombre ?? "").toLowerCase());
}

