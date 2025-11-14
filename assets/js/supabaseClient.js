if (typeof window === "undefined" || typeof window.supabase === "undefined") {
  throw new Error("Supabase no está disponible en el contexto actual.");
}

const supabaseClient = window.supabase.createClient(
  "https://dpvsmibnlkwsbdmsnsjr.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwdnNtaWJubGt3c2JkbXNuc2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NDMxOTgsImV4cCI6MjA3ODUxOTE5OH0.h66cLOGP9AyAgz-gwvTaPpRfkUDgd3sg9wTRfLVEhAs",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  }
);

export const supabaseDb = supabaseClient;
