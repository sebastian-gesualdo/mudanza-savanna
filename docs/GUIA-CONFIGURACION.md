# Guía para crear las cuentas y conectar Mudanza Savanna

Guía para el organizador · 11 de octubre de 2026.

La aplicación todavía no está implementada. Podés crear las cuentas y preparar los proyectos ahora; los pasos de migraciones, despliegue funcional e invitaciones se completan cuando existan las tareas indicadas. Crear una cuenta o guardar una clave no demuestra que la integración funcione.

Los nombres de algunas secciones de los paneles pueden cambiar. Esta guía indica qué configuración buscar y cómo comprobar el resultado. Los importes y cuotas de los proveedores se verifican al activarlos; no se presuponen créditos gratuitos ni una tarifa fija.

## 1. Qué cuentas hacen falta

| Servicio | Para qué lo usamos | Cuenta necesaria |
| --- | --- | --- |
| GitHub | Código y despliegues automáticos al actualizar una rama. | La existente, con acceso a `sebastian-gesualdo/mudanza-savanna`. |
| Vercel | Publicar la PWA, ejecutar su backend y administrar AI Gateway. | Una cuenta del organizador; comenzar evaluando el plan Hobby para este uso familiar. |
| Supabase | Base de datos compartida. | Una cuenta del organizador y una organización; comenzar evaluando el plan Free. |
| Vercel AI Gateway | Acceder a Jev y al modelo generativo excepcional. | Se administra dentro de Vercel, en el mismo ámbito/cuenta que el proyecto. |

Para la ruta definida no hace falta abrir una cuenta propia en OpenAI ni TypeSafe, ni obtener sus API keys directas. Tampoco hace falta cuenta de Apple Developer, publicación en App Store, dominio comprado o cuentas de Vercel/Supabase para cada familiar.

Los colaboradores entrarán a la aplicación por invitación y elegirán su nombre. Solo quien administra el proyecto necesita acceder a estos paneles.

## 2. Qué podés hacer ahora y qué viene después

| Momento | Acción | Dependencia |
| --- | --- | --- |
| Ahora | Crear Vercel y Supabase, elegir nombres y preparar proyectos de base de datos. | Ningún código de aplicación. |
| Ahora / T00 | Habilitar acceso a AI Gateway y verificar que Jev esté disponible en esa cuenta. | Una llamada de prueba real para confirmar acceso; la aparición en un catálogo no basta. |
| Después de T01 | Importar en Vercel una rama que ya tenga la aplicación y `package.json`. | Base Next.js implementada. |
| Después de T02–T03 | Aplicar migraciones y generar invitación. | Esquema, sesiones y herramienta de invitación implementados. |
| Después de T05 | Activar IA con presupuesto y comprobar Jev. | Adaptador, controles de gasto y registro de consumo. |
| T10–T11 | Publicar, probar con dos dispositivos e instalar en los iPhone. | Flujos e integraciones terminados. |

La rama inicial de especificaciones es `docs/mudanza-savanna-specs`. Elegirla como base para las tareas hasta integrar sus cambios en `main`. Una rama que solo contiene documentación no puede desplegar todavía una aplicación Next.js.

## 3. Crear la cuenta de Vercel

