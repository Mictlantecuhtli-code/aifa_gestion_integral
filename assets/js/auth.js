import { supabaseDb } from "./supabaseClient.js";

const loginForm = document.querySelector("#login-form");
const hint = document.querySelector("#form-hint");
const submitButton = loginForm?.querySelector("button[type='submit']");

async function redirectIfAuthenticated() {
  const {
    data: { session }
  } = await supabaseDb.auth.getSession();

  if (!session) return;

  const hasAdminRole = await userHasAdministratorRole(session.user.id);
  if (hasAdminRole) {
    window.location.replace("admin.html");
  }
}

async function userHasAdministratorRole(userId) {
  const { data, error } = await supabaseDb
    .from("usuarios_roles")
    .select("roles:rol_id(nombre)")
    .eq("usuario_id", userId);

  if (error) {
    console.error("Error al verificar roles", error);
    return false;
  }

  return (data ?? []).some((row) => (row.roles?.nombre ?? "").toLowerCase() === "administrador");
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

  const isAdmin = await userHasAdministratorRole(data.user.id);
  if (!isAdmin) {
    setFormState({
      loading: false,
      message: "Tu cuenta no tiene permisos para acceder al panel administrativo.",
      isError: true
    });
    await supabaseDb.auth.signOut();
    return;
  }

  setFormState({ loading: false, message: "Acceso concedido. Redireccionando…" });
  window.location.replace("admin.html");
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
