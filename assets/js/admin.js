import { supabaseDb } from "./supabaseClient.js";
import { initializeUsersModule } from "./usersModule.js";
import { initializeCursosModule } from "./cursosModule.js";
import { initializeRolesModule } from "./rolesModule.js";
import { initializePermisosModule } from "./permisosModule.js";
import { initializeRolesPermisosModule } from "./rolesPermisosModule.js";
import { initializeModulosCursoModule } from "./modules/modulosCursoModule.js";
import { initializeLeccionesModule } from "./modules/leccionesModule.js";
import { initializeMaterialesModule } from "./modules/materialesModule.js";
import { initializeBancoPreguntasModule } from "./modules/bancoPreguntasModule.js";
import { initializeEvaluacionesModule } from "./modules/evaluacionesModule.js";

const selectors = {
  logoutButton: document.querySelector("#btn-logout"),
  navigationLinks: Array.from(document.querySelectorAll(".admin-menu__button")),
  moduleContainer: document.querySelector("#module-container"),
  topbarSubtitle: document.querySelector(".topbar__subtitle")
};

const moduleDefinitions = {
  usuarios: {
    templateId: "module-template-usuarios",
    subtitle: "Administración de usuarios",
    initialize: () => initializeUsersModule()
  },
  cursos: {
    templateId: "module-template-cursos",
    subtitle: "Administración de cursos",
    initialize: (user) => initializeCursosModule(user)
  },
  "modulos-curso": {
    templateId: "module-template-modulos-curso",
    subtitle: "Administración de módulos de curso",
    initialize: (user) => initializeModulosCursoModule(user)
  },
  lecciones: {
    templateId: "module-template-lecciones",
    subtitle: "Administración de lecciones",
    initialize: (user) => initializeLeccionesModule(user)
  },
  materiales: {
    templateId: "module-template-materiales",
    subtitle: "Administración de materiales",
    initialize: (user) => initializeMaterialesModule(user)
  },
  "banco-preguntas": {
    templateId: "module-template-banco-preguntas",
    subtitle: "Banco de preguntas",
    initialize: (user) => initializeBancoPreguntasModule(user)
  },
  evaluaciones: {
    templateId: "module-template-evaluaciones",
    subtitle: "Administración de evaluaciones",
    initialize: (user) => initializeEvaluacionesModule(user)
  },
  roles: {
    templateId: "module-template-roles",
    subtitle: "Administración de roles",
    initialize: (user) => initializeRolesModule(user)
  },
  permisos: {
    templateId: "module-template-permisos",
    subtitle: "Administración de permisos",
    initialize: () => initializePermisosModule()
  },
  asignaciones: {
    templateId: "module-template-asignaciones",
    subtitle: "Asignación de permisos",
    initialize: () => initializeRolesPermisosModule()
  }
};

let currentModuleKey = null;
let currentUser = null;
async function initApp() {
  currentUser = await ensureAuthenticated();
  if (!currentUser) {
    return;
  }

  registerGlobalEventListeners();
  const defaultModule = selectors.navigationLinks.find((link) => link.dataset.moduleTarget)?.dataset.moduleTarget ?? "usuarios";
  await loadModule(defaultModule);
}

async function ensureAuthenticated() {
  const {
    data: { session }
  } = await supabaseDb.auth.getSession();

  if (!session) {
    redirectToLogin();
    return null;
  }

  const { data, error } = await supabaseDb
    .from("usuarios_roles")
    .select("roles:rol_id(nombre)")
    .eq("usuario_id", session.user.id);

  if (error) {
    console.error("Error al verificar permisos", error);
    redirectToLogin();
    return null;
  }

  const isAdmin = (data ?? []).some((row) => (row.roles?.nombre ?? "").toLowerCase() === "administrador");
  if (!isAdmin) {
    await supabaseDb.auth.signOut();
    redirectToLogin();
    return null;
  }

  return session.user;
}

function redirectToLogin() {
  window.location.replace("index.html");
}

function registerGlobalEventListeners() {
  selectors.logoutButton?.addEventListener("click", async () => {
    await supabaseDb.auth.signOut();
    redirectToLogin();
  });

  selectors.navigationLinks.forEach((control) => {
    control.addEventListener("click", async () => {
      const moduleKey = control.dataset.moduleTarget;
      if (!moduleKey || moduleKey === currentModuleKey) return;
      await loadModule(moduleKey);
    });
  });
}

async function loadModule(moduleKey) {
  const definition = moduleDefinitions[moduleKey];
  if (!definition || !selectors.moduleContainer) return;

  currentModuleKey = moduleKey;
  setActiveNavigation(moduleKey);
  updateSubtitle(definition.subtitle);
  showLoadingState();

  const template = document.getElementById(definition.templateId);
  if (!template) {
    console.error(`No se encontró la plantilla para el módulo ${moduleKey}`);
    hideLoadingState();
    return;
  }

  const content = template.content.cloneNode(true);
  selectors.moduleContainer.replaceChildren(content);

  try {
    await definition.initialize(currentUser);
  } catch (error) {
    console.error(`Error al cargar el módulo ${moduleKey}`, error);
  }

  hideLoadingState();
}

function setActiveNavigation(moduleKey) {
  selectors.navigationLinks.forEach((control) => {
    const isActive = control.dataset.moduleTarget === moduleKey;
    control.classList.toggle("admin-menu__button--active", isActive);
    control.setAttribute("aria-pressed", String(isActive));
  });
}

function updateSubtitle(subtitle) {
  if (!selectors.topbarSubtitle) return;
  selectors.topbarSubtitle.textContent = subtitle;
}

function showLoadingState() {
  if (!selectors.moduleContainer) return;
  selectors.moduleContainer.classList.add("admin-module--loading");
  selectors.moduleContainer.innerHTML = `
    <section class="panel panel--elevated admin-module__loading">
      <header class="panel__header">
        <div class="panel__heading">
          <h1 class="panel__title">Cargando módulo…</h1>
          <p class="panel__subtitle">Por favor espere mientras se prepara la información.</p>
        </div>
      </header>
    </section>
  `;
}

function hideLoadingState() {
  selectors.moduleContainer?.classList.remove("admin-module--loading");
}

initApp().catch((error) => {
  console.error("Error al inicializar la consola de administración", error);
});
