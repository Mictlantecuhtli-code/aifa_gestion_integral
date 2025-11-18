if (typeof window === "undefined" || typeof window.supabase === "undefined") {
  throw new Error("Supabase no está disponible en el contexto actual.");
}

export const SUPABASE_URL =
  window.__supabaseConfig?.url ?? "https://dpvsmibnlkwsbdmsnsjr.supabase.co";
export const SUPABASE_ANON_KEY =
  window.__supabaseConfig?.anonKey ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwdnNtaWJubGt3c2JkbXNuc2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NDMxOTgsImV4cCI6MjA3ODUxOTE5OH0.h66cLOGP9AyAgz-gwvTaPpRfkUDgd3sg9wTRfLVEhAs";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

export const supabaseDb = supabaseClient;
