if (typeof window === "undefined" || typeof window.supabase === "undefined") {
  throw new Error("Supabase no está disponible en el contexto actual.");
}

const SUPABASE_URL =
  window.__supabaseConfig?.url ?? "https://dpvsmibnlkwsbdmsnsjr.supabase.co";
const SUPABASE_ANON_KEY =
  window.__supabaseConfig?.anonKey ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwdnNtaWJubGt3c2JkbXNuc2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NDMxOTgsImV4cCI6MjA3ODUxOTE5OH0.h66cLOGP9AyAgz-gwvTaPpRfkUDgd3sg9wTRfLVEhAs";

const SERVICE_ROLE_STORAGE_KEY = "supabase.service_role_key";

const readServiceRoleKeyFromLocalStorage = () => {
  try {
    const storedValue = window.localStorage?.getItem(SERVICE_ROLE_STORAGE_KEY) ?? null;
    return storedValue ? storedValue.trim() : null;
  } catch (error) {
    console.warn("No fue posible leer la Service Role Key desde localStorage", error);
    return null;
  }
};

const SERVICE_ROLE_KEY_SOURCES = [
  () => window.__supabaseConfig?.serviceRoleKey ?? null,
  readServiceRoleKeyFromLocalStorage,
  () => window.__SUPABASE_SERVICE_ROLE_KEY ?? null
];

const resolveServiceRoleKey = () => {
  for (const resolver of SERVICE_ROLE_KEY_SOURCES) {
    try {
      const value = resolver();
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    } catch (error) {
      console.warn("Error al intentar resolver la Service Role Key", error);
    }
  }
  return null;
};

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

let supabaseAdminClient = null;
let supabaseAdminClientKey = null;

function getSupabaseAdminClient() {
  const serviceRoleKey = resolveServiceRoleKey();
  if (!serviceRoleKey) {
    supabaseAdminClient = null;
    supabaseAdminClientKey = null;
    return null;
  }

  if (!supabaseAdminClient || supabaseAdminClientKey !== serviceRoleKey) {
    supabaseAdminClient = window.supabase.createClient(SUPABASE_URL, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    supabaseAdminClientKey = serviceRoleKey;
  }
  return supabaseAdminClient;
}

export const supabaseDb = supabaseClient;
export const supabaseAdminDb = {
  get client() {
    return getSupabaseAdminClient();
  },
  hasAccess() {
    return Boolean(resolveServiceRoleKey());
  }
};

export function setSupabaseServiceRoleKey(newKey) {
  const normalizedKey = typeof newKey === "string" ? newKey.trim() : "";

  try {
    if (normalizedKey) {
      window.localStorage?.setItem(SERVICE_ROLE_STORAGE_KEY, normalizedKey);
    } else {
      window.localStorage?.removeItem(SERVICE_ROLE_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("No fue posible actualizar la Service Role Key en localStorage", error);
  }

  if (normalizedKey) {
    window.__SUPABASE_SERVICE_ROLE_KEY = normalizedKey;
  } else {
    delete window.__SUPABASE_SERVICE_ROLE_KEY;
  }

  supabaseAdminClient = null;
  supabaseAdminClientKey = null;
}
