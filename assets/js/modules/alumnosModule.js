import { supabaseDb } from "../supabaseClient.js";

function createEmptyState() {
  return {
    currentUser: null,
    roles: [],
    isStudent: false,
    isInstructor: false,
    isAdmin: false,
    cursos: {
      asignados: [],
      abiertos: [],
      enProgreso: [],
      completados: []
    },
    progreso: [],
    evaluacionesPendientes: [],
    proximasActividades: [],
    constancias: [],
    infoPersonal: null,
    loading: false,
    errors: []
  };
}

async function fetchCurrentUser() {
  const {
    data: { user }
  } = await supabaseDb.auth.getUser();
  return user;
}

function createPanelEmptyState(message) {
  return `<p class="panel__empty">${message}</p>`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

export const alumnosModule = {
  state: createEmptyState(),
  selectors: {},

  async init(currentUser = null) {
    this.state = createEmptyState();
    this.state.currentUser = currentUser ?? (await fetchCurrentUser());
    this.selectors = this.resolveSelectors();
    this.ensureContainer();

    await this.loadUserRoles();

    if (!this.state.currentUser) {
      this.renderErrorState("No se encontró un usuario activo para mostrar el panel del alumno.");
      return;
    }

    this.renderDashboard();
    await Promise.all([
      this.loadPerfil(),
      this.loadCursos(),
      this.loadEvaluacionesPendientes(),
      this.loadProgreso(),
      this.loadConstancias()
    ]);

    this.renderCursos();
    this.renderProgreso();
    this.renderEvaluacionesPendientes();
    this.renderConstancias();
    this.renderInfoPersonal();
    this.registerEventListeners();
  },

  resolveSelectors() {
    return {
      container: document.querySelector("#module-container") ?? document.querySelector("[data-module-container]")
    };
  },

  ensureContainer() {
    if (this.selectors.container) return;
    const wrapper = document.createElement("div");
    wrapper.id = "module-container";
    document.body.append(wrapper);
    this.selectors.container = wrapper;
  },

  async loadUserRoles() {
    if (!this.state.currentUser) return;

    const { data, error } = await supabaseDb
      .from("usuarios_roles")
      .select("roles:rol_id(nombre)")
      .eq("usuario_id", this.state.currentUser.id);

    if (error) {
      console.error("Error al obtener roles del usuario", error);
      return;
    }

    this.state.roles = (data ?? []).map((row) => row.roles?.nombre?.toLowerCase?.() ?? "");
    this.state.isStudent = this.state.roles.includes("alumno");
    this.state.isInstructor = this.state.roles.includes("maestro") || this.state.roles.includes("instructor");
    this.state.isAdmin = this.state.roles.includes("administrador");
  },

  async loadPerfil() {
    if (!this.state.currentUser) return;
    const { data, error } = await supabaseDb
      .from("usuarios")
      .select("id,nombre,apellido,correo,activo,areas:area_id(nombre),jerarquias:jerarquia_id(nombre,nivel)")
      .eq("id", this.state.currentUser.id)
      .maybeSingle();

    if (error) {
      console.error("Error al cargar la información personal", error);
      return;
    }

    this.state.infoPersonal = data ?? null;
  },

  async loadCursos() {
    this.state.loading = true;
    try {
      const { data: cursos, error } = await supabaseDb
        .from("cursos")
        .select("id,nombre,descripcion,imagen_portada,activo,created_at")
        .eq("activo", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: asignaciones, error: asignacionesError } = await supabaseDb
        .from("cursos_usuarios")
        .select("curso_id,progreso,estatus")
        .eq("usuario_id", this.state.currentUser?.id ?? "");

      if (asignacionesError) console.info("No hay tabla de asignaciones específica", asignacionesError.message);

      const asignadosIds = new Set((asignaciones ?? []).map((item) => item.curso_id));
      const completadosIds = new Set((this.state.constancias ?? []).map((item) => item.curso_id));

      this.state.cursos.asignados = (cursos ?? []).filter((curso) => asignadosIds.has(curso.id));
      this.state.cursos.abiertos = (cursos ?? []).filter((curso) => !asignadosIds.size || !asignadosIds.has(curso.id));
      this.state.cursos.completados = (cursos ?? []).filter((curso) => completadosIds.has(curso.id));

      this.state.cursos.enProgreso = (asignaciones ?? [])
        .map((row) => cursos?.find((curso) => curso.id === row.curso_id))
        .filter(Boolean)
        .filter((curso) => !completadosIds.has(curso.id));
    } catch (error) {
      console.error("Error al cargar cursos del alumno", error);
      this.state.errors.push("No se pudieron cargar los cursos");
    } finally {
      this.state.loading = false;
    }
  },

  async loadEvaluacionesPendientes() {
    if (!this.state.currentUser) return;

    try {
      const { data, error } = await supabaseDb
        .from("evaluaciones")
        .select(
          `id,titulo,descripcion,intentos_max,leccion_id,activo,
          lecciones:leccion_id(id,nombre,modulos:modulo_id(id,nombre,curso_id,cursos:curso_id(id,nombre)))`
        )
        .eq("activo", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: intentos, error: intentosError } = await supabaseDb
        .from("evaluaciones_intentos")
        .select("evaluacion_id,aprobado,estado")
        .eq("usuario_id", this.state.currentUser.id);

      if (intentosError) console.info("Intentos no disponibles", intentosError.message);

      const aprobadas = new Set((intentos ?? []).filter((item) => item.aprobado).map((item) => item.evaluacion_id));
      this.state.evaluacionesPendientes = (data ?? []).filter((evalItem) => !aprobadas.has(evalItem.id));
      this.state.proximasActividades = this.state.evaluacionesPendientes.slice(0, 3);
    } catch (error) {
      console.error("Error al cargar evaluaciones pendientes", error);
      this.state.evaluacionesPendientes = [];
    }
  },

  async loadProgreso() {
    if (!this.state.currentUser) return;

    try {
      const { data: modulos, error: modulosError } = await supabaseDb
        .from("modulos_curso")
        .select("id,curso_id,nombre");

      if (modulosError) throw modulosError;

      const { data: lecciones, error: leccionesError } = await supabaseDb
        .from("lecciones")
        .select("id,modulo_id,nombre");

      if (leccionesError) throw leccionesError;

      const { data: intentos, error: intentosError } = await supabaseDb
        .from("evaluaciones_intentos")
        .select("evaluacion_id,aprobado,usuario_id")
        .eq("usuario_id", this.state.currentUser.id);

      if (intentosError) throw intentosError;

      const { data: evaluaciones, error: evaluacionesError } = await supabaseDb
        .from("evaluaciones")
        .select("id,leccion_id");

      if (evaluacionesError) throw evaluacionesError;

      const aprobadas = new Set((intentos ?? []).filter((item) => item.aprobado).map((item) => item.evaluacion_id));
      const cursoProgreso = new Map();

      (this.state.cursos.asignados ?? []).forEach((curso) => {
        const modulosCurso = (modulos ?? []).filter((modulo) => modulo.curso_id === curso.id);
        const leccionesCurso = (lecciones ?? []).filter((leccion) =>
          modulosCurso.some((mod) => mod.id === leccion.modulo_id)
        );
        const evaluacionesCurso = (evaluaciones ?? []).filter((ev) =>
          leccionesCurso.some((lec) => lec.id === ev.leccion_id)
        );

        const totalEvaluaciones = evaluacionesCurso.length;
        const evaluacionesAprobadas = evaluacionesCurso.filter((ev) => aprobadas.has(ev.id)).length;
        const porcentaje = totalEvaluaciones > 0 ? (evaluacionesAprobadas / totalEvaluaciones) * 100 : 0;

        cursoProgreso.set(curso.id, {
          cursoId: curso.id,
          cursoNombre: curso.nombre,
          modulos: modulosCurso.length,
          lecciones: leccionesCurso.length,
          evaluaciones: totalEvaluaciones,
          aprobadas: evaluacionesAprobadas,
          porcentaje
        });
      });

      this.state.progreso = Array.from(cursoProgreso.values());
    } catch (error) {
      console.error("Error al calcular el progreso del alumno", error);
      this.state.progreso = [];
    }
  },

  async loadConstancias() {
    if (!this.state.currentUser) return;

    try {
      const { data, error } = await supabaseDb
        .from("constancias")
        .select("id,folio,curso_id,url_pdf,fecha_emision")
        .eq("usuario_id", this.state.currentUser.id);

      if (error) throw error;
      this.state.constancias = data ?? [];
    } catch (error) {
      console.info("No se pudieron cargar constancias", error.message);
      this.state.constancias = [];
    }
  },

  renderDashboard() {
    if (!this.selectors.container) return;

    this.selectors.container.innerHTML = `
      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h1 class="panel__title">Panel del alumno</h1>
            <p class="panel__subtitle">Consulta tus cursos, progreso y próximas actividades.</p>
          </div>
        </header>
        <div class="panel__body">
          <div class="card-grid">
            <article class="card" id="alumnos-card-cursos"></article>
            <article class="card" id="alumnos-card-progreso"></article>
            <article class="card" id="alumnos-card-actividades"></article>
          </div>
        </div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Mis cursos</h2>
            <p class="panel__subtitle">Asignados, disponibles, en progreso y completados.</p>
          </div>
        </header>
        <div class="panel__body" id="alumnos-cursos"></div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Mi progreso</h2>
            <p class="panel__subtitle">Avance en módulos, lecciones y evaluaciones.</p>
          </div>
        </header>
        <div class="panel__body" id="alumnos-progreso"></div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Constancias</h2>
            <p class="panel__subtitle">Documentos de cursos completados.</p>
          </div>
        </header>
        <div class="panel__body" id="alumnos-constancias"></div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Mi información</h2>
            <p class="panel__subtitle">Datos personales y roles en la plataforma.</p>
          </div>
        </header>
        <div class="panel__body" id="alumnos-info"></div>
      </section>
    `;
  },

  renderCursos() {
    const container = document.querySelector("#alumnos-cursos");
    if (!container) return;

    const renderList = (title, items, actionLabel) => {
      if (!items?.length) {
        return createPanelEmptyState(`No hay ${title.toLowerCase()}`);
      }

      return `
        <div class="list list--divided">
          ${items
            .map(
              (curso) => `
                <div class="list__item">
                  <div>
                    <p class="list__title">${curso.nombre ?? "Curso"}</p>
                    <p class="list__meta">${curso.descripcion ?? "Sin descripción"}</p>
                  </div>
                  <div class="list__actions">
                    <button class="btn btn--ghost" data-action="open-curso" data-curso-id="${curso.id}">${actionLabel}</button>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      `;
    };

    container.innerHTML = `
      <div class="grid grid--2">
        <div>
          <h3 class="panel__subtitle">Asignados</h3>
          ${renderList("Cursos asignados", this.state.cursos.asignados, "Abrir")}
        </div>
        <div>
          <h3 class="panel__subtitle">Cursos abiertos</h3>
          ${renderList("Cursos abiertos", this.state.cursos.abiertos, "Ver detalles")}
        </div>
        <div>
          <h3 class="panel__subtitle">En progreso</h3>
          ${renderList("Cursos en progreso", this.state.cursos.enProgreso, "Continuar")}
        </div>
        <div>
          <h3 class="panel__subtitle">Completados</h3>
          ${renderList("Cursos completados", this.state.cursos.completados, "Revisar")}
        </div>
      </div>
    `;

    this.renderDashboardCards();
    container.querySelectorAll("[data-action='open-curso']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const cursoId = event.currentTarget.dataset.cursoId;
        this.openCurso(cursoId);
      });
    });
  },

  renderProgreso() {
    const container = document.querySelector("#alumnos-progreso");
    if (!container) return;

    if (!this.state.progreso.length) {
      container.innerHTML = createPanelEmptyState("Sin información de progreso aún.");
      return;
    }

    const rows = this.state.progreso
      .map(
        (item) => `
          <div class="list__item" data-curso-id="${item.cursoId}">
            <div>
              <p class="list__title">Curso ${item.cursoId}</p>
              <p class="list__meta">${item.modulos} módulos · ${item.lecciones} lecciones</p>
              <div class="progress">
                <div class="progress__bar" style="width:${item.porcentaje}%;"></div>
              </div>
            </div>
            <div class="list__actions">
              <span class="badge badge--primary">${formatPercent(item.porcentaje)}</span>
            </div>
          </div>
        `
      )
      .join("");

    container.innerHTML = `<div class="list list--divided">${rows}</div>`;
  },

  renderEvaluacionesPendientes() {
    const card = document.querySelector("#alumnos-card-actividades");
    if (!card) return;

    if (!this.state.proximasActividades.length) {
      card.innerHTML = `
        <h3 class="card__title">Próximas actividades</h3>
        <p class="card__description">No tienes evaluaciones pendientes.</p>
      `;
      return;
    }

    card.innerHTML = `
      <h3 class="card__title">Próximas actividades</h3>
      <ul class="list">
        ${this.state.proximasActividades
          .map(
            (item) => `
              <li class="list__item">
                <div>
                  <p class="list__title">${item.titulo ?? "Evaluación"}</p>
                  <p class="list__meta">${item.lecciones?.nombre ?? "Lección"}</p>
                </div>
                <div class="list__actions">
                  <button class="btn btn--ghost" data-action="open-evaluacion" data-evaluacion-id="${item.id}">Resolver</button>
                </div>
              </li>
            `
          )
          .join("")}
      </ul>
    `;

    card.querySelectorAll("[data-action='open-evaluacion']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const evaluacionId = event.currentTarget.dataset.evaluacionId;
        this.openEvaluacion(evaluacionId);
      });
    });
  },

  renderConstancias() {
    const container = document.querySelector("#alumnos-constancias");
    if (!container) return;

    if (!this.state.constancias.length) {
      container.innerHTML = createPanelEmptyState("Aún no tienes constancias generadas.");
      return;
    }

    container.innerHTML = `
      <div class="list list--divided">
        ${this.state.constancias
          .map(
            (item) => `
              <div class="list__item">
                <div>
                  <p class="list__title">Constancia ${item.folio ?? item.id}</p>
                  <p class="list__meta">Emitida ${formatDate(item.fecha_emision)}</p>
                </div>
                <div class="list__actions">
                  <button class="btn btn--ghost" data-action="open-constancia" data-constancia-id="${item.id}">Ver PDF</button>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;

    container.querySelectorAll("[data-action='open-constancia']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const constanciaId = event.currentTarget.dataset.constanciaId;
        this.openConstancia(constanciaId);
      });
    });
  },

  renderInfoPersonal() {
    const container = document.querySelector("#alumnos-info");
    if (!container) return;

    const info = this.state.infoPersonal;
    if (!info) {
      container.innerHTML = createPanelEmptyState("No se pudo cargar la información personal.");
      return;
    }

    container.innerHTML = `
      <dl class="definition-list">
        <div class="definition-list__item">
          <dt>Nombre completo</dt>
          <dd>${info.nombre ?? ""} ${info.apellido ?? ""}</dd>
        </div>
        <div class="definition-list__item">
          <dt>Correo</dt>
          <dd>${info.correo ?? ""}</dd>
        </div>
        <div class="definition-list__item">
          <dt>Área</dt>
          <dd>${info.areas?.nombre ?? "Sin área"}</dd>
        </div>
        <div class="definition-list__item">
          <dt>Jerarquía</dt>
          <dd>${info.jerarquias?.nombre ?? "Sin jerarquía"}</dd>
        </div>
        <div class="definition-list__item">
          <dt>Roles</dt>
          <dd>${this.state.roles.join(", ") || "Sin roles"}</dd>
        </div>
      </dl>
    `;
  },

  renderDashboardCards() {
    const cursosCard = document.querySelector("#alumnos-card-cursos");
    const progresoCard = document.querySelector("#alumnos-card-progreso");

    if (cursosCard) {
      cursosCard.innerHTML = `
        <h3 class="card__title">Cursos</h3>
        <p class="card__metric">${this.state.cursos.asignados.length}</p>
        <p class="card__description">Asignados</p>
        <div class="card__meta">${this.state.cursos.enProgreso.length} en progreso · ${
        this.state.cursos.completados.length
      } completados</div>
      `;
    }

    if (progresoCard) {
      const promedio =
        this.state.progreso.reduce((total, item) => total + (item.porcentaje ?? 0), 0) /
        (this.state.progreso.length || 1);
      progresoCard.innerHTML = `
        <h3 class="card__title">Progreso promedio</h3>
        <p class="card__metric">${formatPercent(promedio)}</p>
        <p class="card__description">Avance acumulado en todos tus cursos.</p>
      `;
    }
  },

  renderErrorState(message) {
    if (!this.selectors.container) return;
    this.selectors.container.innerHTML = `<section class="panel panel--elevated"><div class="panel__body">${message}</div></section>`;
  },

  registerEventListeners() {
    // Los eventos se registran dentro de cada render; función reservada para futuras interacciones.
  },

  openCurso(cursoId) {
    console.info("Abrir curso", cursoId);
  },

  openLeccion(leccionId) {
    console.info("Abrir lección", leccionId);
  },

  openEvaluacion(evaluacionId) {
    if (typeof window.loadModule === "function") {
      window.loadModule("evaluacionRenderModule", { evaluacionId });
    }
  },

  openConstancia(constanciaId) {
    const constancia = (this.state.constancias ?? []).find((item) => String(item.id) === String(constanciaId));
    if (constancia?.url_pdf) {
      window.open(constancia.url_pdf, "_blank", "noopener");
    }
  }
};
