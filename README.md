# Reportes San Camilo

Mapa colaborativo para que los vecinos de la colonia **San Camilo** (Mérida, Yucatán) reporten problemas en la vía pública:

- 🕳️ Baches
- 💡 Alumbrado público (sin luz o con fallas)
- 🌊 Calles que se inundan
- 🚧 Calles sin pavimentar

Cualquiera puede ver el mapa y enviar un reporte tocando el punto donde está el problema. Los reportes **no se publican hasta que el administrador los aprueba** en `/admin`.

## Cómo funciona

| Parte | Tecnología | Costo |
| --- | --- | --- |
| Aplicación web (frontend + API) | [Next.js](https://nextjs.org) 15, React 19, TypeScript | Gratis (Vercel Hobby) |
| Mapa | [Leaflet](https://leafletjs.com) + mosaicos de [OpenStreetMap](https://www.openstreetmap.org) | Gratis, sin API key |
| Base de datos | PostgreSQL ([Neon](https://neon.tech), plan gratuito) | Gratis |

Todo es software libre. No se guardan imágenes ni datos personales: la IP solo se guarda como hash irreversible para limitar envíos abusivos.

### Flujo de un reporte

1. El vecino toca **"+ Reportar problema"**, marca el punto (o usa su ubicación), elige la categoría y opcionalmente escribe la calle y una descripción.
2. El reporte se guarda como **Pendiente**.
3. El administrador entra a `/admin`, lo revisa y lo **aprueba** o **rechaza**.
4. Los aprobados aparecen en el mapa público. Cuando se arregla, se marca como **Resuelto** (se ve en verde con "Ver resueltos").

### Protecciones

- Solo se aceptan puntos dentro del contorno de la colonia (validado en el servidor).
- Máximo 5 reportes por hora por persona y un campo trampa contra bots.
- Panel protegido con contraseña, sesión firmada (cookie `httpOnly`) y bloqueo tras 5 intentos fallidos.

## Estructura

```
db/migrations/      Esquema SQL versionado (se aplica con npm run db:migrate)
db/seed.sql         Reportes iniciales del mapa original de Google My Maps
src/lib/config.ts   Contorno de la colonia, categorías y límites  ← personalizable
src/lib/            Acceso a datos, validación, autenticación
src/app/            Páginas (/ y /admin) y API (/api/reports)
src/components/     Mapa y formulario
```

Para adaptar la app a otra colonia, basta con cambiar `src/lib/config.ts`.

## Desarrollo local

Requisitos: Node.js 20+ y un Postgres (local o la misma base de Neon).

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
   | `ADMIN_PASSWORD` | Una contraseña larga que solo tú conozcas |
   | `SESSION_SECRET` | Texto aleatorio de 32+ caracteres (`openssl rand -base64 48`) |

4. **Deploy**. En un minuto tendrás una URL como `san-camilo-reportes.vercel.app`.

Cada `git push` a `main` vuelve a desplegar automáticamente. Si cambias el esquema, agrega una nueva migración en `db/migrations/` (p. ej. `002_algo.sql`) y ejecuta `npm run db:migrate` contra Neon.

## Ideas para crecer

- Botón "A mí también me afecta" para priorizar reportes.
- Notificación (correo o Telegram) al admin cuando llega un reporte nuevo.
- Fotos con almacenamiento gratuito limitado (p. ej. Cloudflare R2) si algún día se necesitan.
- Exportar reportes a CSV para entregarlos al Ayuntamiento.

## Licencia

[MIT](LICENSE)
