# Implementación inicial · Casa de los Gesualdo

13 de octubre de 2026. Entrega funcional para desarrollo y demo; todavía no cumple la condición de lanzamiento T11.

Se revisaron AGENTS, SPEC, los ocho specs, guía, README, manifest y ambientes; los tres extractos históricos completos (99/145/148 filas); el prototipo HTML completo, los siete tableros PNG, la ilustración y las 27 páginas del PDF. La interfaz toma esa propuesta como referencia sin declararla una aprobación visual final.

## Alcance implementado

- Next.js 16.4, React 19.3, TypeScript, Node 24 y lockfile. Chat inicial con teclado/dictado de iOS, contexto compacto y menú secundario según los mockups.
- Demo explícita, inicialmente vacía, en IndexedDB. No comparte inventario ni usa Google/IA. Candidatos de importación demo ficticios; referencias reales servidas solo desde endpoint protegido y ausentes de bundles públicos.
- Cajas, bolsas, muebles y otros; contenido literal, cantidades opcionales, destino/origen, tamaño, notas, fragilidad y prioridad. Cierre/reapertura, carga/llegada, ambiente real independiente del destino, desempaque, transferencia, lotes, accesorios, archivo, historial y deshacer compensatorio.
- Búsqueda por código normalizado, tildes/case, sinónimos limitados y un error de escritura. Evidencia visible; contenido retirado se presenta como histórico.
- Comandos Zod con actor esperado, versiones, idempotencia y compuestos atómicos. PostgreSQL bloquea la mudanza y confirma filas afectadas, revisión, evento y recibo juntos. RLS sin acceso directo de anon/authenticated; FK entre mudanzas y eventos inmutables.
- Google PKCE/Supabase SSR desde servidor, `getUser`, identidad Google/correo verificados, membresía activa y vinculación atómica. CLI de alta/revocación y vínculo de participantes restaurados.
- Cola por cuenta/mudanza, proyección pendiente, UUID estable, conflictos conservados, dependientes pausados, coordinación entre tabs y reservas pequeñas de etiquetas. Borradores sin etiqueta al agotarlas. Recibo y remoción de pendiente juntos en IndexedDB.
- Mensajes/contexto locales y API protegida de conversaciones. Chat estructurado reutiliza el comando de la cola y guarda su recibo/mensaje en la misma transacción. El polling usa snapshots coherentes cada 10 segundos visibles.
- Service worker para shell público/estáticos; exclusión de API/Auth, recarga offline, aviso de actualización sin recarga automática. Salida local conserva propietario; salida remota pendiente se completa antes de reingresar.
- Importación histórica revisada de una fila por vez y unicidad fuente/fila. JSON coherente con reservas/recibos; restauración en base vacía sin membresías/credenciales. CSV de unidades neutraliza fórmulas.
- Adaptador de selección Jev compilado contra `experimental_decide` publicado en `ai@7.0.139`; presupuesto y rate limits persistentes, reservas atómicas y reserva conservada ante timeout. Sin clave directa de OpenAI; flags desactivados.

## Evidencia de verificación

| Capa | Resultado y alcance |
| --- | --- |
| Tipos/lint/build | Verificados con Next.js y TypeScript; sin servicios alojados. |
| Dominio/chat/local | 24 pruebas: estados, actores, versiones, compuestos, reintentos, transferencias, deshacer, búsqueda, exportación y cola. IndexedDB simulado. |
| PostgreSQL real temporal | 7 pruebas: seed, permisos, concurrencia, rollback, FK entre mudanzas, reservas de presupuesto, restore/revinculación y revocación. No es Supabase alojado. |
| Reglas deterministas | 40/40 casos manualmente etiquetados en `tests/ai-cases.json`; no mide calidad ni costo/latencia de Jev/generación. |
| Navegador | 6 recorridos en Chromium escritorio y viewport/touch de iPhone: chat completo, controles manuales y recarga offline de PWA conservando unidad/borrador. Build de producción, demo local. |
| Referencias | Cadenas únicas de datos históricos ausentes de los chunks públicos del cliente. |

