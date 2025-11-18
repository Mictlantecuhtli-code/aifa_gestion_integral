import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

// CORS headers simplificados y efectivos
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  // ⚠️ CRÍTICO: Este check DEBE estar PRIMERO, antes de cualquier otra lógica
  if (req.method === "OPTIONS") {
    console.log("✅ Preflight OPTIONS request received");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  // Validar método POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Método no permitido" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  // Validar configuración de Supabase
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: "Configuración de Supabase incompleta" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  // Parsear payload
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch (_) {
    return new Response(
      JSON.stringify({ ok: false, error: "Payload JSON inválido" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  // Extraer y validar campos
  const email = String(payload.email ?? "").trim();
  const password = String(payload.password ?? "").trim();
  const nombre = String(payload.nombre ?? "").trim();
  const apellido = payload.apellido ? String(payload.apellido).trim() : null;
  const areaId = payload.area_id ?? payload.area;
  const jerarquiaId = payload.jerarquia_id ?? payload.jerarquia;
  const estado = payload.estado ?? payload.activo ?? true;
  const rolId = payload.rol_id ?? payload.rolId ?? null;
  const tableName = typeof payload.table === "string" && payload.table.trim() 
    ? payload.table.trim() 
    : "usuarios";

  if (!email || !password || !nombre || !areaId || !jerarquiaId) {
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: "Faltan campos obligatorios: email, password, nombre, área o jerarquía" 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  // Crear cliente de Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Crear usuario en Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, apellido, area: areaId, jerarquia: jerarquiaId, estado }
  });

  if (authError) {
    console.error("Error Auth:", authError);
    return new Response(
      JSON.stringify({ ok: false, error: authError.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  const userId = authData?.user?.id;
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, error: "No se recibió un ID de usuario" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  // Crear perfil
  const profilePayload: Record<string, unknown> = {
    id: userId,
    nombre,
    correo: email,
    area_id: areaId,
    jerarquia_id: jerarquiaId,
    activo: Boolean(estado)
  };

  if (apellido) {
    profilePayload.apellido = apellido;
  }

  const { error: profileError } = await supabase.from(tableName).insert(profilePayload);
  if (profileError) {
    console.error("Error Profile:", profileError);
    return new Response(
      JSON.stringify({ ok: false, error: profileError.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  // Asignar rol si existe
  if (rolId) {
    const { error: roleError } = await supabase.from("usuarios_roles").insert({
      usuario_id: userId,
      rol_id: rolId
    });

    if (roleError) {
      console.error("Error Role:", roleError);
      return new Response(
        JSON.stringify({ ok: false, error: roleError.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
  }

  console.log("✅ Usuario creado exitosamente:", userId);

  return new Response(
    JSON.stringify({ ok: true, userId, error: null }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
});
