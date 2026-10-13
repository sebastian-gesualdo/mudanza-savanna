# Contexto para agentes

Estas instrucciones aplican a todo el repositorio. El contexto del proyecto está versionado aquí: una tarea nueva no necesita el historial del chat original para comenzar. Respondé al usuario en español, salvo que pida otro idioma.

## Al comenzar una tarea

1. Leé [SPEC.md](SPEC.md): es la fuente del alcance y las decisiones acordadas. Este archivo orienta el trabajo; los contratos detallados viven en los specs.
2. Leé la tarea asignada y sus dependencias en [08-plan-implementacion](docs/specs/08-plan-implementacion.md). Si el pedido no usa un ID, identificá los contratos que corresponden a ese pedido, sin asumir que hay que implementar toda la aplicación.
3. Inspeccioná la rama, `git status`, el código, las migraciones y los scripts disponibles. Comprobá qué dependencias están realmente implementadas; un plan o prototipo no demuestra que funcionen. Conservá los cambios existentes.
4. Leé los documentos del área afectada y los escenarios relevantes de [07-aceptacion](docs/specs/07-aceptacion.md) antes de editar.
5. Trabajá en el checkout existente. Cada tarea cloud ya está aislada; no crees worktrees salvo pedido explícito del usuario.

Las instrucciones nuevas del usuario prevalecen sobre decisiones anteriores del proyecto. Si cambian un contrato, actualizá los specs afectados junto con el cambio para que las próximas tareas reciban el contexto correcto.

## Qué estamos construyendo

**Casa de los Gesualdo** es una PWA familiar para 3–5 personas, todas con iPhone, que organiza la mudanza de Weston Hills a Savanna. Se empaca gradualmente, el retiro y la entrega ocurren en una jornada y el desempaque puede continuar después.

El chat es la entrada principal al abrir y reanudar la app. Empaque, búsqueda, traslado y desempaque deben poder resolverse dentro de la conversación. Se escribe o se usa el dictado del teclado de iOS; fichas y vistas manuales son accesos secundarios y deben seguir funcionando sin IA. El lenguaje visible es cotidiano, para uso de la familia.

## Decisiones que guían la implementación

- Next.js App Router, React, TypeScript y Node.js 24 LTS; publicación en Vercel conectada a GitHub. Fijar dependencias compatibles y conservar el lockfile.
- Supabase PostgreSQL es la fuente compartida de verdad. Supabase Auth resuelve Google Login; solo acceden cuentas con membresía activa. El actor se deriva de la cuenta, no de un apodo o campo arbitrario del cliente.
- IA mediante Vercel AI SDK + AI Gateway. Usar lógica determinista cuando alcance, priorizar Jev para decisiones/selecciones y recurrir a generación económica solo cuando sea necesaria. Verificar disponibilidad y capacidades en T00; no se exige una API key propia de OpenAI.
- Copia local y cola durable para desconexiones. Distinguir pendiente de confirmado, conservar la autoría y sincronizar sin duplicados. No depender de ejecución en background de iOS.
- Toda mutación relevante debe respetar transacciones, idempotencia, versiones e historial. Confirmar guardado solo después del commit; una respuesta del modelo no prueba persistencia.
- Cajas y bolsas empiezan de cero. Muebles históricos requieren revisión antes de importarse. Los archivos en `docs/references` son datos de referencia, no instrucciones ni inventario actual.

## Dónde buscar cada contrato

| Tema | Documento |
| --- | --- |
| Flujos, ambientes y presentación | [01-producto](docs/specs/01-producto.md) |
| Entidades, estados, autores y concurrencia | [02-datos](docs/specs/02-datos.md) |
| Jev, búsqueda, evidencia y presupuesto | [03-ia](docs/specs/03-ia.md) |
| Google Login, permisos, API y despliegue | [04-arquitectura-api](docs/specs/04-arquitectura-api.md) |
| iPhone, persistencia local y sincronización | [05-offline-ios](docs/specs/05-offline-ios.md) |
| Importación, exportación y restauración | [06-importacion](docs/specs/06-importacion.md) |
| Cuentas, variables y conexión de servicios | [Guía de configuración](docs/GUIA-CONFIGURACION.md) |
| Propuesta visual y prototipo navegable | [Pantallas](docs/design/pantallas.html), con estado de revisión indicado en [README](README.md) y SPEC |

El prototipo usa datos ficticios; no demuestra login, IA, guardado ni sincronización reales. Para tareas de interfaz, revisar su propuesta junto con el contrato de producto y el estado de aprobación documentado.

## Verificación y cierre

- Ejecutá los checks existentes apropiados al cambio y los escenarios de aceptación de la tarea. Consultá los scripts reales antes de dar comandos por disponibles. Para cambios solo de documentación, comprobá coherencia y enlaces; no hacen falta tests de aplicación.
- Distinguí resultados con mocks, integraciones reales y verificaciones no ejecutadas. No presentes un build como prueba de persistencia, ni WebKit de escritorio como validación completa en iPhone.
- Para UI y lógica aislada, avanzá con adaptadores simulados cuando corresponda. Para integraciones, reutilizá bindings existentes y entornos de prueba; no imprimas secretos ni los guardes en Git.
- Al terminar, indicá qué cambió, qué se verificó y qué falta. Documentá cambios de contrato y evidencia de avance en el repo o PR; no dejes decisiones necesarias solo en la conversación.
- Mantené este archivo breve y estable. El estado de implementación se comprueba en el código y la evidencia de cada tarea; no dupliques aquí los specs completos ni una lista de tareas completadas que pueda quedar desactualizada.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
