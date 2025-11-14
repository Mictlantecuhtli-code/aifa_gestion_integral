# aifa_gestion_integral

## Configuración de Supabase

El panel administrativo necesita dos claves para operar:

1. **Anon Key**: se utiliza para las operaciones regulares del cliente y ya está incrustada en el proyecto.
2. **Service Role Key**: requerida para crear cuentas en `auth.users` al registrar un nuevo usuario.

La Service Role Key no se incluye en el repositorio. Para habilitar la creación de usuarios se puede proporcionar por cualquiera de los siguientes medios antes de cargar `admin.html`:

- Definir el objeto global `window.__supabaseConfig` con la propiedad `serviceRoleKey`.
- Guardar la clave en `localStorage` con el identificador `supabase.service_role_key`.
- Asignar la clave a la variable global `window.__SUPABASE_SERVICE_ROLE_KEY`.
- Utilizar el botón **Configurar llave** que aparece en el módulo de usuarios para guardar o borrar la clave directamente desde la interfaz.

Si la clave no está disponible, el panel mostrará un aviso en la parte superior del módulo de usuarios indicando que falta la configuración necesaria y detendrá el proceso de alta hasta que se proporcione.
