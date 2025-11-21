import { supabaseDb } from "../supabaseClient.js";

function createInitialState() {
  return {
    currentUser: null,
    roles: [],
    isInstructor: false,
    isAdmin: false,
    cursos: [],
    alumnos: [],
    evaluaciones: [],
    progreso: [],
    mensajes: [],
    loading: false
  };
}

async function fetchCurrentUser() {
  const {
    data: { user }
  } = await supabaseDb.auth.getUser();
  return user;
}

function createEmpty(text) {
  return `<p class="panel__empty">${text}</p>`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

export const maestrosModule = {
  state: createInitialState(),
  selectors: {},

  async init(currentUser = null) {
    this.state = createInitialState();
    this.state.currentUser = currentUser ?? (await fetchCurrentUser());
    this.selectors = this.resolveSelectors();
    this.ensureContainer();

    await this.loadUserRoles();

    if (!this.state.currentUser || (!this.state.isInstructor && !this.state.isAdmin)) {
      this.renderError("No tienes permisos para acceder al panel de instructores.");
      return;
    }

    this.renderDashboardInstructor();

    await this.loadCursosInstructor();
    await this.loadEvaluacionesCurso();
    await this.loadProgresoAlumnos();
    await this.loadAlumnosPorCurso();

    this.renderCursos();
    this.renderEvaluaciones();
    this.renderAlumnos();
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
    this.state.isInstructor = this.state.roles.includes("maestro") || this.state.roles.includes("instructor");
    this.state.isAdmin = this.state.roles.includes("administrador");
  },

  async loadCursosInstructor() {
    if (!this.state.currentUser) return;

    try {
      const { data, error } = await supabaseDb
        .from("cursos")
        .select("id,nombre,descripcion,imagen_portada,activo,creado_por")
        .eq("activo", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const propios = (data ?? []).filter((curso) => curso.creado_por === this.state.currentUser.id);
      this.state.cursos = propios.length ? propios : data ?? [];
    } catch (error) {
      console.error("Error al cargar cursos del instructor", error);
      this.state.cursos = [];
    }
  },

  async loadAlumnosPorCurso() {
    if (!this.state.cursos.length) return;

    try {
      const { data, error } = await supabaseDb
        .from("cursos_usuarios")
        .select("usuario_id,curso_id,estado,progreso")
        .in(
          "curso_id",
          this.state.cursos.map((curso) => curso.id)
        );

      if (error) throw error;
      this.state.alumnos = data ?? [];
    } catch (error) {
      console.info("No se pudo cargar el detalle de alumnos inscritos", error.message);
      this.state.alumnos = [];
    }
  },

  async loadEvaluacionesCurso() {
    if (!this.state.cursos.length) return;

    try {
      const { data, error } = await supabaseDb
        .from("evaluaciones")
        .select(
          `id,titulo,descripcion,activo,leccion_id,
          lecciones:leccion_id(id,nombre,modulo_id,modulos:modulo_id(id,nombre,curso_id))`
        );

      if (error) throw error;
      const cursoIds = new Set(this.state.cursos.map((curso) => curso.id));
      this.state.evaluaciones = (data ?? []).filter((item) => cursoIds.has(item.lecciones?.modulos?.curso_id));
    } catch (error) {
      console.error("Error al cargar evaluaciones del curso", error);
      this.state.evaluaciones = [];
    }
  },

  async loadProgresoAlumnos() {
    if (!this.state.cursos.length) return;

    try {
      const { data, error } = await supabaseDb
        .from("evaluaciones_intentos")
        .select("evaluacion_id,usuario_id,calificacion,aprobado")
        .in(
          "evaluacion_id",
          this.state.evaluaciones.map((item) => item.id).filter(Boolean)
        );

      if (error) throw error;
      this.state.progreso = data ?? [];
    } catch (error) {
      console.info("Sin datos de progreso para los alumnos", error.message);
      this.state.progreso = [];
    }
  },

  renderDashboardInstructor() {
    if (!this.selectors.container) return;

    this.selectors.container.innerHTML = `
      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h1 class="panel__title">Panel del instructor</h1>
            <p class="panel__subtitle">Gestiona cursos, alumnos y evaluaciones asignadas.</p>
          </div>
        </header>
        <div class="panel__body">
          <div class="card-grid">
            <article class="card" id="maestros-card-cursos"></article>
            <article class="card" id="maestros-card-alumnos"></article>
            <article class="card" id="maestros-card-evaluaciones"></article>
          </div>
        </div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Cursos que impartes</h2>
            <p class="panel__subtitle">Asignados, creados o como co-instructor.</p>
          </div>
        </header>
        <div class="panel__body" id="maestros-cursos"></div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Alumnos inscritos</h2>
            <p class="panel__subtitle">Consulta progreso, calificaciones y estado.</p>
          </div>
        </header>
        <div class="panel__body" id="maestros-alumnos"></div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Evaluaciones del curso</h2>
            <p class="panel__subtitle">Versiones, intentos y estadísticas.</p>
          </div>
        </header>
        <div class="panel__body" id="maestros-evaluaciones"></div>
      </section>
    `;
  },

  renderCursos() {
    const container = document.querySelector("#maestros-cursos");
    if (!container) return;

    if (!this.state.cursos.length) {
      container.innerHTML = createEmpty("No tienes cursos asignados por el momento.");
      return;
    }

    container.innerHTML = `
      <div class="list list--divided">
        ${this.state.cursos
          .map(
            (curso) => `
              <div class="list__item">
                <div>
                  <p class="list__title">${curso.nombre ?? "Curso"}</p>
                  <p class="list__meta">${curso.descripcion ?? "Sin descripción"}</p>
                </div>
                <div class="list__actions">
                  <button class="btn btn--ghost" data-action="open-curso" data-curso-id="${curso.id}">Administrar</button>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;

    container.querySelectorAll("[data-action='open-curso']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const cursoId = event.currentTarget.dataset.cursoId;
        this.openCurso(cursoId);
      });
    });

    this.renderDashboardCards();
  },

  renderAlumnos() {
    const container = document.querySelector("#maestros-alumnos");
    if (!container) return;

    if (!this.state.alumnos.length) {
      container.innerHTML = createEmpty("No hay alumnos inscritos registrados.");
      return;
    }

    container.innerHTML = `
      <div class="list list--divided">
        ${this.state.alumnos
          .map(
            (row) => `
              <div class="list__item">
                <div>
                  <p class="list__title">Alumno ${row.usuario_id}</p>
                  <p class="list__meta">Estado: ${row.estado ?? "En proceso"}</p>
                </div>
                <div class="list__actions">
                  <span class="badge badge--primary">${formatPercent(row.progreso ?? 0)}</span>
                  <button class="btn btn--ghost" data-action="open-alumno" data-alumno-id="${row.usuario_id}" data-curso-id="${
              row.curso_id
            }">Ver detalle</button>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;

    container.querySelectorAll("[data-action='open-alumno']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const alumnoId = event.currentTarget.dataset.alumnoId;
        const cursoId = event.currentTarget.dataset.cursoId;
        this.openAlumno(alumnoId, cursoId);
      });
    });
  },

  renderEvaluaciones() {
    const container = document.querySelector("#maestros-evaluaciones");
    if (!container) return;

    if (!this.state.evaluaciones.length) {
      container.innerHTML = createEmpty("No hay evaluaciones registradas para tus cursos.");
      return;
    }

    container.innerHTML = `
      <div class="list list--divided">
        ${this.state.evaluaciones
          .map(
            (evaluacion) => `
              <div class="list__item">
                <div>
                  <p class="list__title">${evaluacion.titulo ?? "Evaluación"}</p>
                  <p class="list__meta">${evaluacion.lecciones?.modulos?.nombre ?? "Módulo"}</p>
                </div>
                <div class="list__actions">
                  <button class="btn btn--ghost" data-action="open-evaluacion" data-evaluacion-id="${evaluacion.id}">Ver reporte</button>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;

    container.querySelectorAll("[data-action='open-evaluacion']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const evaluacionId = event.currentTarget.dataset.evaluacionId;
        this.openEvaluacion(evaluacionId);
      });
    });
  },

  renderDashboardCards() {
    const cursosCard = document.querySelector("#maestros-card-cursos");
    const alumnosCard = document.querySelector("#maestros-card-alumnos");
    const evaluacionesCard = document.querySelector("#maestros-card-evaluaciones");

    if (cursosCard) {
      cursosCard.innerHTML = `
        <h3 class="card__title">Cursos</h3>
        <p class="card__metric">${this.state.cursos.length}</p>
        <p class="card__description">Asignados o creados por ti.</p>
      `;
    }

    if (alumnosCard) {
      alumnosCard.innerHTML = `
        <h3 class="card__title">Alumnos inscritos</h3>
        <p class="card__metric">${this.state.alumnos.length}</p>
        <p class="card__description">Suma total en tus cursos.</p>
      `;
    }

    if (evaluacionesCard) {
      evaluacionesCard.innerHTML = `
        <h3 class="card__title">Evaluaciones</h3>
        <p class="card__metric">${this.state.evaluaciones.length}</p>
        <p class="card__description">Activas para tus grupos.</p>
      `;
    }
  },

  renderError(message) {
    if (!this.selectors.container) return;
    this.selectors.container.innerHTML = `<section class="panel panel--elevated"><div class="panel__body">${message}</div></section>`;
  },

  openCurso(cursoId) {
    console.info("Abrir panel del curso", cursoId);
  },

  openAlumno(alumnoId, cursoId) {
    console.info("Abrir detalle de alumno", alumnoId, "curso", cursoId);
  },

  openEvaluacion(evaluacionId) {
    if (typeof window.loadModule === "function") {
      window.loadModule("evaluacionesModule", { evaluacionId });
    }
  }
};
