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
import { initializeConstanciasModule } from "./modules/constanciasModule.js";
import { initializeReportesModule } from "./modules/reportesModule.js";
import { alumnosModule } from "./modules/alumnosModule.js";
import { maestrosModule } from "./modules/maestrosModule.js";
import { ROLE_ACCESS_WHITELIST, normalizeRoles } from "./constants/roles.js";

const selectors = {
  logoutButton: document.querySelector("#btn-logout"),
  navigationLinks: [],
  moduleContainer: document.querySelector("#module-container"),
  topbarSubtitle: document.querySelector(".topbar__subtitle"),
  adminMenu: document.querySelector(".admin-menu--primary"),
  body: document.body
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
  constancias: {
    templateId: "module-template-constancias",
    subtitle: "Emisión de constancias",
    initialize: (user) => initializeConstanciasModule(user)
  },
  reportes: {
    templateId: "module-template-reportes",
    subtitle: "Panel de reportes",
    initialize: (user) => initializeReportesModule(user)
  },
  alumnos: {
    templateId: "module-template-alumnos",
    subtitle: "Panel del alumno",
    initialize: (user) => alumnosModule.init(user)
  },
  maestros: {
    templateId: "module-template-maestros",
    subtitle: "Panel del instructor",
    initialize: (user) => maestrosModule.init(user)
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
let currentUserRoles = [];

async function initApp() {
  const sessionInfo = await ensureAuthenticated();
  if (!sessionInfo) {
    return;
  }

  currentUser = sessionInfo.user;
  currentUserRoles = sessionInfo.roles;

  // Cargar los links de navegación después de tener la sesión
  selectors.navigationLinks = Array.from(document.querySelectorAll(".admin-menu--primary .admin-menu__button"));

  configureNavigationVisibility();
  registerGlobalEventListeners();
  
  const defaultModule =
    getPreferredModuleFromHash() ??
    getPreferredModuleFromRoles() ??
    "usuarios";
    
  await loadModule(defaultModule);
}

function getPreferredModuleFromHash() {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return null;
  return Object.keys(moduleDefinitions).includes(hash) ? hash : null;
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

  const roles = normalizeRoles(data);
  const hasAccess = roles.some((role) => ROLE_ACCESS_WHITELIST.includes(role));
  if (!hasAccess) {
    await supabaseDb.auth.signOut();
    redirectToLogin();
    return null;
  }

  return { user: session.user, roles };
}

function redirectToLogin() {
  window.location.replace("index.html");
}

function getPreferredModuleFromRoles() {
  if (!currentUserRoles.length) return null;
  if (currentUserRoles.includes("administrador")) return "usuarios";
  if (currentUserRoles.includes("maestro") || currentUserRoles.includes("instructor")) return "maestros";
  if (currentUserRoles.includes("alumno")) return "alumnos";
  return null;
}

function configureNavigationVisibility() {
  const isAdmin = currentUserRoles.includes("administrador");
  const isMaestro = currentUserRoles.includes("maestro") || currentUserRoles.includes("instructor");
  const isAlumno = currentUserRoles.includes("alumno");

  // Añadir clase al body para controlar el diseño
  if (selectors.body) {
    selectors.body.classList.toggle("role-only-shell", !isAdmin);
  }

  if (!selectors.adminMenu) return;

  // Si es administrador, mostrar todos los botones
  if (isAdmin) {
    selectors.adminMenu.removeAttribute("hidden");
    selectors.navigationLinks.forEach(link => {
      link.style.display = "";
    });
    return;
  }

  // Si NO es administrador, ocultar todos los botones admin y mostrar solo el del rol
  selectors.adminMenu.removeAttribute("hidden");
  
  // Ocultar todos los botones existentes
  selectors.navigationLinks.forEach(link => {
    link.style.display = "none";
  });

  // Determinar qué módulo mostrar
  let moduleKey = null;
  let buttonLabel = "";
  
  if (isMaestro) {
    moduleKey = "maestros";
    buttonLabel = "Panel Maestro";
  } else if (isAlumno) {
    moduleKey = "alumnos";
    buttonLabel = "Panel Alumno";
  }

  if (moduleKey) {
    // Buscar si ya existe el botón para este módulo
    let roleButton = selectors.navigationLinks.find(
      btn => btn.dataset.moduleTarget === moduleKey
    );

    // Si no existe, crearlo
    if (!roleButton) {
      roleButton = document.createElement("button");
      roleButton.className = "admin-menu__button";
      roleButton.dataset.moduleTarget = moduleKey;
      roleButton.dataset.roleButton = "true";
      roleButton.setAttribute("aria-pressed", "false");
      roleButton.textContent = buttonLabel;
      
      // Añadirlo al menú
      const section = selectors.adminMenu.querySelector(".admin-menu__section");
      if (section) {
        section.appendChild(roleButton);
      }
      
      // Añadirlo a la lista de links
      selectors.navigationLinks.push(roleButton);
      
      // Registrar el evento click
      roleButton.addEventListener("click", async () => {
        if (moduleKey === currentModuleKey) return;
        await loadModule(moduleKey);
      });
    }

    // Mostrar el botón
    roleButton.style.display = "";
  }
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

  if (window.location.hash.replace("#", "") !== moduleKey) {
    window.location.hash = moduleKey;
  }

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
