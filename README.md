# aifa_gestion_integral

## Configuración de Supabase

El panel administrativo utiliza únicamente la **Anon Key** para las operaciones del cliente. La creación de usuarios en `auth.users` se realiza a través de la Edge Function `crear_usuario`, que debe ejecutarse en Supabase con las variables de entorno:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (solo disponible en el backend)

No es necesario exponer la Service Role Key en el navegador; basta con desplegar la función con la configuración de entorno correspondiente.