1. Abrí [Vercel](https://vercel.com/) y elegí crear cuenta/iniciar sesión con GitHub.
2. Usá tu cuenta de GitHub que tiene acceso al repositorio.
3. Elegí el ámbito personal/Hobby apropiado para el uso familiar. No hace falta contratar Pro para comenzar esta evaluación.
4. Cuando Vercel pida instalar o autorizar su integración de GitHub, concedé acceso al repositorio `mudanza-savanna`. Se puede seleccionar solo ese repositorio.
5. Comprobá que el repositorio aparezca al intentar importar un proyecto. Si no aparece, revisar los permisos de la GitHub App y el ámbito seleccionado en Vercel.

**Resultado esperado:** podés entrar al dashboard de Vercel y seleccionar el repositorio. Si todavía solo hay especificaciones, dejá la importación/despliegue para el paso 7.

## 4. Crear Supabase

### Cuenta y organización

1. Abrí [Supabase](https://supabase.com/dashboard) y creá/iniciá sesión, por ejemplo con GitHub.
2. Creá o elegí una organización propia para el proyecto.
3. Elegí el plan Free si sus límites actuales permiten estos proyectos. Revisá primero si ya tenés proyectos que consumen la cuota.

### Proyecto de producción

1. Elegí **New project**.
2. Nombre sugerido: `mudanza-savanna-prod`.
3. Elegí una región del este de Estados Unidos, cercana a los usuarios de Florida y a las funciones de Vercel. Si la región exacta sugerida no está disponible, elegir la alternativa cercana admitida por el plan.
4. Generá una contraseña fuerte para PostgreSQL y guardala en tu gestor de contraseñas. Esa contraseña es diferente de una API key.
5. Creá el proyecto y esperá a que su base de datos termine de prepararse.

### Proyecto de prueba

Repetí los pasos para `mudanza-savanna-test`, con contraseña y claves propias. Ese proyecto se usará en desarrollo y previews.

Si tu cuota gratuita no permite un segundo proyecto, las previews deberán usar un modo demo aislado o una base local de desarrollo hasta disponer de un entorno de prueba. No conectar las pruebas al inventario real como atajo. T01/T10 deben documentar cuál de esas opciones quedó disponible.

No hace falta crear manualmente tablas desde el panel. Las tablas, permisos y ambientes se instalarán mediante migraciones del repositorio en el paso 8. Tampoco hace falta configurar proveedores de login, correo, buckets de fotos ni Realtime para v1.

### Obtener los datos de conexión correctos

En cada proyecto, buscá las secciones **Connect**, **Project Settings**, **Data API** y **API Keys**, según el panel vigente.

| Dato | Qué copiar / para qué sirve | Dónde se usará |
| --- | --- | --- |
| Project URL | URL HTTPS de la API del proyecto, habitualmente bajo `supabase.co`. | `SUPABASE_URL` del servidor. |
| Secret key | Clave privilegiada de servidor. El panel puede ofrecer claves nuevas o una clave legacy `service_role`. | `SUPABASE_SECRET_KEY`, según el formato compatible documentado por T01/T03. |
| Project reference / ID | Identificador del proyecto, distinto del nombre visible. | Enlazar la CLI para migraciones; no es una contraseña. |
| Database password | Contraseña elegida al crear PostgreSQL. | Migraciones/administración cuando la herramienta la solicite. |

La clave publicable o `anon` no sustituye a la clave de servidor en esta arquitectura. La contraseña de la base de datos tampoco es una API key. La aplicación prevista usa la API de Supabase y RPC desde su backend; por eso la contraseña de PostgreSQL no necesita ir en Vercel como variable de la app.

**Resultado esperado:** dos proyectos claramente identificados y sus datos guardados de forma privada. No pegues claves, contraseñas ni enlaces de invitación completos en el chat, GitHub o capturas que vayas a compartir.

## 5. Preparar AI Gateway y Jev

1. En Vercel, verificá que estés en el mismo ámbito/cuenta en el que vas a alojar la aplicación.
2. Abrí la sección **AI Gateway**. Buscá el catálogo de modelos y Jev de TypeSafe AI.
3. El identificador documentado para nuestra integración es `typesafe-ai/jev`. T00 debe comprobar que esté accesible y qué versión real responde.
4. Revisá **Usage/Billing/Credits** o la sección equivalente. Si hay que habilitar facturación o agregar saldo, elegí un importe pequeño después de revisar precios vigentes. No dependas de créditos promocionales para el día de la mudanza.
5. Si hay recarga automática, revisá su configuración antes de habilitarla. El presupuesto de la app y la facturación de Vercel son controles distintos.
6. Para el inicio, creá una clave de AI Gateway y guardala como `AI_GATEWAY_API_KEY`. Se usará exclusivamente desde el servidor.
7. Generá una credencial distinta para desarrollo/pruebas cuando la plataforma lo permita. Aunque haya varias claves, el saldo puede ser compartido a nivel de cuenta: la separación por clave no garantiza un presupuesto independiente.

Vercel también admite autenticación OIDC en contextos compatibles. Es una alternativa para T10; no necesitás configurar API key y OIDC simultáneamente. El uso de una clave de Gateway al principio facilita las pruebas locales/cloud con una ruta documentada.

No configurar BYOK de OpenAI/TypeSafe para este diseño: usar el acceso gestionado por Gateway. El modelo generativo de respaldo se elegirá en T00 dentro de los disponibles por Gateway y se usará de forma excepcional.

**Comprobación real de T00:** enviar una pregunta tipada mínima a Jev con el adaptador oficial compatible, recibir una decisión válida y verificar consumo. Un modelo generativo que responde texto no valida la integración de Jev. No activar automáticamente toda la aplicación contra IA antes de tener el control de presupuesto de T05.

## 6. Preparar las variables por entorno

Vercel distingue **Production**, **Preview** y **Development**. El nombre de una variable puede repetirse con valores distintos por entorno. Seleccioná expresamente el ámbito al guardarla.

| Variable | Producción | Pruebas / desarrollo |
| --- | --- | --- |
| `SUPABASE_URL` | URL de `mudanza-savanna-prod`. | URL de `mudanza-savanna-test`, o configuración demo documentada. |
| `SUPABASE_SECRET_KEY` | Clave de servidor del proyecto prod. | Clave de servidor del proyecto test; nunca la de prod. |
| `AI_GATEWAY_API_KEY` | Credencial elegida para producción, salvo OIDC. | Credencial de pruebas si se habilita IA; sino mantenerla desactivada. |
| `INVITE_TOKEN_HASH` | Hash de la invitación de la mudanza real. | Hash diferente para el entorno de prueba. |
| `APP_BASE_URL` | Origen estable HTTPS del proyecto publicado. | URL del entorno que se está probando o resolución segura de URL de preview implementada por T10. |
| `APP_ENV` | `production`. | `preview` o `development`. |
| `DECISION_MODEL` | `typesafe-ai/jev`, tras validación de T00. | El mismo modelo para pruebas reales, o adaptador mock identificado. |
| `GENERATION_MODEL` | Identificador de Gateway elegido en T00. | Modelo de prueba elegido; puede quedar sin configurar con generación deshabilitada. |
| `AI_ENABLED` | `false` hasta verificar T05; luego `true`. | `false` por defecto, activarlo solo para pruebas reales necesarias. |
| `GENERATION_ENABLED` | `false` hasta elegir/probar el fallback; luego según configuración. | `false` salvo la evaluación específica. |
| `AI_BUDGET_USD` | `5` como presupuesto inicial propuesto. | `1` como presupuesto pequeño propuesto para evaluación. |

`AI_BUDGET_USD` corresponde al presupuesto total de la mudanza/entorno registrado por la aplicación, no a un tope mensual de la cuenta de Vercel. Los valores son defaults propuestos y editables. No constituyen un cobro automático ni aseguran igualdad instantánea con la factura del proveedor.

Ninguna clave privilegiada lleva prefijo `NEXT_PUBLIC_`. Las variables se usan en servidor. `.env.example` tendrá solo nombres y ejemplos no secretos cuando se implemente T01.

Las URLs de preview cambian según despliegue. T10 debe elegir y documentar la forma compatible de resolver su origen, por ejemplo a partir de metadatos confiables del deployment. No desactivar la comprobación de origen/CSRF para hacer funcionar una preview.

## 7. Conectar GitHub y desplegar en Vercel

**Esperar a T01:** debe existir una rama con Next.js, `package.json`, lockfile y build verificable.

1. En Vercel: **Add New / Project** o la opción equivalente.
2. Importá `sebastian-gesualdo/mudanza-savanna`.
3. Nombre sugerido del proyecto: `mudanza-savanna`.
4. Framework: **Next.js**. Root Directory: raíz del repositorio, mientras la implementación conserve esa estructura.
5. Usá las opciones de instalación/build del framework y el lockfile del repo. El proyecto debe usar la versión Node 24 compatible acordada; no instalar dependencias con un gestor diferente por defecto.
6. En Environment Variables, cargá las variables del paso 6 en los ámbitos correctos. La rama inicial de aplicación puede desplegarse como preview contra el proyecto test.
7. Configurá `main` como rama de producción en la sección Git/Environments correspondiente. Antes de desplegar producción, `main` debe contener el código aprobado y las migraciones compatibles, no solo el README inicial.
8. Desplegá y revisá el resultado del build.
9. Anotá la URL estable asignada por Vercel, por ejemplo el dominio `vercel.app` que el panel muestre. No asumir que un nombre propuesto estará libre.
10. Guardá esa URL en `APP_BASE_URL` de producción cuando corresponda. Si cambiaste variables después de construir, generá un nuevo deployment/redeploy para que se apliquen.

La integración de GitHub publicará previews al actualizar ramas/PR y producción al actualizar `main`, según la configuración y los permisos de Vercel. La cuenta de GitHub del autor de los commits debe cumplir las reglas de colaboración del plan elegido; si Vercel bloquea el deploy por autor/permisos, revisar ese vínculo antes de cambiar de plan.

Al principio pueden fallar funciones que esperan tablas si todavía no se completó el paso 8. Un build exitoso solo prueba que se construyó la app; no prueba conexión a base de datos ni IA.

No hace falta dominio propio. Si después se agrega uno, mantener actualizados `APP_BASE_URL`, invitaciones y orígenes permitidos.

## 8. Conectar la base de datos y aplicar migraciones

**Responsable habitual: tarea T02/T03/T10 de implementación.** No armar las tablas manualmente copiando nombres de las especificaciones.

Primero, el implementador debe:

1. Confirmar que existen migraciones revisadas en `supabase/migrations` y documentar la versión de Supabase CLI.
2. Autenticarse en la CLI con una cuenta que tenga acceso al proyecto de prueba. El token de acceso de administración de Supabase, si se usa, es distinto de la clave de API de la app.
3. Enlazar explícitamente el proyecto test y revisar las migraciones pendientes.
4. Aplicarlas a test y verificar tablas, RPC, restricciones y permisos. No habilitar acceso público para resolver un error de conexión.
5. Ejecutar el seed idempotente de los 17 ambientes. No importar automáticamente el inventario anterior.
6. Probar una escritura y lectura desde la API de la aplicación con sesión válida.
7. Solo después, repetir el procedimiento revisado en producción. Si ya contiene datos, obtener respaldo antes de cambios de esquema.

La documentación oficial usa esta familia de comandos, una vez instalada la CLI compatible y desde el checkout correcto:

```sh
supabase login
supabase link --project-ref PROJECT_REF_DE_PRUEBA
supabase db push --dry-run
supabase db push
```

Reemplazar `PROJECT_REF_DE_PRUEBA` por el identificador real. El último comando modifica la base enlazada: el implementador debe comprobar cuál es antes de ejecutarlo. Estos comandos no están ejecutados por esta guía y no sustituyen las migraciones ni el seed propios del proyecto.

Las migraciones de producción no corren indiscriminadamente en cada preview. Una variable de Vercel apuntando a Supabase no crea tablas ni actualiza su esquema. El rollback de un deployment tampoco revierte migraciones de PostgreSQL.

## 9. Preparar la invitación y sumar a la familia

**Después de T03:** la implementación incluirá una herramienta para generar una invitación aleatoria de al menos 128 bits y calcular su hash SHA-256 hexadecimal. Su comando exacto se documentará junto con la herramienta; no existe todavía en este repositorio.

1. Generar invitaciones distintas para test y producción.
2. Guardar solamente el hash en `INVITE_TOKEN_HASH` del entorno correspondiente.
3. Guardar de forma privada el enlace de invitación con el token original. La app lo intercambia por una sesión; el token no es el nombre del participante.
4. Redeploy si se agregó/cambió el hash en Vercel después del deployment activo.
5. Probar ingreso y selección de nombre desde un dispositivo distinto.
6. Compartir el enlace de producción con los colaboradores cuando estén terminadas las verificaciones.

Los familiares no necesitan tu cuenta de Vercel, Supabase ni GitHub. Entran al enlace, eligen su nombre y usan Safari → Compartir → Agregar a inicio. La guía de invitaciones de T03/T10 debe explicar cómo rotar el enlace y qué sucede con sesiones que ya estaban abiertas.

## 10. Dar acceso a una tarea de Codex cuando haga falta

Las variables guardadas en Vercel no aparecen automáticamente dentro de una tarea cloud de Codex.

- Para desarrollar interfaz o pruebas con mocks no hacen falta credenciales reales.
- Para probar integraciones, usar el proyecto test y un presupuesto de evaluación acotado.
- Cargar variables/credenciales mediante la configuración segura del entorno de la tarea, según los mecanismos que ofrezca la plataforma. Reutilizar bindings existentes antes de declarar otros.
- Compartir en texto solo nombres de proyectos, URLs públicas, IDs no secretos y qué permisos se configuraron. No pegar valores de claves en el chat.
- Si un servicio queda bloqueado por la política de red del entorno, revisar el hostname concreto que la herramienta necesite. Eso no demuestra que la clave sea incorrecta ni requiere generar otra. La red de Codex y la de la aplicación desplegada son independientes.
- Las credenciales de migración/administración pueden requerir acceso adicional al de la API de la app. No asumir que una clave que lee inventario permite administrar proyectos o aplicar SQL.

El implementador debe comprobar nombres/presencia de variables y hacer una operación de prueba apropiada sin imprimir sus valores.

## 11. Comprobar que todo está conectado

Realizar primero estas pruebas en el entorno test; luego hacer un smoke test pequeño en producción.

| Comprobación | Evidencia esperada |
| --- | --- |
| GitHub → Vercel | Un cambio de rama genera preview y el deployment muestra el commit correcto. |
| Separación de entornos | Un registro creado en test no aparece en producción. |
| App → Supabase | Crear una caja, recargar y verla desde otro dispositivo con otro participante. |
| Identidad | Cerrar la caja y comprobar quién y cuándo la cerró. |
| Persistencia | Reabrir la app y recuperar contenido sin depender del chat anterior. |
| App → Jev | Una consulta semántica genera una decisión real de Jev y aparece en el registro de uso; una lectura por código no consume IA. |
| Presupuesto | Con un límite de prueba pequeño, la IA deja de iniciar llamadas al agotar saldo y los controles manuales siguen funcionando. |
| Offline | Encolar una modificación sin señal, reabrir la PWA y sincronizar una sola vez al recuperar conexión. |
| Backups | Exportar JSON y restaurarlo en una base de prueba vacía con conteos/relaciones iguales. |
| iPhone | Instalación, dictado, teclado, bloqueo/desbloqueo y actualización de la PWA funcionan en equipo real. |

Si se crea una caja de prueba en producción, identificarla claramente y archivarla al terminar; su código no se reutiliza. No borrar el inventario completo para limpiar una prueba.

## 12. Costos y preparación para el día de la mudanza

Objetivo: Vercel Hobby y Supabase Free mientras sus condiciones y cuotas alcancen; IA por consumo con presupuesto bajo. No hay una promesa de costo cero por registrar una cuenta.

- Revisar consumo y facturación en cada proveedor, además del contador de la aplicación.
- Confirmar que no se activaron complementos de pago que la app no necesita.
- Si el plan de Supabase pausa proyectos por inactividad, reanudarlo y verificarlo antes del uso. No dar por disponible un proyecto solo porque exista en el dashboard.
- Antes del día de la mudanza, abrir la app en todos los teléfonos y comprobar que se ve el mismo inventario actualizado.
- Confirmar presupuesto disponible en Gateway y que Jev responde; las funciones manuales deben servir aunque falle IA.
- Generar un export y comprobar que no quedan cambios pendientes de sincronizar antes de cerrar las apps.

## 13. Problemas frecuentes

| Síntoma | Revisar primero |
| --- | --- |
| El repo no aparece en Vercel | Permisos de la GitHub App y cuenta/ámbito seleccionado. |
| Vercel no detecta Next.js | La rama desplegada puede contener solo specs; comprobar `package.json` y Root Directory. |
| Build falla por una variable faltante | Variables requeridas por la implementación y ámbito Production/Preview/Development. Guardar y redeploy. |
| API de la app responde sin sesión/no autorizado | Invitación correcta, selección de participante y cookie del entorno visitado. |
| Supabase rechaza solicitudes | URL y clave pertenecen al mismo proyecto; clave de servidor correcta; proyecto activo. No deshabilitar RLS como atajo. |
| Tabla o RPC no existe | Migraciones pendientes o proyecto enlazado incorrectamente. |
| La app guarda en otro entorno | Valores de Supabase en Vercel y commit/URL que se está usando. |
| Jev no responde | Modelo/acceso de Gateway, credencial o OIDC, saldo, versión de SDK y estado del proveedor. |
| IA deshabilitada aunque exista saldo en Vercel | Flags de la app y presupuesto/reservas de esa mudanza. Son controles separados. |
| Preview falla por origen | Resolución de `APP_BASE_URL` de preview y validación de origen documentada en T10. |
| Invitación dejó de funcionar | Hash vigente, token del enlace, entorno y redeploy posterior al cambio. |
| Un cambio de variables no tiene efecto | El deployment activo puede ser anterior al cambio. |
| Vercel bloquea un deploy por autor | Vínculo de GitHub, autor del commit y reglas del plan/cuenta. |
| iPhone muestra versión anterior | Estado de actualización del service worker. Resolver/exportar pendientes antes de borrar datos del sitio. |

## 14. Registro de configuración para completar

Este registro admite información no secreta. No completar campos con claves, contraseñas o tokens.

| Dato | Valor a completar |
| --- | --- |
| Cuenta/ámbito de Vercel | Pendiente. |
| Nombre del proyecto Vercel | Pendiente. |
| URL estable de producción | Pendiente. |
| Rama de producción | `main`, cuando contenga la aplicación aprobada. |
| Proyecto Supabase producción: nombre / ID / región | Pendiente. |
| Proyecto Supabase test: nombre / ID / región, o modo demo | Pendiente. |
| Autenticación de Gateway | API key u OIDC; registrar solo el método. |
| Jev: identificador / versión observada / fecha de prueba | Pendiente de T00. |
| Modelo generativo elegido | Pendiente de T00. |
| Presupuesto de aplicación producción / test | Propuestos: USD 5 / USD 1. |
| Última migración aplicada en test / prod | Pendiente de T02/T10. |
| Último respaldo y prueba de restauración | Pendiente de T08/T11. |
| Última prueba multiusuario en iPhone | Pendiente de T11. |

## Documentación de los proveedores

- [Vercel: importar un proyecto existente](https://vercel.com/docs/getting-started-with-vercel/import).
- [Vercel: integración con GitHub](https://vercel.com/docs/git/vercel-for-github).
- [Vercel: variables de entorno](https://vercel.com/docs/environment-variables).
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).
- [AI SDK: decisiones y acceso a Jev por Gateway](https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/32-decisions.mdx).
- [Supabase: claves de API](https://supabase.com/docs/guides/api/api-keys).
- [Supabase: migraciones](https://supabase.com/docs/guides/deployment/database-migrations).

Las instrucciones de esta guía deben actualizarse durante T10 para reflejar la implementación y paneles efectivamente usados. Haber escrito la guía no significa que se hayan creado cuentas, guardado secretos, aplicado migraciones o desplegado el producto.
