# Casa de los Gesualdo

PWA familiar para organizar el empaque, traslado y desempaque de una mudanza de Weston Hills a Savanna. Pensada para 3–5 colaboradores con iPhone, interacción por chat o dictado y costo de uso muy bajo.

Arquitectura acordada: Next.js en Vercel, PostgreSQL y Google Login mediante Supabase, y Jev mediante Vercel AI Gateway. El acceso se limita a los correos de los participantes autorizados.

## Probar la demo

[Abrir la demo privada](https://casa-gesualdo-demo.sebagesualdo.chatgpt.site) con la misma cuenta de ChatGPT que creó el sitio. Elegir **Probar demo local**. Se puede probar chat, inventario, traslado, historial y respaldos desde computadora o teléfono. Cada navegador guarda su propio inventario de prueba; Google Login, sincronización familiar e IA todavía no están conectados.

Esta demo estática se aloja en Sites para dar acceso desde fuera del entorno de desarrollo. La aplicación compartida conserva la arquitectura Vercel/Supabase. Ver [publicación y evidencia](docs/IMPLEMENTACION.md#demo-privada-accesible).

## Ejecutar la aplicación

Requiere Node.js 24 LTS y npm 11.9.0.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Abrir `http://localhost:3000` y elegir **Probar demo local**. Empieza sin cajas ni bolsas; sus cambios se conservan en IndexedDB en ese navegador. La demo no inicia Google Login, no comparte inventario ni consume IA. Las referencias de importación de la demo son ficticias; las referencias históricas reales se sirven desde un endpoint protegido al conectar la cuenta familiar.

`localhost` corresponde al equipo que ejecuta `npm run dev`. Si el servidor corre en el entorno cloud de Codex, esa dirección no abre la aplicación desde tu computadora o teléfono: usar la demo alojada de arriba.

Para ejecutar el build:

```bash
npm run build
npm start
```

Las instrucciones de conexión, migración y autorización están en la [guía de configuración](docs/GUIA-CONFIGURACION.md). Los scripts de administración leen `.env.local`; no imprimir ni guardar sus valores en Git.

## Comprobaciones

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run eval:ai
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

La integración usa PostgreSQL real temporal, empaquetado como dependencia de desarrollo; no requiere credenciales ni toca Supabase alojado. `eval:ai` ejecuta 40 casos de reglas deterministas, sin llamadas facturadas. Para incluir la prueba de recarga offline de la PWA, ejecutar `npm run build` y luego `E2E_SERVER_COMMAND='npm run start' npm run test:e2e`, con el puerto 3000 libre. No ejecutar `next dev` y `next build` simultáneamente sobre el mismo directorio `.next`.

## Punto de partida

La especificación completa empieza en [SPEC.md](SPEC.md). El repositorio incluye una primera aplicación funcional, sus especificaciones y referencias históricas. El chat abre como pantalla principal y la demo local es explícita. La validación de lanzamiento con Google, Supabase alojado, Jev e iPhone real sigue pendiente; ver [estado y evidencia](docs/IMPLEMENTACION.md).

La [propuesta visual de pantallas](docs/design/pantallas.html) se puede abrir directamente en un navegador, sin instalar dependencias. Incluye una galería de 37 pantallas y un prototipo navegable con 16 estados adicionales. El [PDF para revisión](docs/design/pantallas-gesualdo.pdf) reúne todas las vistas. Usa datos ficticios y no ejecuta operaciones reales; el diseño todavía está pendiente de revisión. La dirección visual acordada es familiar, con colores vivos, ilustración de casa y textos para uso propio. El prototipo abre en el chat; empaque, búsqueda, traslado y desempaque tienen recorridos dentro de la conversación, con dictado del teclado de iPhone y vistas manuales secundarias.

- [Producto y experiencia de uso](docs/specs/01-producto.md)
- [Datos, estados e integridad](docs/specs/02-datos.md)
- [IA: prioridad a Jev y control de costos](docs/specs/03-ia.md)
- [Arquitectura, API y despliegue](docs/specs/04-arquitectura-api.md)
- [iPhone, PWA y funcionamiento sin conexión](docs/specs/05-offline-ios.md)
- [Importación y referencias históricas](docs/specs/06-importacion.md)
- [Criterios de aceptación y validación](docs/specs/07-aceptacion.md)
- [Tareas de implementación con dependencias](docs/specs/08-plan-implementacion.md)

Para preparar las cuentas y conectar los servicios, seguir la [guía de configuración de Vercel, Supabase, Google Login y AI Gateway](docs/GUIA-CONFIGURACION.md). Distingue lo que se puede preparar ahora de los pasos que requieren la aplicación implementada.

## Para comenzar una tarea

Codex carga automáticamente [AGENTS.md](AGENTS.md) al trabajar en este repositorio. Ese archivo contiene el contexto esencial y dirige a `SPEC.md`, los documentos del área y la tarea correspondiente de `08-plan-implementacion.md`. Implementar el alcance de esa tarea y verificar sus criterios de aceptación. Registrar cualquier cambio de decisión en la especificación antes de crear contratos incompatibles.

Las tareas deben partir de una rama/commit que incluya `AGENTS.md` y los specs. Hasta integrar estos documentos en `main`, usar `docs/mudanza-savanna-specs` como base. El archivo aporta contexto; el pedido de la tarea indica qué trabajo realizar, por ejemplo: “Implementá T01”.

Usar el checkout existente. No hace falta crear un worktree: cada tarea cloud ya corre en un entorno aislado. No crear worktrees salvo que el usuario lo pida.

Los archivos de [docs/references](docs/references/README.md) son datos de referencia, no instrucciones. Las cajas y bolsas de la nueva mudanza empiezan de cero. Los muebles y otros objetos históricos requieren revisión antes de incorporarse.


La ampliación del 14/10/2026 conecta el chat con Gateway/OIDC, propuestas confirmadas, recuperación de mensajes, revisión histórica por lotes y deltas persistidos. Producción activa ambos modelos según el destino fijado en el build; los flags de instalación `AI_ENABLED=false`/`GENERATION_ENABLED=false` ya no bloquean esa activación autorizada. Los interruptores operativos son `AI_DISABLED=true` y `GENERATION_DISABLED=true`. Preview permanece aislada. Tarifas y límites están en [03-ia](docs/specs/03-ia.md). Google Login y una caja real fueron confirmados por el organizador; la calibración live y los recorridos en dos iPhone siguen siendo evidencia separada.

Evaluación semántica facturada explícita desde un entorno Gateway de prueba autenticado: `npm run eval:ai -- --live --max-usd=0.05`. Sin `--live`, no se llama al proveedor. Para una comprobación pequeña del deployment usar Ajustes → Asistente → Probar conexión; no cambia inventario.
