# 02 · Datos, estados e integridad

Este es un modelo lógico. Las migraciones pueden adaptar nombres físicos conservando las invariantes y contratos. Usar UUID como identidad interna; los códigos legibles son etiquetas únicas, no claves de relación.

## Entidades

| Entidad | Campos principales y restricciones |
| --- | --- |
| `moves` | `id`, nombre, origen, destino, `moving_date` nullable, zona horaria, `sync_revision`, fechas. Una mudanza activa inicialmente. |
| `participants` | `id`, `move_id`, nombre visible, nombre normalizado único por mudanza, activo, fechas. No importar colaboradores anteriores como usuarios actuales sin selección. |
| `sessions` | Sesión opaca y hash del token, mudanza, participante elegido, dispositivo, expiración. No exportar credenciales. |
| `rooms` | `id`, `move_id`, `key`, nombre, alias. Unicidad de `(move_id, key)`. Los 17 destinos se crean idempotentemente. |
| `units` | `id`, `move_id`, código, tipo, categoría/subtipo, nombre, cantidad del lote, tamaño, destino previsto, origen textual opcional, estado de empaque/traslado/desempaque, habitación real en destino nullable, frágil, abrir primero, notas, versión, autores, fechas y archivo lógico. |
| `content_entries` | `id`, `move_id`, `current_unit_id` nullable, `last_unit_id`, texto original, descripción, cantidad opcional y unidad de medida, estado, habitación actual explícita nullable, autor, mensaje de origen, versión, fechas. |
| `item_links` | Relación de una entrada de contenido con una unidad suelta: accesorio, tornillos/piezas, parte de, otra. Referencias existentes dentro de la misma mudanza. |
| `conversations` | `id`, mudanza, sesión/dispositivo propietario, participante, unidad activa nullable y versión del contexto. No existe una caja activa global. |
| `messages` | Mensaje UUID, conversación, participante, texto, idioma, contexto capturado, estado de procesamiento, respuesta persistida, referencias de evidencia y operación. |
| `command_receipts` | `operation_id`, mudanza, hash canónico de solicitud, resultado persistido, versiones resultantes, revisión de sincronización. Unicidad por mudanza y operación. |
| `events` | UUID, mudanza, revisión, tipo, actor, dispositivo, hora del servidor, hora cliente opcional, entidades afectadas, cambios antes/después, operación y evento compensado opcional. Inmutables. |
| `label_counters` / `label_reservations` | Contadores por mudanza y prefijo; reservas persistentes asignadas a un dispositivo con solicitud idempotente. Un código emitido nunca vuelve al contador libre. |
| `import_sources` / `import_rows` | Archivo y SHA-256, hoja/fila, valores originales, decisión de revisión, destino elegido y unidades creadas. Una fila de la misma fuente no se importa dos veces en una mudanza. |
| `ai_usage` | Solicitud, modelo y versión informada, propósito, tokens, latencia, resultado, precio aplicado, reserva y costo confirmado/estimado. Sin claves ni audio. |

Las claves foráneas entre entidades incluyen validación de la misma `move_id`; no basta con que exista un UUID. Los índices deben cubrir código, mudanza/estado/destino, contenido buscable, eventos por revisión y las claves de idempotencia.

## Tipos y códigos

- `kind`: `box`, `bag`, `furniture`, `other`.
- Prefijos: C, B, M, O respectivamente. El subtipo caja plástica conserva prefijo C.
- Código renderizado con mínimo tres dígitos; C-1000 sigue siendo válido. Normalizar búsquedas `c24` y `C-024` al mismo código cuando no haya ambigüedad.
- `unit_count`: entero positivo. Debe ser 1 para cajas/bolsas. Un conjunto que viaja completo puede tener cantidad mayor para muebles/otros.
- Una división de lote crea una unidad nueva por la cantidad separada y reduce la original; conserva trazabilidad de ambas. No reutilizar código ni perder el total.
- Alias descriptivos opcionales: “caja negra pinturas”, “escritorio blanco”. No sustituyen la identidad única ni garantizan unicidad semántica.

## Campos de ubicación

Separar tres conceptos:

1. `source_room_text`: ubicación de origen informada para esta mudanza; puede ser texto libre.
2. `destination_room_id`: ambiente previsto en Savanna; nullable hasta asignarlo.
3. `transit_state` y `actual_room_id`: dónde se registró la unidad durante el traslado. `actual_room_id` solo aplica cuando está en Savanna y se confirmó el ambiente real.

Una habitación de la planilla anterior queda en procedencia histórica, no se copia silenciosamente a ubicación actual. Cambiar destino previsto no mueve físicamente el objeto.

## Máquinas de estados

### Empaque

`open → closed → open` para cajas y bolsas. `not_applicable` para muebles y otros.

- Crear contenedor: abierto.
- Cerrar: requiere destino y al menos una entrada activa, o `declared_empty=true` confirmado explícitamente. Grabar `closed_by` y `closed_at` desde sesión y reloj servidor.
- Agregar, editar o retirar contenido de una caja cerrada durante el empaque requiere reapertura explícita. La edición de notas/destino no reabre la caja y queda en historial.
- Reabrir limpia el cierre actual visible; conserva cada cierre anterior en eventos. Un cierre posterior tiene nuevo actor y hora.
- El desempaque habilita retirar contenido sin reescribir la historia del cierre de empaque.

### Traslado

`at_origin → in_transit → at_destination`.

