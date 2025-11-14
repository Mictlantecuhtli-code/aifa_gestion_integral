if (typeof window === "undefined" || typeof window.supabase === "undefined") {
  throw new Error("Supabase no está disponible en el contexto actual.");
}

const SUPABASE_URL =
  window.__supabaseConfig?.url ?? "https://dpvsmibnlkwsbdmsnsjr.supabase.co";
const SUPABASE_ANON_KEY =
  window.__supabaseConfig?.anonKey ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwdnNtaWJubGt3c2JkbXNuc2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NDMxOTgsImV4cCI6MjA3ODUxOTE5OH0.h66cLOGP9AyAgz-gwvTaPpRfkUDgd3sg9wTRfLVEhAs";

const SERVICE_ROLE_KEY_SOURCES = [
  () => window.__supabaseConfig?.serviceRoleKey,
  () => {
    try {
      return window.localStorage?.getItem("supabase.service_role_key") ?? null;
    } catch (error) {
      console.warn("No fue posible leer la Service Role Key desde localStorage", error);
      return null;
    }
  },
  () => window.__SUPABASE_SERVICE_ROLE_KEY ?? null
];

const resolveServiceRoleKey = () => {
  for (const resolver of SERVICE_ROLE_KEY_SOURCES) {
    try {
      const value = resolver();
      if (value) return value;
    } catch (error) {
      console.warn("Error al intentar resolver la Service Role Key", error);
    }
  }
  return null;
};

const serviceRoleKey = resolveServiceRoleKey();

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

let supabaseAdminClient = null;

function getSupabaseAdminClient() {
  if (!serviceRoleKey) return null;
  if (!supabaseAdminClient) {
    supabaseAdminClient = window.supabase.createClient(SUPABASE_URL, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabaseAdminClient;
}

export const supabaseDb = supabaseClient;
export const supabaseAdminDb = {
  get client() {
    return getSupabaseAdminClient();
  },
  hasAccess() {
    return Boolean(getSupabaseAdminClient());
  }
};
