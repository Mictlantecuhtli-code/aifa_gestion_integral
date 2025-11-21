import { supabaseDb } from "../supabaseClient.js";

function createInitialState() {
  return {
    currentUser: null,
    roles: [],
    isAlumno: false,
    isAdmin: false,
    cursosInscritos: [],
    progreso: [],
    evaluacionesPendientes: [],
    constancias: [],
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

export const alumnosModule = {
  state: createInitialState(),
  selectors: {},

  async init(currentUser = null) {
    this.state = createInitialState();
    this.state.currentUser = currentUser ?? (await fetchCurrentUser());
    this.selectors = this.resolveSelectors();
    this.ensureContainer();

    await this.loadUserRoles();

    if (!this.state.currentUser || (!this.state.isAlumno && !this.state.isAdmin)) {
      this.renderError("No tienes permisos para acceder al panel de alumnos.");
      return;
    }

    this.renderDashboardAlumno();

    await this.loadCursosInscritos();
    await this.loadProgresoGeneral();
    await this.loadEvaluacionesPendientes();
    await this.loadConstancias();

    this.renderCursos();
    this.renderProgreso();
    this.renderEvaluaciones();
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
    this.state.isAlumno = this.state.roles.includes("alumno");
    this.state.isAdmin = this.state.roles.includes("administrador");
  },

  async loadCursosInscritos() {
    if (!this.state.currentUser) return;

    try {
      const { data, error } = await supabaseDb
        .from("cursos_usuarios")
        .select(
          `curso_id,estado,progreso,fecha_inscripcion,
          cursos:curso_id(id,nombre,descripcion,imagen_portada,activo)`
        )
        .eq("usuario_id", this.state.currentUser.id);

      if (error) throw error;
      this.state.cursosInscritos = (data ?? []).filter((row) => row.cursos?.activo);
    } catch (error) {
      console.error("Error al cargar cursos inscritos", error);
      this.state.cursosInscritos = [];
    }
  },

  async loadProgresoGeneral() {
    if (!this.state.currentUser || !this.state.cursosInscritos.length) return;

    try {
      const cursoIds = this.state.cursosInscritos.map((row) => row.curso_id).filter(Boolean);

      const { data, error } = await supabaseDb
        .from("progreso_lecciones")
        .select("leccion_id,completado,fecha_completado")
        .eq("usuario_id", this.state.currentUser.id);

      if (error) throw error;
      this.state.progreso = data ?? [];
    } catch (error) {
      console.info("No se pudo cargar el progreso de lecciones", error.message);
      this.state.progreso = [];
    }
  },

  async loadEvaluacionesPendientes() {
    if (!this.state.currentUser || !this.state.cursosInscritos.length) return;

    try {
      const cursoIds = this.state.cursosInscritos.map((row) => row.curso_id).filter(Boolean);

      const { data, error } = await supabaseDb
        .from("evaluaciones")
        .select(
          `id,titulo,descripcion,activo,leccion_id,
          lecciones:leccion_id(id,nombre,modulo_id,modulos:modulo_id(id,nombre,curso_id))`
        )
        .eq("activo", true);

      if (error) throw error;

      const cursoIdsSet = new Set(cursoIds);
      this.state.evaluacionesPendientes = (data ?? []).filter((item) =>
        cursoIdsSet.has(item.lecciones?.modulos?.curso_id)
      );
    } catch (error) {
      console.error("Error al cargar evaluaciones pendientes", error);
      this.state.evaluacionesPendientes = [];
    }
  },

  async loadConstancias() {
    if (!this.state.currentUser) return;

    try {
      const { data, error } = await supabaseDb
        .from("constancias")
        .select(
          `id,folio,fecha_emision,curso_id,
          cursos:curso_id(id,nombre)`
        )
        .eq("usuario_id", this.state.currentUser.id)
        .order("fecha_emision", { ascending: false });

      if (error) throw error;
      this.state.constancias = data ?? [];
    } catch (error) {
      console.info("No se pudo cargar constancias", error.message);
      this.state.constancias = [];
    }
  },

  renderDashboardAlumno() {
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
            <article class="card" id="alumnos-card-evaluaciones"></article>
          </div>
        </div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Mis cursos</h2>
            <p class="panel__subtitle">Cursos en los que estás inscrito actualmente.</p>
          </div>
        </header>
        <div class="panel__body" id="alumnos-cursos"></div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Progreso general</h2>
            <p class="panel__subtitle">Tu avance en cada curso inscrito.</p>
          </div>
        </header>
        <div class="panel__body" id="alumnos-progreso"></div>
      </section>

      <section class="panel panel--elevated">
        <header class="panel__header">
          <div class="panel__heading">
            <h2 class="panel__title">Evaluaciones pendientes</h2>
            <p class="panel__subtitle">Evaluaciones que debes completar.</p>
          </div>
        </header>
        <div class="panel__body" id="alumnos-evaluaciones"></div>
      </section>
    `;
  },

  renderCursos() {
    const container = document.querySelector("#alumnos-cursos");
    if (!container) return;

    if (!this.state.cursosInscritos.length) {
      container.innerHTML = createEmpty("No estás inscrito en ningún curso por el momento.");
      return;
    }

    container.innerHTML = `
      <div class="list list--divided">
        ${this.state.cursosInscritos
          .map(
            (inscripcion) => `
              <div class="list__item">
                <div>
                  <p class="list__title">${inscripcion.cursos?.nombre ?? "Curso"}</p>
                  <p class="list__meta">${inscripcion.cursos?.descripcion ?? "Sin descripción"}</p>
                </div>
                <div class="list__actions">
                  <span class="badge badge--primary">${formatPercent(inscripcion.progreso ?? 0)}</span>
                  <button class="btn btn--ghost" data-action="open-curso" data-curso-id="${
                    inscripcion.curso_id
                  }">Ver curso</button>
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

  renderProgreso() {
    const container = document.querySelector("#alumnos-progreso");
    if (!container) return;

    if (!this.state.cursosInscritos.length) {
      container.innerHTML = createEmpty("No hay datos de progreso disponibles.");
      return;
    }

    const progresoHTML = this.state.cursosInscritos
      .map(
        (inscripcion) => `
          <div class="list__item">
            <div>
              <p class="list__title">${inscripcion.cursos?.nombre ?? "Curso"}</p>
              <p class="list__meta">Estado: ${inscripcion.estado ?? "En progreso"}</p>
            </div>
            <div class="list__actions">
              <div class="progress-bar">
                <div class="progress-bar__fill" style="width: ${inscripcion.progreso ?? 0}%"></div>
              </div>
              <span class="badge badge--primary">${formatPercent(inscripcion.progreso ?? 0)}</span>
            </div>
          </div>
        `
      )
      .join("");

    container.innerHTML = `<div class="list list--divided">${progresoHTML}</div>`;
  },

  renderEvaluaciones() {
    const container = document.querySelector("#alumnos-evaluaciones");
    if (!container) return;

    if (!this.state.evaluacionesPendientes.length) {
      container.innerHTML = createEmpty("No tienes evaluaciones pendientes.");
      return;
    }

    container.innerHTML = `
      <div class="list list--divided">
        ${this.state.evaluacionesPendientes
          .map(
            (evaluacion) => `
              <div class="list__item">
                <div>
                  <p class="list__title">${evaluacion.titulo ?? "Evaluación"}</p>
                  <p class="list__meta">${evaluacion.lecciones?.nombre ?? "Lección"} - ${
              evaluacion.lecciones?.modulos?.nombre ?? "Módulo"
            }</p>
                </div>
                <div class="list__actions">
                  <button class="btn btn--primary" data-action="iniciar-evaluacion" data-evaluacion-id="${
                    evaluacion.id
                  }">Iniciar</button>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;

    container.querySelectorAll("[data-action='iniciar-evaluacion']").forEach((button) => {
      button.addEventListener("click", (event) => {
        const evaluacionId = event.currentTarget.dataset.evaluacionId;
        this.iniciarEvaluacion(evaluacionId);
      });
    });
  },

  renderDashboardCards() {
    const cursosCard = document.querySelector("#alumnos-card-cursos");
    const progresoCard = document.querySelector("#alumnos-card-progreso");
    const evaluacionesCard = document.querySelector("#alumnos-card-evaluaciones");

    const cursosActivos = this.state.cursosInscritos.filter((c) => c.estado !== "completado").length;
    const cursosCompletados = this.state.cursosInscritos.filter((c) => c.estado === "completado").length;
    const progresoPromedio =
      this.state.cursosInscritos.length > 0
        ? this.state.cursosInscritos.reduce((sum, c) => sum + (c.progreso ?? 0), 0) /
          this.state.cursosInscritos.length
        : 0;

    if (cursosCard) {
      cursosCard.innerHTML = `
        <h3 class="card__title">Cursos</h3>
        <p class="card__metric">${this.state.cursosInscritos.length}</p>
        <p class="card__description">Asignados</p>
        <p class="card__meta">${cursosActivos} en progreso · ${cursosCompletados} completados</p>
      `;
    }

    if (progresoCard) {
      progresoCard.innerHTML = `
        <h3 class="card__title">Progreso promedio</h3>
        <p class="card__metric">${formatPercent(progresoPromedio)}</p>
        <p class="card__description">Avance acumulado en todos tus cursos.</p>
      `;
    }

    if (evaluacionesCard) {
      evaluacionesCard.innerHTML = `
        <h3 class="card__title">Evaluaciones</h3>
        <p class="card__metric">${this.state.evaluacionesPendientes.length}</p>
        <p class="card__description">Activas para tus grupos.</p>
      `;
    }
  },

  renderError(message) {
    if (!this.selectors.container) return;
    this.selectors.container.innerHTML = `<section class="panel panel--elevated"><div class="panel__body">${message}</div></section>`;
  },

  openCurso(cursoId) {
    console.info("Abrir curso", cursoId);
  },

  iniciarEvaluacion(evaluacionId) {
    console.info("Iniciar evaluación", evaluacionId);
  }
};
