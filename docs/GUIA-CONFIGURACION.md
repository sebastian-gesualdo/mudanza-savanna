# Guía para crear las cuentas y conectar Mudanza Savanna

Guía para el organizador · Alineada con SPEC v1.1 · 11 de octubre de 2026.

Existe una primera aplicación y herramientas de migración, membresías y restauración. Podés preparar y conectar los proyectos siguiendo los comandos de implementación al final de esta guía. La conexión real y los criterios de lanzamiento siguen pendientes; el estado comprobado está en [IMPLEMENTACION.md](IMPLEMENTACION.md). Crear una cuenta o guardar una clave no demuestra que la integración funcione.

Los nombres de algunas secciones de los paneles pueden cambiar. Esta guía indica qué configuración buscar y cómo comprobar el resultado. Los importes y cuotas de los proveedores se verifican al activarlos; no se presuponen créditos gratuitos ni una tarifa fija.

## 1. Qué cuentas hacen falta

| Servicio | Para qué lo usamos | Cuenta necesaria |
| --- | --- | --- |
| GitHub | Código y despliegues automáticos al actualizar una rama. | La existente, con acceso a `sebastian-gesualdo/mudanza-savanna`. |
| Vercel | Publicar la PWA, ejecutar su backend y administrar AI Gateway. | Una cuenta del organizador; comenzar evaluando el plan Hobby para este uso familiar. |
| Supabase | Base de datos compartida y Google Login mediante Supabase Auth. | Una cuenta del organizador y una organización; comenzar evaluando el plan Free. |
| Google Cloud / Google Auth Platform | Configurar el consentimiento y los clientes OAuth de Google. | Una cuenta Google del organizador con un proyecto Cloud; no hace falta dar acceso al panel a los familiares. |
| Vercel AI Gateway | Acceder a Jev y al modelo generativo excepcional. | Se administra dentro de Vercel, en el mismo ámbito/cuenta que el proyecto. |

Para la ruta definida no hace falta abrir una cuenta propia en OpenAI ni TypeSafe, ni obtener sus API keys directas. Tampoco hace falta cuenta de Apple Developer, publicación en App Store, dominio comprado o cuentas de Vercel/Supabase para cada familiar.

Los colaboradores entrarán con su propia cuenta Google y un correo autorizado para esta mudanza. Puede ser una cuenta Google con correo que no sea Gmail. Su apodo familiar se puede editar, pero no cambia quién realiza las acciones. Solo quien administra el proyecto necesita acceder a los paneles de proveedores.

## 2. Qué podés hacer ahora y qué viene después

| Momento | Acción | Dependencia |
| --- | --- | --- |
| Ahora | Crear Vercel, Supabase y proyecto Google Cloud; preparar clientes OAuth y guardar privadamente los correos de participantes. | Ningún código de aplicación; las URLs definitivas se completan después del deploy. |
| Ahora / T00 | Habilitar acceso a AI Gateway y verificar que Jev esté disponible en esa cuenta. | Una llamada de prueba real para confirmar acceso; la aparición en un catálogo no basta. |
| Después de T01 | Importar en Vercel una rama que ya tenga la aplicación y `package.json`. | Base Next.js implementada. |
| Después de T02–T03 | Aplicar migraciones, autorizar correos y probar Google Login. | Esquema, flujo OAuth y herramienta de membresías implementados. |
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

No hace falta crear manualmente tablas desde el panel. Las tablas, permisos y ambientes se instalarán mediante migraciones del repositorio en el paso 8. Configurar Google como proveedor de Auth según el paso 4.1; no se necesitan otros proveedores de login, envío de magic links, buckets de fotos ni Realtime para v1.

### Obtener los datos de conexión correctos

En cada proyecto, buscá las secciones **Connect**, **Project Settings**, **Data API** y **API Keys**, según el panel vigente.

| Dato | Qué copiar / para qué sirve | Dónde se usará |
| --- | --- | --- |
| Project URL | URL HTTPS de la API del proyecto, habitualmente bajo `supabase.co`. | `SUPABASE_URL` del servidor. |
| Publishable key | Clave publicable del proyecto, o legacy `anon` compatible. | `SUPABASE_PUBLISHABLE_KEY` del cliente Auth en servidor. |
| Secret key | Clave privilegiada de servidor. El panel puede ofrecer claves nuevas o una clave legacy `service_role`. | `SUPABASE_SECRET_KEY`, según el formato compatible documentado por T01/T03. |
| Project reference / ID | Identificador del proyecto, distinto del nombre visible. | Enlazar la CLI para migraciones; no es una contraseña. |
| Database password | Contraseña elegida al crear PostgreSQL. | Migraciones/administración cuando la herramienta la solicite. |

