# Reportes San Camilo

Mapa colaborativo para que los vecinos de la colonia **San Camilo** (Kanasín, Yucatán) reporten problemas en la vía pública:

- 🕳️ Baches
- 💡 Alumbrado público (sin luz o con fallas)
- 🌊 Calles que se inundan
- 🚧 Calles sin pavimentar

Cualquiera puede ver el mapa y enviar un reporte tocando el punto donde está el problema. Los reportes **no se publican hasta que el administrador los aprueba** en `/admin`.

## Cómo funciona

| Parte | Tecnología | Costo |
| --- | --- | --- |
| Aplicación web (frontend + API) | [Next.js](https://nextjs.org) 15, React 19, TypeScript | Gratis (Vercel Hobby) |
| Mapa | [MapLibre GL JS](https://maplibre.org) + mapa vectorial de [OpenFreeMap](https://openfreemap.org) (datos de OpenStreetMap) | Gratis, sin API key ni límites |
| Fotos | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (comprimidas a ~200 KB en el teléfono) | Gratis (plan Hobby) |
| Base de datos | PostgreSQL ([Neon](https://neon.tech), plan gratuito) con `pg` + `attachDatabasePool` de Vercel | Gratis |

Todo es software libre. No se guardan datos personales: la IP solo se guarda como hash irreversible para limitar envíos abusivos y contar apoyos una vez por persona. Las fotos se comprimen en el teléfono antes de subirse y se borran si el reporte se rechaza o elimina.

### Flujo de un reporte

1. El vecino toca **"+ Reportar problema"**, marca el punto (o usa su ubicación), elige la categoría y opcionalmente escribe la calle y una descripción. Por ahora solo el equipo (admin y colaboradores, con sesión iniciada) puede agregar una foto, y no tiene el límite de reportes por hora. Para **calles sin pavimentar** se marca la calle completa: al tocarla se dibuja sola con los datos de OpenStreetMap, o se traza a mano punto por punto.
2. El reporte se guarda como **Pendiente**.
3. El administrador o un colaborador entra a `/admin`, lo revisa y lo **aprueba** o **rechaza**.
4. Los aprobados aparecen en el mapa público, con la fecha del reporte y los días que lleva sin arreglarse. Al alejar el zoom se agrupan con números.
5. Cuando se arregla, el admin lo marca como **Arreglado** (desde el panel, con fecha, o desde el globo del mapa). Se guarda la fecha y se muestra cuántos días tardó; se ven con el filtro "Arreglados".

### Apoyos y duplicados

- En las calles sin pavimentar, los vecinos pueden tocar **"Apoyo la pavimentación"** (cuenta una vez por persona).
- En `/admin`, los reportes pendientes muy cercanos y de la misma categoría se agrupan, y se avisa si ya existe uno publicado cerca, para rechazar duplicados.

### Protecciones

- Solo se aceptan puntos dentro del contorno de la colonia (validado en el servidor).
- Máximo 5 reportes por hora por persona (el equipo con sesión no tiene límite) y un campo trampa contra bots.
- Panel con cuentas propias: contraseñas guardadas solo como hash **scrypt** con sal (parámetros de OWASP), sesión firmada (cookie `httpOnly`) que se comprueba contra la base en cada petición, y bloqueo tras 5 intentos fallidos por IP o 10 por cuenta.

### Cuentas del panel

| | Administrador | Colaborador |
| --- | --- | --- |
| Aprobar, rechazar, ocultar, marcar arreglado | ✅ | ✅ |
| Eliminar reportes | ✅ | ❌ |
| Crear, desactivar o eliminar colaboradores y ponerles contraseña temporal | ✅ | ❌ |
| Cambiar su propia contraseña | ✅ | ✅ |

- Solo puede haber **un administrador** (lo impide un índice único en la base).
- **Primera vez:** con la tabla `users` vacía, `/admin` muestra "Crea tu cuenta de administrador". Se escribe la contraseña de `ADMIN_PASSWORD` y se eligen usuario y contraseña nuevos. Después la variable ya no sirve y se borra de Vercel.
- Los colaboradores reciben una contraseña temporal y deben cambiarla al entrar. Cambiar o restablecer una contraseña, o desactivar la cuenta, cierra sus sesiones abiertas.
- Cada reporte guarda qué usuario hizo el último cambio de estado (solo se ve en el panel).
- **Si el administrador olvida su contraseña:** en el SQL Editor de Neon corre `DELETE FROM users WHERE role = 'admin';`, vuelve a poner `ADMIN_PASSWORD` en Vercel, redeploy y repite la primera vez. Los colaboradores no se borran.

## Estructura

```
db/migrations/      Esquema SQL versionado (se aplica con npm run db:migrate)
db/seed.sql         Reportes iniciales del mapa original de Google My Maps
src/lib/config.ts   Contorno de la colonia, categorías y límites  ← personalizable
src/lib/            Acceso a datos, validación, cuentas y autenticación
src/app/            Páginas (/, /admin, /admin/usuarios, /admin/cuenta) y API (/api/reports)
src/components/     Mapa y formulario
```

Para adaptar la app a otra colonia, basta con cambiar `src/lib/config.ts`.

`neon.ts` declara los servicios de Neon del proyecto (solo Postgres). Las migraciones usan `DATABASE_URL_UNPOOLED` (conexión directa) si existe; la app usa `DATABASE_URL` (pooled).

## Desarrollo local

Requisitos: Node.js 22+ y un Postgres (local o la misma base de Neon).

```bash
npm install
cp .env.example .env.local     # y llena los valores
npm run db:migrate             # crea las tablas
npm run db:seed                # opcional: carga los reportes iniciales
npm run dev                    # http://localhost:3000
```

Comandos útiles: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Despliegue gratuito (Neon + Vercel)

### 1. Base de datos en Neon

1. Crea una cuenta en <https://neon.tech> (puedes entrar con GitHub).
2. Crea un proyecto, por ejemplo `san-camilo`, en la región **AWS US East (Ohio)** o la más cercana.
3. En **Connect**, copia la cadena de conexión con **Connection pooling** activado. Se ve así:
   `postgresql://usuario:password@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Crea las tablas desde tu computadora:
   ```bash
   DATABASE_URL="<la cadena de Neon>" npm run db:seed
   ```
   (`db:seed` también aplica las migraciones). Si prefieres no instalar nada, puedes pegar el contenido de `db/migrations/001_init.sql` y luego `db/seed.sql` en el **SQL Editor** de Neon.

### 2. Aplicación en Vercel

1. Crea una cuenta en <https://vercel.com> con tu GitHub.
2. **Add New → Project** e importa el repositorio `san-camilo-reportes`. Vercel detecta Next.js solo.
3. En **Environment Variables** agrega:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | La cadena de Neon (con `-pooler`) |
   | `ADMIN_PASSWORD` | Contraseña larga y temporal: solo sirve para crear tu cuenta de administrador en `/admin`; luego se borra |
   | `SESSION_SECRET` | Texto aleatorio de 32+ caracteres (`openssl rand -base64 48`) |

4. **Deploy**. En un minuto tendrás una URL como `san-camilo-reportes.vercel.app`.

### 3. Fotos con Vercel Blob

En Vercel: tu proyecto → **Storage** → **Create** → **Blob** → conéctalo al proyecto (entornos Production y Preview). Vercel agrega sola la variable `BLOB_READ_WRITE_TOKEN`. Después haz **Redeploy**. Sin esa variable la app funciona igual, solo oculta el campo de foto. Aunque esté configurado, el campo solo aparece para el equipo con sesión iniciada y el servidor rechaza fotos de vecinos sin sesión.

### Migraciones

`npm run build` aplica las migraciones pendientes antes de compilar, así que cada deploy de Vercel deja la base al día. Si cambias el esquema, agrega un archivo nuevo en `db/migrations/` (p. ej. `003_algo.sql`). Localmente puedes correr `npm run db:migrate`.

## Ideas para crecer

- Botón "A mí también me afecta" para priorizar reportes.
- Notificación (correo o Telegram) al admin cuando llega un reporte nuevo.
- Fotos con almacenamiento gratuito limitado (p. ej. Cloudflare R2) si algún día se necesitan.
- Exportar reportes a CSV para entregarlos al Ayuntamiento.

## Licencia

[MIT](LICENSE)
