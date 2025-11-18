import { supabaseDb } from "./supabaseClient.js";

const loginForm = document.querySelector("#login-form");
const hint = document.querySelector("#form-hint");
const submitButton = loginForm?.querySelector("button[type='submit']");

const ALLOWED_ROLES = ["administrador", "maestro", "instructor", "alumno"];

async function redirectIfAuthenticated() {
  const {
    data: { session }
  } = await supabaseDb.auth.getSession();

  if (!session) return;

  const destination = await resolveDestination(session.user.id);
  if (destination) {
    window.location.replace(destination);
  }
}

async function authenticate(email, password) {
  setFormState({ loading: true, message: "Validando credenciales…" });
  const { data, error } = await supabaseDb.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("Error de autenticación", error);
    setFormState({
      loading: false,
      message: "No pudimos validar tus datos. Verifica tu correo y contraseña.",
      isError: true
    });
    return;
  }

  const destination = await resolveDestination(data.user.id);
  if (!destination) {
    setFormState({
      loading: false,
      message: "Tu cuenta no tiene permisos para acceder al panel administrativo.",
      isError: true
    });
    await supabaseDb.auth.signOut();
    return;
  }

  setFormState({ loading: false, message: "Acceso concedido. Redireccionando…" });
  window.location.replace(destination);
}

async function resolveDestination(userId) {
  const { data, error } = await supabaseDb
    .from("usuarios_roles")
    .select("roles:rol_id(nombre)")
    .eq("usuario_id", userId);

  if (error) {
    console.error("Error al verificar roles", error);
    return null;
  }

  const roles = (data ?? []).map((row) => (row.roles?.nombre ?? "").toLowerCase());
  if (!roles.some((role) => ALLOWED_ROLES.includes(role))) return null;

  if (roles.includes("administrador")) return "admin.html";
  if (roles.includes("maestro") || roles.includes("instructor")) return "admin.html#maestros";
  if (roles.includes("alumno")) return "admin.html#alumnos";

  return null;
}

function setFormState({ loading, message, isError = false }) {
  if (!submitButton || !hint) return;

  submitButton.disabled = Boolean(loading);
  submitButton.textContent = loading ? "Ingresando…" : "Iniciar sesión";
  hint.textContent = message ?? "";
  hint.classList.toggle("is-error", Boolean(isError));
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    setFormState({ message: "Ingresa tu correo y contraseña.", isError: true });
    return;
  }

  await authenticate(email, password);
});

redirectIfAuthenticated();