Se usan dos clientes separados: Auth con clave publicable y cookies del usuario; datos con clave privilegiada solo después de verificar sesión y membresía. La clave publicable o `anon` no sustituye a la privilegiada. La contraseña de la base de datos tampoco es una API key. La primera implementación usa `node-postgres` para transacciones directas contra PostgreSQL de Supabase, como equivalente a RPC. `DATABASE_URL` es la credencial privilegiada del servidor y necesita configurarse también en Vercel. `SUPABASE_SECRET_KEY` queda reservada para un futuro adaptador Data API; no es requerida por el adaptador actual. Auth sigue usando la clave publicable y cookies del usuario. Nunca exponer `DATABASE_URL` al navegador.

**Resultado esperado:** dos proyectos claramente identificados y sus datos guardados de forma privada. No pegues claves privilegiadas, contraseñas, Client Secrets ni tokens en el chat, GitHub o capturas que vayas a compartir.

## 4.1. Preparar Google Login con Supabase Auth

### Google Cloud y consentimiento

1. Abrí [Google Cloud Console](https://console.cloud.google.com/) con la cuenta que administrará el proyecto. Creá o elegí un proyecto, por ejemplo `Mudanza Savanna`.
2. Entrá a [Google Auth Platform](https://console.cloud.google.com/auth/overview). Completá Branding/Consent con nombre de la aplicación, correo de soporte y contacto del administrador.
3. Para cuentas familiares personales, elegí audiencia **External**. Mientras el estado sea **Testing**, agregá en Test users los correos que van a probar. Esta lista de Google y la lista de participantes de la app son configuraciones distintas; deben incluir las cuentas necesarias.
4. En Data Access/Scopes, limitá el acceso a `openid`, correo y perfil básico (`userinfo.email` y `userinfo.profile` en el panel). No solicitar Gmail, Drive ni contactos. Este uso de OAuth no necesita activar APIs de IA de Google.
5. Antes del uso familiar definitivo, revisá el estado Testing/In production y los requisitos vigentes que muestre Google para publicarlo. No considerar publicada la configuración solo porque se haya creado el cliente. Los scopes básicos normalmente evitan la revisión de scopes sensibles, pero el estado efectivo se comprueba en el panel.

### Clientes OAuth Web y proveedor de Supabase

Crear dos clientes de tipo **Web application**, por ejemplo `Mudanza Savanna prod` y `Mudanza Savanna test`, dentro del proyecto Google. Cada uno corresponde a su propio proyecto Supabase.

1. En Supabase, abrí **Authentication → Sign In / Providers → Google**, o la sección equivalente. Copiá la URL de callback que muestra el panel.
2. En [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients), creá el cliente Web. En **Authorized redirect URIs**, pegá la URL de callback de ese Supabase, habitualmente `https://<project-ref>.supabase.co/auth/v1/callback`.
3. En **Authorized JavaScript origins**, registrá el origen real de la app cuando esté disponible: esquema y dominio, sin `/auth/callback`. Para desarrollo con el Supabase test, agregar `http://localhost:3000` si ese es el puerto implementado.
4. Guardá el Client ID y Client Secret en un gestor seguro; cargalos en el proveedor Google de **ese mismo Supabase** y habilitalo. No van en variables de Vercel ni en Git.
5. Dejá Google como único método de ingreso de la aplicación; deshabilitá Email/password y acceso anónimo si estaban habilitados. El alta inicial por OAuth debe seguir permitida para que entren participantes nuevos. No confundir esa alta en Auth con autorización al inventario, que depende de `move_memberships`.
6. Repetí con el otro cliente/proyecto. No copiar credenciales OAuth de prod al test.

### Las dos direcciones de retorno

| Dónde se configura | URL que corresponde |
| --- | --- |
| Google → Authorized redirect URIs | Callback de **Supabase**: `https://<project-ref>.supabase.co/auth/v1/callback`. |
| Supabase → Authentication → URL Configuration → Site URL | Origen canónico de la **app**, el mismo que `APP_BASE_URL`. |
| Supabase → Redirect URLs | Callback de la **app**: `https://<dominio-real-de-la-app>/auth/callback`. |
| Supabase test → Redirect URLs para desarrollo | `http://localhost:3000/auth/callback`, si ese es el puerto usado. Google sigue retornando al Supabase test alojado. |

Los valores entre `<...>` son marcadores, no URLs listas para pegar. Completá los dominios reales después del paso 7. Si se agrega un dominio propio, actualizar origen, Site URL y redirect de la app; el callback de Supabase registrado en Google sigue correspondiendo al proyecto Supabase.

Para previews con OAuth, usar una URL estable de rama o registrar URLs exactas de despliegues de prueba controlados. Iniciar y terminar el login en el mismo origen; entrar siempre por la URL canónica configurada para esa prueba. No usar un comodín que autorice todo `vercel.app`. Las previews sin configuración OAuth usan demo claramente identificada, sin credenciales de producción.

**Resultado esperado ahora:** proveedor Google habilitado en cada Supabase y clientes Web correctos. **Comprobación después de T03:** login real, retorno a la app y acceso solo con membresía activa. Configurar estos paneles todavía no crea participantes ni prueba la PWA.

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
| `SUPABASE_PUBLISHABLE_KEY` | Clave publicable del proyecto prod, para Auth. | Clave publicable del proyecto test; nunca mezclar proyectos. |
| `SUPABASE_SECRET_KEY` | Clave de servidor del proyecto prod. | Clave de servidor del proyecto test; nunca la de prod. |
| `AI_GATEWAY_API_KEY` | Credencial elegida para producción, salvo OIDC. | Credencial de pruebas si se habilita IA; sino mantenerla desactivada. |
| `APP_BASE_URL` | Origen estable HTTPS del proyecto publicado; determina el callback `/auth/callback`. | Origen canónico de test/desarrollo, registrado en Supabase, o resolución segura de preview implementada por T10. |
| `APP_ENV` | `production`. | `preview` o `development`. |
| `DECISION_MODEL` | `typesafe-ai/jev`, tras validación de T00. | El mismo modelo para pruebas reales, o adaptador mock identificado. |
| `GENERATION_MODEL` | `google/gemini-2.5-flash-lite` por defecto; override de Gateway con tarifas verificadas. | Modelo de prueba elegido; puede quedar sin configurar con generación deshabilitada. |
| `AI_ENABLED` | Por defecto habilitado en Vercel Production; `false` lo apaga. | `false` por defecto, activarlo solo para pruebas reales necesarias. |
| `GENERATION_ENABLED` | Por defecto habilitado en Production para extracción confirmada; `false` lo apaga. | `false` salvo la evaluación específica. |
| `AI_BUDGET_USD` | `5` como presupuesto inicial propuesto. | `1` como presupuesto pequeño propuesto para evaluación. |

`AI_BUDGET_USD` corresponde al presupuesto total de la mudanza/entorno registrado por la aplicación, no a un tope mensual de la cuenta de Vercel. Los valores son defaults propuestos y editables. No constituyen un cobro automático ni aseguran igualdad instantánea con la factura del proveedor.

Ninguna clave privilegiada lleva prefijo `NEXT_PUBLIC_`. Las variables se usan en servidor. `.env.example` tendrá solo nombres y ejemplos no secretos cuando se implemente T01. No configurar `INVITE_TOKEN_HASH`: v1.1 usa Google Login. El Client Secret de Google vive en el proveedor de Supabase y la lista de correos autorizados vive en la base; ninguno requiere variable propia en Vercel.

Las URLs de preview cambian según despliegue. T10 debe elegir y documentar el origen canónico y su registro de callback, por ejemplo con un alias de rama estable o metadatos confiables del deployment y URLs exactas autorizadas. No desactivar la comprobación de origen/CSRF para hacer funcionar una preview.

## 7. Conectar GitHub y desplegar en Vercel

**Esperar a T01:** debe existir una rama con Next.js, `package.json`, lockfile y build verificable.

1. En Vercel: **Add New / Project** o la opción equivalente.
2. Importá `sebastian-gesualdo/mudanza-savanna`.
3. Nombre sugerido del proyecto: `mudanza-savanna`.
4. Framework: **Next.js**. Root Directory: raíz del repositorio, mientras la implementación conserve esa estructura. `vercel.json` fija `framework=nextjs`, `buildCommand=npm run build` y `outputDirectory=null` para usar la salida predeterminada del adaptador Next.js, incluso si el proyecto se importó inicialmente como “Other”. No servir `public/` o `.next/` como un sitio estático: la página, API y callback necesitan las funciones de Next.js.
5. Usá las opciones de instalación/build del framework y el lockfile del repo. El proyecto debe usar la versión Node 24 compatible acordada; no instalar dependencias con un gestor diferente por defecto.
6. En Environment Variables, cargá las variables del paso 6 en los ámbitos correctos. La rama inicial de aplicación puede desplegarse como preview contra el proyecto test.
7. Configurá `main` como rama de producción en la sección Git/Environments correspondiente. Antes de desplegar producción, `main` debe contener el código aprobado y las migraciones compatibles, no solo el README inicial.
8. Desplegá y revisá el resultado del build.
9. Anotá la URL estable asignada por Vercel, por ejemplo el dominio `vercel.app` que el panel muestre. No asumir que un nombre propuesto estará libre.
10. Guardá esa URL en `APP_BASE_URL` de producción cuando corresponda. Si cambiaste variables después de construir, generá un nuevo deployment/redeploy para que se apliquen.
11. Completá los orígenes y retornos del paso 4.1 con esa URL. Para probar OAuth en preview, usar el proyecto Supabase test y su URL canónica registrada.

La integración de GitHub publicará previews al actualizar ramas/PR y producción al actualizar `main`, según la configuración y los permisos de Vercel. La cuenta de GitHub del autor de los commits debe cumplir las reglas de colaboración del plan elegido; si Vercel bloquea el deploy por autor/permisos, revisar ese vínculo antes de cambiar de plan.

Al principio pueden fallar funciones que esperan tablas si todavía no se completó el paso 8. Un build exitoso solo prueba que se construyó la app; no prueba conexión a base de datos ni IA.

No hace falta dominio propio. Si después se agrega uno, mantener actualizados `APP_BASE_URL`, orígenes y redirects de Google/Supabase según el paso 4.1.

## 8. Conectar la base de datos y aplicar migraciones

**Responsable habitual: tarea T02/T03/T10 de implementación.** No armar las tablas manualmente copiando nombres de las especificaciones.

Primero, el implementador debe:

1. Confirmar que existen migraciones revisadas en `supabase/migrations` y documentar la versión de Supabase CLI.
2. Autenticarse en la CLI con una cuenta que tenga acceso al proyecto de prueba. El token de acceso de administración de Supabase, si se usa, es distinto de la clave de API de la app.
3. Enlazar explícitamente el proyecto test y revisar las migraciones pendientes.
4. Aplicarlas a test y verificar tablas, RPC, restricciones y permisos. No habilitar acceso público para resolver un error de conexión.
5. Ejecutar el seed idempotente de los 17 ambientes. No importar automáticamente el inventario anterior.
6. Autorizar cuentas según el paso 9 y probar una escritura y lectura desde la API con Google Login y membresía activa.
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

## 9. Autorizar participantes y sumar a la familia

**Después de T03:** la implementación incluirá una herramienta administrativa para dar de alta, consultar, desactivar y revincular membresías. Los comandos exactos ya existen y están documentados al final de esta guía. Su ejecución real sobre los proyectos alojados sigue pendiente. Operará con credenciales de administración del entorno elegido, nunca desde la API familiar.

1. Confirmar el correo de la cuenta Google que usará cada persona y su apodo. Guardar esta lista de forma privada; no en Git ni en fixtures reales.
2. Ejecutar la herramienta contra test para crear participantes/membresías autorizadas. Si Google está en Testing, agregar esas mismas cuentas a sus Test users.
3. Entrar con “Continuar con Google”. El primer login vincula la cuenta al participante ya autorizado; logins siguientes, incluso en otros teléfonos, reutilizan el participante.
4. Probar dos cuentas autorizadas y otra no autorizada. Esta última no debe leer inventario ni consumir IA aunque figure como usuario en Supabase Auth.
5. Repetir el alta de la lista familiar en producción después de comprobar el entorno. Compartir la URL normal de la app; el enlace no contiene un secreto ni concede acceso por sí solo.
6. En cada iPhone, abrir en Safari e instalar con Compartir → Agregar a inicio. Probar también el ingreso desde la PWA instalada: puede pedir Google Login otra vez, porque no se debe asumir que comparte la sesión de Safari.

La herramienta debe ser idempotente: repetir un alta no crea otra persona. Para un respaldo restaurado, permite elegir explícitamente el participante histórico que se vincula; no lo resuelve solo por similitud de apodo.

Para quitar acceso, desactivar la membresía del entorno correcto. La próxima solicitud protegida se rechaza aunque la sesión siga abierta; el inventario e historial se conservan. El cambio de membresía no requiere redeploy. Cambiar una cuenta vinculada se hace mediante administración explícita, nunca editando el apodo.

Los familiares no necesitan cuentas de Vercel, Supabase ni GitHub. Todos usan su propia cuenta Google. Antes de cambiar de cuenta o salir con trabajo pendiente, sincronizar, exportar o conservar esa cola bajo la cuenta original; otro participante no puede enviarla como propia.

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
| Google → Supabase → app | Cuenta autorizada completa el retorno OAuth; cuenta no autorizada no recibe inventario ni puede gastar IA. |
| App → Supabase | Crear una caja, recargar y verla desde otro dispositivo con otro participante. |
| Identidad | Cerrar la caja y comprobar cuenta/participante y hora; cambiar el apodo no reasigna el cierre. |
| Revocación | Desactivar una membresía de prueba bloquea nuevas solicitudes de su sesión abierta sin borrar historial. |
| Persistencia | Reabrir la app y recuperar contenido sin depender del chat anterior. |
| App → Jev | Una consulta semántica genera una decisión real de Jev y aparece en el registro de uso; una lectura por código no consume IA. |
| Presupuesto | Con un límite de prueba pequeño, la IA deja de iniciar llamadas al agotar saldo y los controles manuales siguen funcionando. |
| Offline | Encolar sin señal, reabrir y sincronizar una sola vez; si vence la sesión, reingresar con la misma cuenta, sin reasignar pendientes al cambiar de usuario. |
| Backups | Exportar JSON y restaurarlo en una base de prueba vacía con conteos/relaciones iguales. |
| iPhone | Instalación, Google Login desde Safari y PWA, dictado, teclado, bloqueo/desbloqueo y actualización funcionan en equipo real. |

Si se crea una caja de prueba en producción, identificarla claramente y archivarla al terminar; su código no se reutiliza. No borrar el inventario completo para limpiar una prueba.

## 12. Costos y preparación para el día de la mudanza

Objetivo: Vercel Hobby y Supabase Free, incluidas sus cuotas de Auth, mientras sus condiciones y límites alcancen; IA por consumo con presupuesto bajo. Google Login básico no requiere contratar un proveedor adicional de autenticación. No hay una promesa de costo cero por registrar una cuenta.

- Revisar consumo y facturación en cada proveedor, además del contador de la aplicación.
- Confirmar que no se activaron complementos de pago que la app no necesita.
- Si el plan de Supabase pausa proyectos por inactividad, reanudarlo y verificarlo antes del uso. No dar por disponible un proyecto solo porque exista en el dashboard.
- Antes del día de la mudanza, abrir la PWA en todos los teléfonos, completar Google Login con las cuentas autorizadas y comprobar que se ve el mismo inventario actualizado. Verificar la configuración de audiencia/Test users de Google si todavía está en Testing.
- Confirmar presupuesto disponible en Gateway y que Jev responde; las funciones manuales deben servir aunque falle IA.
- Generar un export y comprobar que no quedan cambios pendientes de sincronizar antes de cerrar las apps.

## 13. Problemas frecuentes

| Síntoma | Revisar primero |
| --- | --- |
| El repo no aparece en Vercel | Permisos de la GitHub App y cuenta/ámbito seleccionado. |
| Vercel no detecta Next.js | Comprobar `package.json`, Root Directory y la configuración versionada `vercel.json`. Un proyecto importado cuando solo había specs puede conservar el preset “Other”. |
| Deployment Ready pero la portada devuelve `404 NOT_FOUND` de Vercel | Confirmar el dominio en Domains del deployment y que la versión incluya `vercel.json` con Next.js y su salida predeterminada. Ready no demuestra que la portada o las funciones estén publicadas. |
| Build falla por una variable faltante | Variables requeridas por la implementación y ámbito Production/Preview/Development. Guardar y redeploy. |
| API responde `401` | Sesión/renovación de Supabase, cookies del origen visitado; volver a Google Login sin borrar pendientes. |
| Google funciona pero la app responde `403` | Correo autorizado, membresía activa y vinculación al participante del entorno correcto. No habilitar cualquier cuenta para resolverlo. |
| Google muestra `redirect_uri_mismatch` | URI exacta del callback de Supabase registrada en el cliente Google; no confundirla con `/auth/callback` de la app. |
| Google muestra acceso bloqueado en Testing | Cuenta incluida en Test users del proyecto Google, cliente/audiencia correctos. Esto no reemplaza la membresía de la app. |
| OAuth vuelve a otro sitio o pierde PKCE | Site URL/Redirect URLs de Supabase, `APP_BASE_URL`, origen canónico y cookies del navegador/PWA donde se inició. |
| Supabase rechaza solicitudes | URL y clave pertenecen al mismo proyecto; clave de servidor correcta; proyecto activo. No deshabilitar RLS como atajo. |
| `SELF_SIGNED_CERT_IN_CHAIN` al inicializar | Usar una versión que incluya las CA públicas oficiales de Supabase en `src/server/supabase-ca.ts`. Se verifican cadena y hostname; no desactivar TLS ni su verificación. |
| Tabla o RPC no existe | Migraciones pendientes o proyecto enlazado incorrectamente. |
| La app guarda en otro entorno | Valores de Supabase en Vercel y commit/URL que se está usando. |
| Jev no responde | Modelo/acceso de Gateway, credencial o OIDC, saldo, versión de SDK y estado del proveedor. |
| IA deshabilitada aunque exista saldo en Vercel | Flags de la app y presupuesto/reservas de esa mudanza. Son controles separados. |
| Preview falla por origen | Resolución de `APP_BASE_URL` de preview y validación de origen documentada en T10. |
| Otra cuenta no ve los pendientes anteriores | Es el comportamiento esperado: volver a la cuenta original autorizada para recuperarlos. |
| Un cambio de variables no tiene efecto | El deployment activo puede ser anterior al cambio. |
| Vercel bloquea un deploy por autor | Vínculo de GitHub, autor del commit y reglas del plan/cuenta. |
| iPhone muestra versión anterior | Estado de actualización del service worker. Resolver/exportar pendientes antes de borrar datos del sitio. |

## 14. Registro de configuración para completar

Este registro admite información no secreta. No completar campos con claves, contraseñas o tokens.

| Dato | Valor a completar |
| --- | --- |
| Cuenta/ámbito de Vercel | `sebagesualdo`, observado en el estado del deployment de GitHub el 13/10/2026. |
| Nombre del proyecto Vercel | `mudanza-savanna`, confirmado por el organizador y por la integración GitHub/Vercel. |
| URL estable de producción | [mudanza-savanna.vercel.app](https://mudanza-savanna.vercel.app), indicada por el organizador. El build de producción de `80fba57` validó APP_BASE_URL contra este origen y Vercel informó deployment exitoso; navegación y Google Login reales pendientes. |
| Preview de la implementación | [Rama feat/casa-gesualdo-app](https://mudanza-savanna-git-feat-casa-gesualdo-app-sebagesualdo.vercel.app), estado Ready informado por Vercel el 13/10/2026. Configuración de servicios todavía sin verificar. |
| Rama de producción | `main`, con la implementación integrada. |
| Proyecto Supabase producción: nombre / ID / región | `mudanza-savanna-prod`, referencia `jncnmxsiylhqeycqhhya`, [dashboard](https://supabase.com/dashboard/project/jncnmxsiylhqeycqhhya) informado por el organizador. URL API esperada: `https://jncnmxsiylhqeycqhhya.supabase.co`. El organizador proporcionó el Transaction pooler de us-east-2 y la conexión pasó TLS/autenticación en el build de producción; Google Login y uso desde la aplicación pendientes. |
| Proyecto Supabase test: nombre / ID / región, o modo demo | Sin proyecto test identificado. Preview debe usar demo aislada hasta confirmar uno. |
| Variables Vercel Production y proveedor Google | El organizador confirmó Google habilitado. Tras configurar DATABASE_URL, incluir las CA oficiales y corregir su contraseña, el deployment de producción de `80fba57` fue exitoso. El inicializador validó las variables y completó su transacción antes del build. Google Login y un guardado real desde la aplicación todavía no se verificaron. |
| Proyecto Google Cloud: nombre / ID | Pendiente. |
| Clientes OAuth Web: nombres de prod / test, sin secretos | Pendiente. |
| Audiencia OAuth: Testing/In production y fecha de comprobación | Pendiente. |
| Orígenes canónicos y callbacks de prod / test | Pendiente. |
| Alta/revocación de participantes: comando documentado y fecha de verificación, sin lista de correos | Pendiente de T03/T10. |
| Autenticación de Gateway | API key u OIDC; registrar solo el método. |
| Jev: identificador / versión observada / fecha de prueba | Pendiente de T00. |
| Modelo generativo elegido | Pendiente de T00. |
| Presupuesto de aplicación producción / test | Propuestos: USD 5 / USD 1. |
| Última migración aplicada en test / prod | `202610130001_initial.sql`: probada en PostgreSQL temporal. El build de producción de `80fba57` completó el inicializador que aplica o confirma su registro; no se hizo una lectura administrativa independiente de Supabase. |
| Último respaldo y prueba de restauración | Pendiente de T08/T11. |
| Última prueba multiusuario en iPhone | Pendiente de T11. |

## Documentación de los proveedores

- [Vercel: importar un proyecto existente](https://vercel.com/docs/getting-started-with-vercel/import).
- [Vercel: integración con GitHub](https://vercel.com/docs/git/vercel-for-github).
- [Vercel: variables de entorno](https://vercel.com/docs/environment-variables).
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).
- [AI SDK: decisiones y acceso a Jev por Gateway](https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/32-decisions.mdx).
- [Supabase: claves de API](https://supabase.com/docs/guides/api/api-keys).
- [Supabase: Google Login](https://supabase.com/docs/guides/auth/social-login/auth-google).
- [Supabase: clientes y sesiones SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
- [Supabase: URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).
- [Google Auth Platform: clientes OAuth](https://console.cloud.google.com/auth/clients).
- [Supabase: migraciones](https://supabase.com/docs/guides/deployment/database-migrations).

Las instrucciones de esta guía deben actualizarse durante T10 para reflejar la implementación y paneles efectivamente usados. Haber escrito la guía no significa que se hayan creado cuentas, guardado secretos, aplicado migraciones o desplegado el producto.

## Comandos de la implementación inicial

Los scripts requieren Node 24 y leen `.env.local` o `.env`. Configurar `APP_ENV=development` o `preview` y la URL de **PostgreSQL de prueba** antes de ensayar. Mantener TLS (`DATABASE_SSL=true`) para Supabase; el cliente incluye sus dos CA públicas de producción del CLI oficial, junto con las CA predeterminadas de Node. No se necesita una variable ni descarga de certificados durante el deployment. Las opciones TLS de la URI no sustituyen esa configuración. `DATABASE_SSL=false` solo para PostgreSQL local de prueba. La política de red de una tarea cloud puede requerir habilitar el host/puerto PostgreSQL concreto; no quitar el proxy ni desactivar verificación TLS para evitar una denegación.

1. Elegir un UUID estable de mudanza. Aplicar el esquema y seed idempotente de los 17 ambientes:

```bash
npm run db:migrate -- --move=UUID_DE_MUDANZA
```

2. Autorizar cada correo y apodo fuera del repositorio:

```bash
npm run members -- add --move=UUID_DE_MUDANZA --email=CORREO --nickname=APODO
npm run members -- list --move=UUID_DE_MUDANZA
npm run members -- revoke --move=UUID_DE_MUDANZA --email=CORREO
npm run members -- link --move=UUID_DE_MUDANZA --email=CORREO --auth-user=UUID_DE_AUTH
```

La lista se guarda solo en la base. Repetir `add` reactiva la membresía existente; no crea otra persona. Para un respaldo restaurado, agregar `--participant=UUID_HISTORICO` al alta: vincula explícitamente ese participante y conserva sus autores. La vinculación inicial con Google exige identidad Google verificada y el mismo correo de Auth; no depende de metadata del cliente.

3. Configurar Google en Supabase y las dos URLs de callback según 4.1. En `.env.local`/Vercel configurar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `DATABASE_SSL`, `APP_BASE_URL` y `APP_ENV`. Poner `APP_DEMO=false` para acceso familiar. Producción requiere origen canónico HTTPS. La página redirige al host canónico antes de iniciar PKCE; las mutaciones validan `Origin` contra ese origen. La renovación ocurre en handlers con `@supabase/ssr`; las respuestas de datos/Auth usan `private, no-store`. Las cookies son HttpOnly, SameSite=Lax y Secure en HTTPS. No hay cliente Auth de navegador.

4. Exportar JSON desde Ajustes. Ensayar restauración solamente en una segunda base de prueba vacía, con el esquema ya migrado y **sin seed de mudanza**:

```bash
npm run db:migrate
npm run backup:restore -- respaldo.json --empty-test-database
```

Después autorizar explícitamente los correos con `--participant`. Se conservan eventos, recibos y códigos; no se restauran membresías ni credenciales. La restauración fija presupuesto de IA en cero hasta reconciliar gasto. CSV contiene unidades para consulta y no sustituye el JSON canónico. Los archivos de copia local incluyen pendientes y no se aceptan como respaldo confirmado.

5. La ampliación solicitada el 14/10/2026 habilita el asistente por defecto en Vercel Production, con OIDC y saldo confirmado; `AI_ENABLED=false` y `GENERATION_ENABLED=false` permiten apagarlo. En previews sigue desactivado por defecto. Usa Jev para decisiones y Gemini Flash Lite para extracción estructurada excepcional, con tarifas oficiales registradas en `src/ai/config.ts`. Configuración, presupuesto, evaluación live y confirmaciones están detallados en [03-ia](specs/03-ia.md). No colocar una clave de OpenAI como sustituto oculto de Gateway.

Durante la implementación local inicial no se aplicaron migraciones a Supabase alojado. La demo privada de Sites se publicó y la integración existente de Vercel generó una preview exitosa de la rama `feat/casa-gesualdo-app`. Esto confirma la publicación de la aplicación, pero no las variables, Google Login ni persistencia compartida. Posteriormente, el redeploy de producción de `80fba57` completó la inicialización y fue exitoso. El build habitual vuelve a `next build`; las migraciones posteriores son explícitas. El login real y el guardado familiar siguen pendientes de prueba.

Si el build informa `INITIAL_SETUP_MISSING_DATABASE_URL`, falta la conexión PostgreSQL en el entorno de ese deployment. En el proyecto Supabase existente, abrir **Connect → Transaction pooler** y copiar la URI PostgreSQL, completando el marcador de contraseña con la contraseña real de la base. Guardarla como variable secreta `DATABASE_URL` en **Vercel → mudanza-savanna → Settings → Environment Variables**, seleccionando **Production**, y generar un nuevo deployment/redeploy. No usar la URL HTTPS de Supabase ni una API key como valor de esta variable; no copiar la URI con contraseña al chat o al repositorio. Ese paso se usó durante la inicialización de `80fba57`; el build habitual ya no ejecuta el inicializador.

Para inicializar desde el panel sin compartir credenciales, se preparó el archivo privado `.local/bootstrap-prod.sql`. Abrir **SQL Editor → New query** en el proyecto `jncnmxsiylhqeycqhhya`, revisar y ejecutar el archivo completo. Incluye la migración, el seed y la membresía inicial del organizador en una transacción. Su consulta final debe mostrar `ambientes=17`, `acceso_inicial=true` y `migracion_aplicada=true`. Si informa tablas anteriores sin registro de migraciones o una mudanza distinta, conservar los datos y revisar esa instalación antes de modificar el archivo. Registrar el resultado; preparar el SQL y verificarlo en PostgreSQL temporal no demuestra que ya esté aplicado en Supabase.

`AI_BUDGET_USD` se aplica al crear la mudanza con el seed; una mudanza existente conserva su presupuesto en `moves.ai_budget`, especialmente tras restaurar. Cambiar una variable no reinicia gasto ni presupuesto guardado. Si se eliminó un usuario Auth ya vinculado, el login no reasigna automáticamente la membresía por email: el organizador debe revisar el vínculo y usar `members link` con el UUID Auth correcto. Este comando administrativo mantiene el participante histórico y no reactiva una membresía revocada.


El organizador confirmó ingreso por Google y guardado de una caja. Para la nueva publicación v1 se aplica una migración aditiva mediante un paso temporal y explícito de build, restringido a main/Production/proyecto confirmado; no reimporta datos ni modifica membresías o presupuesto. Tras deployment exitoso se retira. En Ajustes → Asistente → Probar conexión se pueden verificar OIDC y extracción con dos llamadas pequeñas y el presupuesto persistente. El resultado debe registrarse aparte del build; el entorno de Codex carece de esa sesión y de credenciales administrativas.


La ampliación v1 se integró mediante PR #6 y Vercel publicó correctamente `b5d5c37`. CI verificó 88 tests (49 locales, 21 PostgreSQL temporal y 18 E2E Chromium/WebKit). Se retira el hook temporal una vez confirmado ese deployment; el build normal vuelve a `next build`. El organizador puede comprobar Disponible y Probar conexión desde su sesión real. Estado y alcance de la evidencia: [IMPLEMENTACION](IMPLEMENTACION.md).
