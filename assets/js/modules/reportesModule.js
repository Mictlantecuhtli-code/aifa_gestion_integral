import { supabaseDb } from "../supabaseClient.js";

function formatNumber(value, fallback = "0") {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function formatMinutesFromDuration(durationMs) {
  if (!durationMs || Number.isNaN(durationMs)) return "N/D";
  const minutes = durationMs / 60000;
  if (minutes < 1) return "<1 min";
  return `${minutes.toFixed(1)} min`;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

function buildCsvSection(title, rows) {
  const header = rows.length ? Object.keys(rows[0]) : [];
  const csvLines = [];
  csvLines.push(title);
  if (header.length) {
    csvLines.push(header.join(","));
    rows.forEach((row) => {
      const line = header
        .map((key) => {
          const value = row[key] ?? "";
          if (typeof value === "string" && (value.includes(",") || value.includes("\n") || value.includes("\""))) {
            return `"${value.replace(/\"/g, '""')}"`;
          }
          return value;
        })
        .join(",");
      csvLines.push(line);
    });
  } else {
    csvLines.push("Sin datos");
  }
  csvLines.push("");
  return csvLines.join("\n");
}

export const reportesModule = {
  state: {},
  selectors: {},

  async init(currentUser = null) {
    this.state = {
      currentUser: currentUser ?? null,
      cursos: [],
      modulos: [],
      lecciones: [],
      areas: [],
      jerarquias: [],
      roles: [],
      usuarios: [],
      evaluaciones: [],
      intentos: [],
      maxCalificaciones: [],
      filters: {
        cursoId: "todos",
        moduloId: "todos",
        leccionId: "todos",
        areaId: "todos",
        jerarquiaId: "todos",
        rolId: "todos",
        estatusEvaluacion: "todos",
        usuarioId: "todos",
        fechaInicio: "",
        fechaFin: ""
      },
      exportData: {
        cursos: [],
        evaluaciones: [],
        usuarios: []
      }
    };

    this.resolveSelectors();

    if (!this.selectors.panel) {
      return;
    }

    await Promise.all([
      this.loadCursos(),
      this.loadAreas(),
      this.loadJerarquias(),
      this.loadRoles()
    ]);

    await this.loadModulos();
    await this.loadLecciones();
    await this.loadUsuarios();
    await this.loadEvaluaciones();
    await this.loadIntentos();
    await this.loadMaxCalificaciones();
    this.renderAll();
    this.registerEventListeners();
  },

  resolveSelectors() {
    this.selectors = {
      panel: document.querySelector(".admin-module--reportes"),
      cursoSelect: document.querySelector("#reportes-filter-curso"),
      moduloSelect: document.querySelector("#reportes-filter-modulo"),
      leccionSelect: document.querySelector("#reportes-filter-leccion"),
      areaSelect: document.querySelector("#reportes-filter-area"),
      jerarquiaSelect: document.querySelector("#reportes-filter-jerarquia"),
      rolSelect: document.querySelector("#reportes-filter-rol"),
      estatusSelect: document.querySelector("#reportes-filter-estatus"),
      usuarioSelect: document.querySelector("#reportes-filter-usuario"),
      fechaInicioInput: document.querySelector("#reportes-filter-fecha-inicio"),
      fechaFinInput: document.querySelector("#reportes-filter-fecha-fin"),
      exportCsvButton: document.querySelector("#reportes-export-csv"),
      cursoTableBody: document.querySelector("#reportes-curso-body"),
      evaluacionTableBody: document.querySelector("#reportes-evaluaciones-body"),
      usuarioTableBody: document.querySelector("#reportes-usuario-body"),
      cursoSummary: document.querySelector("#reportes-curso-summary"),
      evaluacionSummary: document.querySelector("#reportes-evaluacion-summary"),
      usuarioSummary: document.querySelector("#reportes-usuario-summary")
    };
  },

  registerEventListeners() {
    const filterHandlers = [
      [this.selectors.cursoSelect, (value) => {
        this.state.filters.cursoId = value;
        this.state.filters.moduloId = "todos";
        this.state.filters.leccionId = "todos";
        return this.loadModulos().then(() => this.loadLecciones());
      }],
      [this.selectors.moduloSelect, (value) => {
        this.state.filters.moduloId = value;
        this.state.filters.leccionId = "todos";
        return this.loadLecciones();
      }],
      [this.selectors.leccionSelect, (value) => {
        this.state.filters.leccionId = value;
      }],
      [this.selectors.areaSelect, (value) => {
        this.state.filters.areaId = value;
      }],
      [this.selectors.jerarquiaSelect, (value) => {
        this.state.filters.jerarquiaId = value;
      }],
      [this.selectors.rolSelect, (value) => {
        this.state.filters.rolId = value;
      }],
      [this.selectors.estatusSelect, (value) => {
        this.state.filters.estatusEvaluacion = value;
      }],
      [this.selectors.usuarioSelect, (value) => {
        this.state.filters.usuarioId = value;
      }],
      [this.selectors.fechaInicioInput, (value) => {
        this.state.filters.fechaInicio = value;
      }],
      [this.selectors.fechaFinInput, (value) => {
        this.state.filters.fechaFin = value;
      }]
    ];

    filterHandlers.forEach(([element, handler]) => {
      element?.addEventListener("change", async (event) => {
        const value = event.target.value || (event.target.type === "date" ? event.target.value : "todos");
        const result = handler(value || "todos");
        await Promise.resolve(result);
        await this.refreshData();
      });
    });

    this.selectors.exportCsvButton?.addEventListener("click", () => {
      this.exportCSV();
    });
  },

  async refreshData() {
    await Promise.all([this.loadUsuarios(), this.loadEvaluaciones()]);
    await this.loadIntentos();
    await this.loadMaxCalificaciones();
    this.renderAll();
  },

  async loadCursos() {
    const { data, error } = await supabaseDb.from("cursos").select("id,nombre,activo").order("nombre", { ascending: true });
    if (error) {
      console.error("Error al cargar cursos", error);
      this.state.cursos = [];
    } else {
      this.state.cursos = data ?? [];
    }
    this.renderSelect(this.selectors.cursoSelect, this.state.cursos, "Selecciona un curso", "todos");
  },

  async loadModulos() {
    let query = supabaseDb.from("modulos_curso").select("id,nombre,curso_id,activo").order("orden", { ascending: true });
    if (this.state.filters.cursoId && this.state.filters.cursoId !== "todos") {
      query = query.eq("curso_id", this.state.filters.cursoId);
    }
    const { data, error } = await query;
    if (error) {
      console.error("Error al cargar módulos", error);
      this.state.modulos = [];
    } else {
      this.state.modulos = data ?? [];
    }
    this.renderSelect(this.selectors.moduloSelect, this.state.modulos, "Selecciona un módulo", "todos");
  },

  async loadLecciones() {
    let query = supabaseDb
      .from("lecciones")
      .select("id,nombre,modulo_id,activo")
      .order("orden", { ascending: true });

    if (this.state.filters.moduloId && this.state.filters.moduloId !== "todos") {
      query = query.eq("modulo_id", this.state.filters.moduloId);
    } else if (this.state.filters.cursoId && this.state.filters.cursoId !== "todos") {
      const moduloIds = this.state.modulos.filter((m) => String(m.curso_id) === String(this.state.filters.cursoId)).map((m) => m.id);
      if (moduloIds.length) query = query.in("modulo_id", moduloIds);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error al cargar lecciones", error);
      this.state.lecciones = [];
    } else {
      this.state.lecciones = data ?? [];
    }
    this.renderSelect(this.selectors.leccionSelect, this.state.lecciones, "Selecciona una lección", "todos");
  },

  async loadAreas() {
    const { data, error } = await supabaseDb
      .from("areas")
      .select("id,nombre,activo")
      .eq("activo", true)
      .order("nombre", { ascending: true });
    if (error) {
      console.error("Error al cargar áreas", error);
      this.state.areas = [];
    } else {
      this.state.areas = data ?? [];
    }
    this.renderSelect(this.selectors.areaSelect, this.state.areas, "Filtrar por área", "todos");
  },

  async loadJerarquias() {
    const { data, error } = await supabaseDb
      .from("jerarquias")
      .select("id,nombre,nivel")
      .order("nivel", { ascending: true });
    if (error) {
      console.error("Error al cargar jerarquías", error);
      this.state.jerarquias = [];
    } else {
      this.state.jerarquias = data ?? [];
    }
    this.renderSelect(
      this.selectors.jerarquiaSelect,
      this.state.jerarquias.map((item) => ({ ...item, nombre: `${item.nombre} (Nivel ${item.nivel})` })),
      "Filtrar por jerarquía",
      "todos"
    );
  },

  async loadRoles() {
    const { data, error } = await supabaseDb.from("roles").select("id,nombre").order("nombre", { ascending: true });
    if (error) {
      console.error("Error al cargar roles", error);
      this.state.roles = [];
    } else {
      this.state.roles = data ?? [];
    }
    this.renderSelect(this.selectors.rolSelect, this.state.roles, "Filtrar por rol", "todos");
  },

  async loadUsuarios() {
    const { data, error } = await supabaseDb
      .from("usuarios")
      .select("id,nombre,apellido,area_id,jerarquia_id,activo,usuarios_roles(roles:rol_id(id,nombre))")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error al cargar usuarios", error);
      this.state.usuarios = [];
    } else {
      this.state.usuarios = (data ?? []).map((usuario) => ({
        ...usuario,
        roles: (usuario.usuarios_roles ?? []).map((entry) => entry.roles).filter(Boolean)
      }));
    }

    const usuarioOptions = this.state.usuarios.map((usuario) => ({
      id: usuario.id,
      nombre: `${usuario.nombre ?? ""} ${usuario.apellido ?? ""}`.trim()
    }));
    this.renderSelect(this.selectors.usuarioSelect, usuarioOptions, "Filtrar por usuario", "todos");
  },

  async loadEvaluaciones() {
    let query = supabaseDb
      .from("evaluaciones")
      .select(
        `id,titulo,leccion_id,intentos_max,tiempo_limite,activo,created_at,
        lecciones:leccion_id(id,nombre,modulo_id,modulos:modulo_id(id,nombre,curso_id,cursos:curso_id(id,nombre)))`
      )
      .order("created_at", { ascending: false });

    if (this.state.filters.leccionId && this.state.filters.leccionId !== "todos") {
      query = query.eq("leccion_id", this.state.filters.leccionId);
    } else if (this.state.filters.moduloId && this.state.filters.moduloId !== "todos") {
      const leccionIds = this.state.lecciones.filter((l) => String(l.modulo_id) === String(this.state.filters.moduloId)).map((l) => l.id);
      if (leccionIds.length) query = query.in("leccion_id", leccionIds);
    } else if (this.state.filters.cursoId && this.state.filters.cursoId !== "todos") {
      const moduloIds = this.state.modulos.filter((m) => String(m.curso_id) === String(this.state.filters.cursoId)).map((m) => m.id);
      const leccionIds = this.state.lecciones.filter((l) => moduloIds.includes(l.modulo_id)).map((l) => l.id);
      if (leccionIds.length) query = query.in("leccion_id", leccionIds);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error al cargar evaluaciones", error);
      this.state.evaluaciones = [];
    } else {
      this.state.evaluaciones = data ?? [];
    }
  },

  async loadIntentos() {
    const evaluationIds = (this.state.evaluaciones ?? []).map((evalItem) => evalItem.id);
    if (!evaluationIds.length) {
      this.state.intentos = [];
      return;
    }

    let query = supabaseDb
      .from("evaluaciones_intentos")
      .select("id,evaluacion_id,usuario_id,fecha_inicio,fecha_fin,calificacion,aprobado,estado")
      .in("evaluacion_id", evaluationIds);

    const fechaInicio = normalizeDate(this.state.filters.fechaInicio);
    const fechaFin = normalizeDate(this.state.filters.fechaFin ? `${this.state.filters.fechaFin}T23:59:59` : null);

    if (fechaInicio) query = query.gte("fecha_inicio", fechaInicio);
    if (fechaFin) query = query.lte("fecha_fin", fechaFin);

    const { data, error } = await query;
    if (error) {
      console.error("Error al cargar intentos", error);
      this.state.intentos = [];
    } else {
      this.state.intentos = data ?? [];
    }
  },

  async loadMaxCalificaciones() {
    const evaluationIds = (this.state.evaluaciones ?? []).map((evalItem) => evalItem.id);
    if (!evaluationIds.length) {
      this.state.maxCalificaciones = [];
      return;
    }

    let query = supabaseDb
      .from("evaluaciones_intentos")
      .select("evaluacion_id,usuario_id,max_calificacion:max(calificacion)")
      .in("evaluacion_id", evaluationIds)
      .group("evaluacion_id,usuario_id");

    const fechaInicio = normalizeDate(this.state.filters.fechaInicio);
    const fechaFin = normalizeDate(this.state.filters.fechaFin ? `${this.state.filters.fechaFin}T23:59:59` : null);

    if (fechaInicio) query = query.gte("fecha_inicio", fechaInicio);
    if (fechaFin) query = query.lte("fecha_fin", fechaFin);

    const { data, error } = await query;
    if (error) {
      console.error("Error al calcular mejores calificaciones", error);
      this.state.maxCalificaciones = [];
    } else {
      this.state.maxCalificaciones = data ?? [];
    }
  },

  renderSelect(select, items, placeholder, defaultValue = "") {
    if (!select) return;
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = defaultValue ?? "";
    defaultOption.textContent = placeholder;
    defaultOption.selected = true;
    select.append(defaultOption);

    (items ?? []).forEach((item) => {
      if (!item) return;
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.nombre ?? item.titulo ?? "Sin nombre";
      select.append(option);
    });
  },

  renderAll() {
    this.renderReporteCurso();
    this.renderReporteEvaluacion();
    this.renderReporteUsuario();
  },

  getFilteredUsers() {
    const { areaId, jerarquiaId, rolId } = this.state.filters;
    return (this.state.usuarios ?? []).filter((usuario) => {
      const matchArea = areaId === "todos" || String(usuario.area_id) === String(areaId);
      const matchJerarquia = jerarquiaId === "todos" || String(usuario.jerarquia_id) === String(jerarquiaId);
      const matchRol =
        rolId === "todos" ||
        (usuario.roles ?? []).some((rol) => String(rol.id) === String(rolId));
      return matchArea && matchJerarquia && matchRol;
    });
  },

  getFilteredAttempts() {
    const filteredUsers = this.getFilteredUsers();
    const allowedUserIds = new Set(filteredUsers.map((u) => u.id));
    const estatus = this.state.filters.estatusEvaluacion;
    return (this.state.intentos ?? []).filter((intento) => {
      if (!allowedUserIds.has(intento.usuario_id)) return false;
      if (estatus === "todos") return true;
      if (estatus === "aprobado") return intento.aprobado === true;
      if (estatus === "reprobado") return intento.aprobado === false && intento.estado === "terminado";
      if (estatus === "en_progreso") return intento.estado === "en_progreso";
      return true;
    });
  },

  mapEvaluacionesPorCurso() {
    const map = new Map();
    (this.state.evaluaciones ?? []).forEach((eva) => {
      const cursoId = eva?.lecciones?.modulos?.curso_id;
      if (!cursoId) return;
      const collection = map.get(cursoId) ?? [];
      collection.push(eva);
      map.set(cursoId, collection);
    });
    return map;
  },

  getMaxGradeForUserByEvaluation(userId, evaluationIds) {
    const allowed = new Set(evaluationIds);
    const registros = (this.state.maxCalificaciones ?? []).filter(
      (entry) => allowed.has(entry.evaluacion_id) && String(entry.usuario_id) === String(userId)
    );
    if (!registros.length) return null;
    const best = registros.reduce((acc, item) => (item.max_calificacion > acc ? item.max_calificacion : acc), -Infinity);
    return best === -Infinity ? null : best;
  },

  renderReporteCurso() {
    if (!this.selectors.cursoTableBody) return;

    const filteredUsers = this.getFilteredUsers();
    const evaluacionesPorCurso = this.mapEvaluacionesPorCurso();
    const rows = [];
    const cursos = this.state.filters.cursoId === "todos"
      ? this.state.cursos
      : this.state.cursos.filter((curso) => String(curso.id) === String(this.state.filters.cursoId));

    cursos.forEach((curso) => {
      const evaluacionesCurso = evaluacionesPorCurso.get(curso.id) ?? [];
      const evalIds = evaluacionesCurso.map((eva) => eva.id);
      const intentosCurso = this.getFilteredAttempts().filter((intento) => evalIds.includes(intento.evaluacion_id));

      let iniciados = 0;
      let completados = 0;
      let avanceAcumulado = 0;

      const usuariosEstado = filteredUsers.map((usuario) => {
        const intentosUsuario = intentosCurso.filter((intento) => String(intento.usuario_id) === String(usuario.id));
        const tieneCompletado = intentosUsuario.some((intento) => intento.estado === "terminado" && intento.aprobado === true);
        const tieneIntentos = intentosUsuario.length > 0;

        let estado = "No iniciado";
        if (tieneCompletado) {
          estado = "Completado";
          completados += 1;
          avanceAcumulado += 100;
        } else if (tieneIntentos) {
          estado = "En progreso";
          iniciados += 1;
          avanceAcumulado += 50;
        }

        const mejorCalificacion = this.getMaxGradeForUserByEvaluation(usuario.id, evalIds);
        return {
          nombre: `${usuario.nombre ?? ""} ${usuario.apellido ?? ""}`.trim(),
          estado,
          mejorCalificacion: mejorCalificacion ?? "N/D"
        };
      });

      const totalUsuarios = filteredUsers.length;
      const promedioAvance = totalUsuarios ? avanceAcumulado / totalUsuarios : 0;

      rows.push({
        curso,
        resumen: {
          totalUsuarios,
          iniciados,
          completados,
          promedioAvance
        },
        usuariosEstado
      });
    });

    if (!rows.length) {
      this.selectors.cursoTableBody.innerHTML = `<tr><td colspan="5" class="table__empty">No hay datos para los filtros seleccionados.</td></tr>`;
      if (this.selectors.cursoSummary) this.selectors.cursoSummary.textContent = "";
      this.state.exportData.cursos = [];
      return;
    }

    const exportRows = [];
    this.selectors.cursoTableBody.innerHTML = rows
      .map((row) => {
        exportRows.push({
          Curso: row.curso.nombre,
          "Usuarios total": row.resumen.totalUsuarios,
          "Usuarios iniciados": row.resumen.iniciados,
          "Usuarios completados": row.resumen.completados,
          "Avance promedio": `${row.resumen.promedioAvance.toFixed(1)}%`
        });

        const estadosDetalle = row.usuariosEstado
          .map((u) => `${u.nombre}: ${u.estado}${u.mejorCalificacion !== "N/D" ? ` (Mejor calificación: ${u.mejorCalificacion})` : ""}`)
          .join("<br>");

        return `
          <tr>
            <td>${row.curso.nombre}</td>
            <td>${formatNumber(row.resumen.totalUsuarios)}</td>
            <td>${formatNumber(row.resumen.iniciados)}</td>
            <td>${formatNumber(row.resumen.completados)}</td>
            <td>${formatPercent(row.resumen.promedioAvance)}</td>
          </tr>
          <tr>
            <td colspan="5" class="table__notes">
              <strong>Usuarios y estados:</strong><br>${estadosDetalle || "Sin registros"}
            </td>
          </tr>
        `;
      })
      .join("");

    const totalCursos = rows.length;
    const totalUsuariosConsiderados = rows.reduce((acc, row) => acc + row.resumen.totalUsuarios, 0);
    if (this.selectors.cursoSummary) {
      this.selectors.cursoSummary.textContent = `${totalCursos} curso(s) y ${totalUsuariosConsiderados} usuarios dentro del alcance.`;
    }

    this.state.exportData.cursos = exportRows;
  },

  renderReporteEvaluacion() {
    if (!this.selectors.evaluacionTableBody) return;

    const attempts = this.getFilteredAttempts();
    const rows = (this.state.evaluaciones ?? []).map((eva) => {
      const intentosEval = attempts.filter((intento) => intento.evaluacion_id === eva.id);
      const uniqueUsers = new Set(intentosEval.map((i) => i.usuario_id));
      const aprobados = intentosEval.filter((i) => i.aprobado === true).length;
      const reprobados = intentosEval.filter((i) => i.estado === "terminado" && i.aprobado === false).length;
      const enProgreso = intentosEval.filter((i) => i.estado === "en_progreso").length;
      const terminado = intentosEval.filter((i) => i.estado === "terminado").length;

      const mejores = (this.state.maxCalificaciones ?? [])
        .filter((entry) => entry.evaluacion_id === eva.id)
        .map((entry) => entry.max_calificacion)
        .filter((val) => typeof val === "number");
      const mejorCalificacion = mejores.length ? Math.max(...mejores) : null;

      const promedioIntentos = uniqueUsers.size ? intentosEval.length / uniqueUsers.size : 0;
      const tiempos = intentosEval
        .map((intento) => {
          const inicio = new Date(intento.fecha_inicio);
          const fin = new Date(intento.fecha_fin);
          if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
          return Math.max(fin - inicio, 0);
        })
        .filter((value) => typeof value === "number");
      const tiempoPromedio = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null;

      return {
        evaluacion: eva,
        totalIntentos: intentosEval.length,
        mejorCalificacion,
        promedioIntentos,
        tiempoPromedio,
        aprobados,
        reprobados,
        enProgreso,
        terminado
      };
    });

    if (!rows.length) {
      this.selectors.evaluacionTableBody.innerHTML = `<tr><td colspan="8" class="table__empty">No hay evaluaciones para los filtros seleccionados.</td></tr>`;
      if (this.selectors.evaluacionSummary) this.selectors.evaluacionSummary.textContent = "";
      this.state.exportData.evaluaciones = [];
      return;
    }

    const exportRows = [];
    this.selectors.evaluacionTableBody.innerHTML = rows
      .map((row) => {
        const cursoNombre = row.evaluacion?.lecciones?.modulos?.cursos?.nombre ?? "Sin curso";
        exportRows.push({
          Evaluacion: row.evaluacion.titulo ?? "Sin título",
          Curso: cursoNombre,
          "Intentos totales": row.totalIntentos,
          "Mejor calificación": row.mejorCalificacion ?? "N/D",
          "Intentos usados": row.promedioIntentos.toFixed(2),
          "Tiempo promedio": formatMinutesFromDuration(row.tiempoPromedio),
          "Aprobados": row.aprobados,
          "Reprobados": row.reprobados
        });

        return `
          <tr>
            <td>${row.evaluacion.titulo ?? "Sin título"}</td>
            <td>${cursoNombre}</td>
            <td>${formatNumber(row.totalIntentos)}</td>
            <td>${row.mejorCalificacion ?? "N/D"}</td>
            <td>${row.promedioIntentos.toFixed(2)}</td>
            <td>${formatMinutesFromDuration(row.tiempoPromedio)}</td>
            <td>${formatNumber(row.aprobados)} / ${formatNumber(row.reprobados)}</td>
            <td>${formatNumber(row.enProgreso)} en progreso / ${formatNumber(row.terminado)} terminados</td>
          </tr>
        `;
      })
      .join("");

    if (this.selectors.evaluacionSummary) {
      const total = rows.length;
      const intentos = rows.reduce((acc, row) => acc + row.totalIntentos, 0);
      this.selectors.evaluacionSummary.textContent = `${total} evaluación(es) y ${intentos} intento(s) considerados.`;
    }

    this.state.exportData.evaluaciones = exportRows;
  },

  renderReporteUsuario() {
    if (!this.selectors.usuarioTableBody) return;

    const usuarioId = this.state.filters.usuarioId;
    if (!usuarioId || usuarioId === "todos") {
      this.selectors.usuarioTableBody.innerHTML = `<tr><td colspan="6" class="table__empty">Selecciona un usuario para ver su detalle.</td></tr>`;
      if (this.selectors.usuarioSummary) this.selectors.usuarioSummary.textContent = "";
      this.state.exportData.usuarios = [];
      return;
    }

    const usuario = (this.state.usuarios ?? []).find((u) => String(u.id) === String(usuarioId));
    const attempts = this.getFilteredAttempts().filter((intento) => String(intento.usuario_id) === String(usuarioId));
    const evalIdsUsuario = attempts.map((i) => i.evaluacion_id);

    const evaluacionesUsuario = (this.state.evaluaciones ?? []).filter((eva) => evalIdsUsuario.includes(eva.id));
    const cursosPorEvaluacion = evaluacionesUsuario.map((eva) => eva?.lecciones?.modulos?.cursos).filter(Boolean);
    const cursosUnicos = new Map();
    cursosPorEvaluacion.forEach((curso) => {
      if (!curso) return;
      cursosUnicos.set(curso.id, curso);
    });

    const rows = evaluacionesUsuario.map((eva) => {
      const intentosEvaluacion = attempts.filter((i) => i.evaluacion_id === eva.id);
      const mejorCalificacion = this.getMaxGradeForUserByEvaluation(usuarioId, [eva.id]);
      const tiempoTotal = intentosEvaluacion
        .map((intento) => {
          const inicio = new Date(intento.fecha_inicio);
          const fin = new Date(intento.fecha_fin);
          if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
          return Math.max(fin - inicio, 0);
        })
        .filter((value) => typeof value === "number")
        .reduce((acc, value) => acc + value, 0);

      const ultimoEstado = intentosEvaluacion[intentosEvaluacion.length - 1]?.estado ?? "Sin intentos";
      return {
        evaluacion: eva,
        intentos: intentosEvaluacion.length,
        mejorCalificacion,
        tiempoTotal,
        ultimoEstado
      };
    });

    if (!rows.length) {
      this.selectors.usuarioTableBody.innerHTML = `<tr><td colspan="6" class="table__empty">El usuario no tiene evaluaciones registradas con los filtros actuales.</td></tr>`;
      if (this.selectors.usuarioSummary) this.selectors.usuarioSummary.textContent = "";
      this.state.exportData.usuarios = [];
      return;
    }

    const exportRows = [];
    this.selectors.usuarioTableBody.innerHTML = rows
      .map((row) => {
        const cursoNombre = row.evaluacion?.lecciones?.modulos?.cursos?.nombre ?? "Sin curso";
        exportRows.push({
          Usuario: `${usuario?.nombre ?? ""} ${usuario?.apellido ?? ""}`.trim(),
          Curso: cursoNombre,
          Evaluacion: row.evaluacion.titulo ?? "Sin título",
          "Intentos usados": row.intentos,
          "Mejor calificación": row.mejorCalificacion ?? "N/D",
          "Tiempo dedicado": formatMinutesFromDuration(row.tiempoTotal),
          "Último estado": row.ultimoEstado
        });

        return `
          <tr>
            <td>${cursoNombre}</td>
            <td>${row.evaluacion.titulo ?? "Sin título"}</td>
            <td>${formatNumber(row.intentos)}</td>
            <td>${row.mejorCalificacion ?? "N/D"}</td>
            <td>${formatMinutesFromDuration(row.tiempoTotal)}</td>
            <td>${row.ultimoEstado}</td>
          </tr>
        `;
      })
      .join("");

    const materialesPendientes = cursosUnicos.size ? "Sin registros de visualización de materiales." : "";
    if (this.selectors.usuarioSummary) {
      this.selectors.usuarioSummary.textContent = `${cursosUnicos.size} curso(s) relacionados. ${materialesPendientes}`.trim();
    }

    this.state.exportData.usuarios = exportRows;
  },

  exportCSV() {
    const sections = [
      buildCsvSection("Reporte por curso", this.state.exportData.cursos ?? []),
      buildCsvSection("Reporte de evaluaciones", this.state.exportData.evaluaciones ?? []),
      buildCsvSection("Reporte por usuario", this.state.exportData.usuarios ?? [])
    ];

    const csvContent = sections.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateSuffix = toDateOnly(new Date());
    link.download = `reportes_${dateSuffix ?? "export"}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

export async function initializeReportesModule(currentUser) {
  await reportesModule.init(currentUser);
}