- V1 permite marcar llegada directamente desde origen para registrar un traslado que no se marcó al cargar; registrar el salto, sin fabricar hora de carga.
- Cargar o llegar requiere destino previsto. Caja/bolsa abierta necesita cierre previo; se puede proponer un comando compuesto explícito de cerrar y cargar.
- Al llegar, preguntar/ofrecer confirmar el ambiente real. Sin confirmación: Savanna, ambiente real pendiente.
- Volver hacia un estado anterior es una corrección explícita con evento; no borrar el traslado previo.

### Desempaque

`not_started → partial → done` para cajas y bolsas; `not_applicable` para los demás.

- Se inicia normalmente en destino. Fuera de destino, solicitar aclaración o corrección de ubicación antes de marcar desempaque.
- Cada entrada puede pasar de `packed` a `unpacked` o transferirse a otro contenedor abierto. Una transferencia modifica las dos unidades en una transacción.
- Para retirar parte de una entrada con varios objetos, dividirla explícitamente o editar su descripción antes de retirar la parte. No inventar cantidades a partir de texto vago.
- Marcar toda la caja como desempacada actualiza las entradas aún contenidas a `unpacked`, sin borrarlas. Guardar la última caja y la nueva habitación solo si se informó.
- Agregar contenido a un contenedor terminado requiere una acción explícita de reutilizar/reabrir. Reinicia el ciclo visible conservando eventos anteriores; nunca lo hace una búsqueda.

### Archivo

Archivo lógico separado de los estados. Se excluye de búsquedas normales, conserva historial y permite restauración explícita. La API pública no tiene borrado físico de inventario.

## Entrada de contenido

La entrada puede ser una descripción compuesta: “seis platos, cuatro bowls y la fuente azul”. No es obligatorio convertir cada sustantivo en una fila. La descripción original se conserva; una división posterior mantiene referencia a la entrada original.

`quantity=null` significa desconocida/no estructurada, nunca cero. Para “6 platos” se puede guardar cantidad 6 y descripción platos cuando el usuario lo cargó estructuradamente o una extracción validada lo respalda. Los totales de objetos deben diferenciar cantidades conocidas y entradas sin cantidad.

Los accesorios pueden referenciar M-003 aunque físicamente estén en C-014. No duplicar el accesorio como si estuviera en ambas unidades. La búsqueda debe devolver contenedor actual y relación.

## Transacciones e idempotencia

Toda mutación pasa por un servicio de comandos y una función transaccional de PostgreSQL (RPC o equivalente). Una sucesión de llamadas independientes con `supabase-js` no constituye una transacción.

Orden de una operación:

1. Resolver sesión y mudanza; validar forma y límites de la solicitud.
2. Preparar el plan fuera de la transacción si necesita IA. No mantener locks durante llamadas a modelos.
3. Iniciar transacción y bloquear primero la fila `moves` de esa mudanza. Cinco usuarios permiten este orden simple y predecible.
4. Buscar recibo por `operation_id`. Si existe con el mismo hash, devolverlo. Si el hash difiere, rechazar la reutilización de clave.
5. Releer registros, validar pertenencia, permisos, estado y versiones esperadas.
6. Ejecutar todos los cambios del comando o ninguno; incrementar versiones de entidades afectadas.
7. Incrementar `sync_revision` de la mudanza, insertar un evento con todos los cambios y el recibo correspondiente.
8. Confirmar transacción y devolver recibo. Solo entonces mostrar confirmación compartida.

Bloquear la fila de la mudanza antes de asignar revisión hace que el orden observado de revisiones respete el commit. No usar únicamente un `bigserial` asignado antes del commit como cursor de sincronización: se podrían omitir transacciones que terminan fuera de orden.

La idempotencia cubre doble toque, reintentos, modo offline y comandos propuestos por IA. Persistir el UUID antes de enviar; conservarlo al reintentar. Una corrección del usuario es un comando nuevo.

## Versiones y conflictos

- Cambiar destino, cerrar, transferir, dividir, archivar y deshacer requiere las versiones de los registros que se mostraron al usuario.
- Dos adiciones a una caja abierta pueden coexistir como nuevas entradas: no se reemplaza una lista entera. Igual se comprueba bajo lock que la caja siga abierta.
- Si otro usuario cerró la caja, una adición tardía se rechaza o queda en revisión. No perder el texto ni reabrir automáticamente.
- Un conflicto devuelve `409`, la versión actual, el motivo y el texto original/propuesta conservado.
- Un comando compuesto tiene una sola operación y una transacción. Si falla una parte, ninguna modificación del compuesto queda aplicada.
- El servidor nunca acepta `closed_by`, `created_by` o `move_id` arbitrarios para atribuir una operación: los deriva de la sesión validada.

## Historial y deshacer

Cada evento conserva el cambio efectivo y actor. Deshacer crea un evento compensatorio referenciando al original; no elimina el original. Antes de compensar, verificar versiones y relaciones. Si la entrada fue modificada por otra persona o transferida, mostrar el conflicto en lugar de restaurar contenido anterior sobre trabajo nuevo.

El recibo debe indicar código de unidad, valores cambiados, actor, hora del servidor, revisión y posibilidad de deshacer. La hora offline declarada por el cliente puede mostrarse como información secundaria; nunca reemplaza el momento de confirmación en servidor.

## Integridad de las búsquedas

Separar contenido activo, retirado y archivado. Una coincidencia histórica se etiqueta como histórica. Una respuesta debe usar el estado actual al renderizarla, aunque su candidato provenga de caché: revalidar versiones antes de presentarla como vigente.

Los conteos de cajas, unidades y cantidades no son intercambiables. Ejemplo: un lote con ocho sillas es un registro de traslado y ocho objetos; una descripción sin cantidad es una entrada, no un objeto cuantificado.