La descarga local de WebKit desde `cdn.playwright.dev` recibió `403 Domain forbidden` por política de red; Chromium local usa `CHROMIUM_EXECUTABLE=/usr/bin/chromium`. GitHub Actions sí ejecutó WebKit: los dos flujos de chat/inventario pasaron y la recarga offline falló con `WebKit encountered an internal error` en Playwright 1.58.2. El fallo coincide con [Playwright #42775](https://github.com/microsoft/playwright/issues/42775), corregido por [#42894](https://github.com/microsoft/playwright/pull/42894). Se actualizó Playwright a la versión estable 1.64.0 conservando la prueba de red offline y exigiendo respuesta 200 desde el service worker. Los seis recorridos Chromium volvieron a pasar localmente y [CI verificó los nueve recorridos](https://github.com/sebastian-gesualdo/mudanza-savanna/actions/runs/38476252546), incluidos los tres WebKit, en el commit `e7a54ff50c48e2681833724060907aa6eb87bdc8`: tipos/lint/build, 24 pruebas locales, 7 PostgreSQL y 9 E2E correctos. Viewport móvil y WebKit de escritorio no equivalen a un iPhone físico.

Los comandos reproducibles están en README/package.json y CI. La prueba PostgreSQL espera el cierre de sockets del pool antes de terminar el proceso temporal; un build no se usa como evidencia de persistencia.

## Decisiones físicas

El backend usa `node-postgres` directamente contra PostgreSQL de Supabase, como equivalente transaccional a RPC. `DATABASE_URL` es un secreto del servidor y `DATABASE_SSL=true` verifica TLS. Supabase SSR/publicable sigue resolviendo Auth; `SUPABASE_SECRET_KEY` está reservada y no se usa en este adaptador.

Cada entidad tiene su registro JSONB con columnas generadas/FK/constraints e índices; no hay un blob mutable de todo el inventario. `/api/commands` recibe `{command,deviceId}` y el comando tiene `action:{type,payload}`. El chat admite el mismo `structuredCommand` con UUID del mensaje. Las decisiones están reflejadas en `04-arquitectura-api.md` y la guía.

## Demo privada accesible

El servidor inicial corría en el entorno cloud. `localhost:3000` respondía allí, pero no era una dirección accesible desde el equipo del usuario. Para permitir la prueba se publicó una demo estática privada en [Sites](https://casa-gesualdo-demo.sebagesualdo.chatgpt.site), con acceso de la cuenta propietaria de ChatGPT.

`scripts/prepare-demo.ts` copia únicamente componentes, dominio, almacenamiento local, exportación de respaldos y recursos públicos a un directorio nuevo. Genera una página con demo habilitada y servicios deshabilitados, usando `output: "export"` de Next.js. No incluye rutas API/OAuth, credenciales ni referencias históricas reales. No sustituye el despliegue familiar Vercel/Supabase y no comparte inventario entre navegadores.

Preparación reproducible, con un destino absoluto que todavía no exista:

```bash
npx tsx scripts/prepare-demo.ts /workspace/sites/otra-demo
cd /workspace/sites/otra-demo
npm ci
npm run build
```

La salida estática está en `out/`. Para actualizar el sitio publicado, conservar la identidad de `/workspace/sites/casa-gesualdo-demo/.openai/hosting.json`; no registrar otro sitio.

- Proyecto: `appgprj_6acea867a6b48191a21632a2f08c343f`.
- Fuente publicada en el repositorio propio de Sites: `db9943923601f79e6f201b44a1345bed694a35f3`.
- Versión: `appgprj_6acea867a6b48191a21632a2f08c343f~appgver_495fb056f6f481918b784901604a272e`.
- Despliegue: `appgdep_6acea8e535548191b7c19e91c680af61`, estado `succeeded`, 13 de octubre de 2026.
- Verificación: build estático y tipos correctos; seis recorridos existentes repetidos sobre la exportación con servidor estático, en Chromium escritorio y viewport de iPhone. Incluyen chat, controles manuales y recarga offline conservando unidad/borrador. La publicación y su URL fueron confirmadas por Sites; no se probó la sesión del usuario ni un iPhone físico.

## Estado actual de la ampliación v1

El organizador confirmó Google Login como Sebas, guardado de una caja y saldo en Gateway. La ampliación implementa chat libre con Jev, extracción excepcional mediante Gateway, propuestas confirmadas, leases de mensajes, reservas por etapa recuperables, búsqueda por bloques/caché con evidencia, sesiones de importación y lotes repetibles, división de contenido/relaciones, correcciones, llegada parcial y sincronización incremental. Los detalles operativos están en los contratos 03–06 y la guía.

Verificación local intermedia: 49 pruebas de dominio/chat/IA/TLS/IndexedDB y 19 PostgreSQL real temporal, incluida API con Auth simulado; cuarenta reglas offline correctas. Se están ejecutando los controles finales de la versión de entrega. Las pruebas con adaptadores no acreditan la exactitud del proveedor real.

Pendiente para certificar T11: calibración live de Jev/extracción con el conjunto etiquetado, medición p95 en el entorno alojado, una operación compartida entre dos cuentas reales e instalación/OAuth/suspensión/offline en iPhone físico. Codex no dispone de sesión Google del usuario, OIDC de un deployment o credenciales administrativas de Vercel/Supabase. El deployment ofrece una prueba explícita y pequeña del asistente sin escribir inventario. La comparación de tarifas favorece al candidato Gemini Flash Lite; no se presenta como una comparación empírica de exactitud contra Nano.

Las referencias históricas quedan intactas y no se cargan automáticamente. La aprobación de los candidatos y la fecha de mudanza siguen correspondiendo a la familia.

El organizador confirmó los nombres `mudanza-savanna` en Vercel y `mudanza-savanna-prod` en Supabase y proporcionó el dashboard del proyecto Supabase `jncnmxsiylhqeycqhhya`. También confirmó las variables de Vercel Production y Google habilitado. Se reutilizan esos proyectos: la conexión GitHub/Vercel y el build de producción con su inicialización obligatoria están comprobados; el login y el guardado desde cuentas familiares todavía requieren verificación independiente. El entorno cloud no tiene bindings de esos servicios. Ver el registro no secreto en la guía de configuración.

Se preparó `.local/bootstrap-prod.sql` para ejecutar desde el SQL Editor del proyecto existente: migración en una transacción, 17 ambientes y acceso inicial del organizador. El archivo y sus metadatos están ignorados por Git y no se publica el correo. Se verificó el SQL completo en PostgreSQL temporal: aplicación, repetición sin duplicados, conservación de revisión/presupuesto, rechazo de acceso anon y de una mudanza distinta ya existente. El primer login vincula la cuenta Google verificada; el archivo no inventa usuarios Auth. La ejecución en Supabase y el login real siguen pendientes.

Para ejecutar la inicialización sin intervención en el SQL Editor, se preparó un hook temporal de build de producción en Vercel. Usa las credenciales ya configuradas allí, comprueba el proyecto y origen exactos y registra la operación una sola vez. El commit de origen del organizador fue verificado contra el correo que confirmó; la dirección no se copia a archivos públicos. Las pruebas PostgreSQL cubren concurrencia, repetición sin reactivar membresías, presupuesto/revisión conservados y rechazo de otra mudanza. La publicación temporal de `initial-setup-status.json` confirma únicamente estado y SHA después del commit, sin correo, credenciales ni inventario. El hook se retiró tras el deployment exitoso documentado más abajo.

El [PR #1](https://github.com/sebastian-gesualdo/mudanza-savanna/pull/1) se integró a `main` tras [CI correcto](https://github.com/sebastian-gesualdo/mudanza-savanna/actions/runs/38478350444): 24 pruebas locales, 10 PostgreSQL y 9 E2E. El primer [deployment de producción](https://vercel.com/sebagesualdo/mudanza-savanna/86KYHRjNiYoAugKquosx7RG43Wxm) del commit `d0f199467e5d86a89551efdef42891c140b6715a` fue marcado como fallido por Vercel. GitHub no devuelve los logs de build y el entorno no tiene credenciales administrativas de Vercel. No se confirma ejecución en Supabase ni producción operativa hasta diagnosticar el fallo. El inicializador informa nombres de variables faltantes/inválidas y fase/código de error, sin valores de conexión, SQL ni correos.

El organizador proporcionó el log del [deployment de `4c7fae0`](https://vercel.com/sebagesualdo/mudanza-savanna/HvWAzR6MrR2vgEt6okweBSmX7LVz): `INITIAL_SETUP_MISSING_DATABASE_URL { phase: 'target_validation', code: undefined }`. Este intento se detuvo antes de crear el pool PostgreSQL; no aplicó el esquema ni la membresía. Se necesita configurar `DATABASE_URL` secreta en Vercel Production y redeploy. El entorno de Codex no tiene credenciales administrativas de Vercel ni la contraseña de la base para configurar ese valor desde aquí.

El siguiente [redeploy de `4c7fae0`](https://vercel.com/sebagesualdo/mudanza-savanna/5L28vw5mEKcAc9K7VTJTxdnD4Chq) llega a `database_initialization` y falla con `SELF_SIGNED_CERT_IN_CHAIN`. Se incorporaron las dos raíces públicas de producción del [CLI oficial de Supabase](https://github.com/supabase/cli/tree/2930f6d069ef8cb71f4eeecb495fb18f44a8a765/apps/cli-go/internal/gen/types/templates), vigentes hasta 2031 y 2035. Se usan únicamente para hosts PostgreSQL/Supavisor de Supabase, junto con las CA predeterminadas de Node. El inicializador y todas las API usan esta misma configuración. Se mantienen `rejectUnauthorized=true` y la validación predeterminada de hostname; los parámetros TLS de la URI no pueden eliminar estas CA ni desactivar la verificación. Los certificados están incluidos en el módulo del servidor para que no dependan de archivos externos al bundle. Esto corrige la confianza TLS; autenticación, migraciones alojadas y login real quedan pendientes del resultado del nuevo deployment.

Validación local del arreglo TLS: 36 pruebas (incluidas 12 de configuración/certificados y handshakes TLS locales), 10 pruebas PostgreSQL temporal, tipos, lint y build correctos. Los handshakes rechazan una CA ajena y un hostname incorrecto y aceptan una cadena confiable. Los fingerprints están fijados contra el commit oficial; no se ha probado desde Codex una conexión al Supabase alojado, porque no tiene esa credencial ni permiso TCP a ese destino. El build local omite el hook de producción y no demuestra migración alojada.

El arreglo TLS se integró mediante [PR #3](https://github.com/sebastian-gesualdo/mudanza-savanna/pull/3), commit de producción `80fba57abbdfe11198370c714a4c21e5596bdf85`. [CI de la versión exacta](https://github.com/sebastian-gesualdo/mudanza-savanna/actions/runs/38566274805) pasó tipos, lint, 36 pruebas locales, 10 PostgreSQL temporal, build y 9 E2E en Chromium/WebKit. La preview de Vercel fue exitosa. El [nuevo deployment de producción](https://vercel.com/sebagesualdo/mudanza-savanna/Ex5Gq14fyuiuf6LMGQiKoC9nswvW) fue marcado como fallido. El organizador proporcionó luego su error `28P01`: TLS había pasado y PostgreSQL rechazaba la contraseña. Tras corregir DATABASE_URL y redeploy, Vercel informó éxito, como se registra a continuación.

El [redeploy exitoso de producción](https://vercel.com/sebagesualdo/mudanza-savanna/475b94odnuebNrPxC6CN6TVS68Jz) de `80fba57` fue confirmado mediante el estado Vercel/GitHub. En esa versión, `npm run build` ejecuta obligatoriamente la inicialización de `main`/Production antes de `next build`: valida el proyecto/origen, realiza TLS/autenticación, aplica o confirma el marcador transaccional y publica el recibo. Por tanto el build exitoso demuestra que completó ese paso; no se leyó directamente el JSON público porque la herramienta web no pudo abrir la URL. No se distingue `applied` de `already_applied` sin ese recibo. Se restaura `build` a `next build` para los próximos deployments, evitando dependencia de la base o de GitHub durante el build. El script y sus pruebas quedan como evidencia, sin ejecución automática. Google Login, un guardado familiar real y la validación en iPhone siguen pendientes.

La retirada del hook se verificó con `npm run build` y tipos correctos. Solo cambia el comando de build y la documentación operativa; las conexiones TLS, la API y los datos inicializados se conservan.

Después del deployment final de `17f8a40`, el organizador informó una portada `404 NOT_FOUND` de Vercel. El build local sí contiene la ruta `/`, la API y el callback. Sin acceso administrativo no se confirmó el preset del panel ni el alias asignado; se pidió el dominio que muestra el deployment. Se añade `vercel.json` para fijar `framework=nextjs`, `buildCommand=npm run build` y `outputDirectory=null`, prevaleciendo sobre posibles ajustes anteriores de “Other” o salida estática. Es una corrección de empaquetado verificable, no una confirmación del origen del 404 ni de que el dominio indicado esté asociado. La portada real y Google Login siguen pendientes de comprobación. Fuente de configuración: https://vercel.com/docs/project-configuration/vercel-json y diagnóstico oficial: https://vercel.com/kb/guide/why-is-my-deployed-project-giving-404.

Verificación de la corrección de configuración: build/tipos correctos; servidor Next.js local con configuración sintética de acceso familiar y demo desactivada: portada HTTP 200, bootstrap sin sesión HTTP 401 SESSION_REQUIRED, callback sin código HTTP 307 al origen configurado. Chromium del sistema mostró Continuar con Google y no ofreció demo. No se inició Google OAuth ni se conectó a Supabase alojado en estas pruebas. La configuración de Vercel requiere su propia preview/deployment para verificar el empaquetado real.

El organizador confirmó ingreso real con Google como Sebas y guardado de una caja en producción después del arreglo del adaptador Next.js. Esto confirma esos dos recorridos en su navegador; no acredita todavía multiusuario ni iPhone/offline. Solicitó completar el chat con IA y todos los pendientes de v1. El alcance de esta ampliación incluye T00/T05/T06, lotes de importación, división de contenido/correcciones, sincronización incremental y validación A01–A27 pertinente. Las referencias y el inventario existente se conservan.


El release de ampliación aplica únicamente `202610140001_complete_v1.sql` mediante el runner idempotente. Son columnas de recuperación y tablas de caché/importación con RLS; no se reinicia presupuesto, seeding ni membresías. El hook temporal debe retirarse tras el deployment exitoso. Las previews omiten ese paso y no habilitan IA pagada por defecto.


La búsqueda semántica incluye relaciones registradas de accesorios; su caché incorpora versiones de relaciones y muebles. La confirmación de una propuesta verifica todas las referencias originales, incluso una adición cuyo comando manual permite concurrencia. Las previews rechazan reutilizar URL API, conexión PostgreSQL u origen de producción aunque las variables se hayan guardado por error en ese ámbito; producción no ofrece una demo ante falta de configuración.
