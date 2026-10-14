# 06 · Inventario histórico, importación y respaldo

## Material disponible

Se recibieron dos Excel como referencia. Se extrajeron sus valores de las hojas relevantes a JSON para que nuevas tareas no dependan de adjuntos de una conversación. Ver [manifest.json](../references/manifest.json) para nombres, SHA-256, hojas y conteos.

| Extracto | Filas de datos | Uso |
| --- | --- | --- |
| [legacy-containers.json](../references/legacy-containers.json) | 99 | Ejemplos de contenido, lenguaje y búsquedas; no inventario de la mudanza nueva. |
| [legacy-inventory.json](../references/legacy-inventory.json) | 145 | Candidatos de muebles/otros y procedencia para revisión. |
| [legacy-quote-comparison.json](../references/legacy-quote-comparison.json) | 148 | Comparaciones por fila para advertir diferencias; no catálogo de objetos confirmados. |
| [destination-rooms.json](../references/destination-rooms.json) | 17 ambientes | Catálogo de destinos para Savanna. |

Los extractos preservan letras de columna, encabezados y número de fila de origen. Se leyeron valores almacenados/caché del Excel, sin ejecutar fórmulas, enlaces, macros o instrucciones en celdas. Textos como “confirmar” o “remover” son contenido histórico, no autorización para ejecutar acciones.

## Hallazgos de las planillas

### Contenedores

- 80 cajas Piece of Cake, 10 bolsas azules, 8 cajas plásticas y 1 caja custom.
- Los 99 figuran cerrados en el archivo. Hay persona que inició, pero no persona/hora de cierre.
- La caja custom, fila 67, tiene ID vacío. No reproducir la convención implícita de inventar ID 1 en el modelo nuevo.
- Hay aliases de ambientes y descripciones en español/inglés, cantidades ocasionales, marcas y nombres familiares.
- Aparecen bolsas/cajas dentro de cajas y accesorios de muebles. Conservar texto y permitir relaciones explícitas.
- Hojas auxiliares `Día D` y `black bokex` contienen pendientes/notas breves. Su presencia motiva una lista opcional de últimas cosas; no se importan como contenido confirmado.

### Muebles y objetos

- `Inventory`: 95 filas OK, 3 Add, 47 Removed. Las 98 OK/Add suman 234 unidades declaradas, incluidas cajas y bolsas; no son 98 muebles ni 234 muebles.
- Entre esas filas están los mismos 80+8+10 contenedores y la caja del Roborock. No volver a crear sus contenidos ni tratarlos como muebles nuevos.
- También hay Plastic Bin XL, árbol en bolsa y backdrop. Requieren clasificar qué representa el artículo y si se reutiliza; no inferir que todo lo que dice Box/Bag debe descartarse físicamente.
- Algunos registros son lotes: sillas, camas o estanterías con cantidades mayores a uno.
- Los comentarios pueden corregir el nombre: `Deadline`/Deadlift bar, y una entrada de cama que aclara que solo hay colchón y tipi.
- `Inventory (OLD)` y hojas pivot antiguas no se combinan con `Inventory`; duplicarían o reintroducirían artículos descartados.
- `Para el comprador` incluye 10 imágenes de elementos ofrecidos en venta. No prueba que se vendieron ni que siguen disponibles. Las imágenes no se incluyen en los extractos del repositorio.

### Comparación 2026

La hoja contiene 86 coincidencias, 47 filas removidas históricas y 15 excepciones: 4 faltantes, 1 diferencia de cantidad, 3 extras, 6 revisiones de descripción/equivalencia y 1 cambio de área. Es un análisis almacenado en el archivo, no una verificación física actual ni una orden del usuario.

Ejemplos: seis sillas frente a seis mesas plegables, uno frente a dos soportes de TV, una TV/lámpara/backdrop que la comparación marca faltantes, y comedor agregado. Guardar estas diferencias como observaciones para revisar; no resolverlas por un score.

## Flujo de importación

V1 utiliza los extractos JSON versionados del repositorio para esta importación histórica. No requiere construir un importador universal de Excel ni conectarse a Google Sheets. El respaldo canónico de la aplicación tiene su propio esquema y procedimiento de restauración.

1. Crear una sesión de importación con fuente, hash y revisión. Mostrar vista previa sin crear inventario.
2. Proponer OK/Add como candidatos. Removed empieza fuera de la selección, accesible si el usuario necesita reincorporar algo. No afirmar que Removed significa vendido o perdido.
3. Clasificar cada candidato como mueble, otro objeto, contenedor a empezar de cero o excluir. Para contenedores reutilizados, conservar solo tipo/alias físico si el usuario lo desea; borrar en la propuesta el contenido y estados de la mudanza anterior.
4. Revisar nombre familiar, cantidad, si aún existe y destino en Savanna. Mantener comentarios originales separados de notas actuales.
5. Valores de origen anteriores quedan como referencia histórica. No asumir que la ubicación anterior describe dónde está hoy en Weston Hills.
6. Mostrar resumen de unidades/lotes a crear y exclusiones. Confirmar una vez el lote revisado.
7. Importar idempotentemente en transacciones pequeñas, registrando qué filas se aplicaron. Tras un fallo, reintentar únicamente pendientes sin duplicar completadas.

El usuario puede revisar e importar parte de la lista y completar después. Un candidato sin destino puede guardarse como unidad actual en preparación si se confirmó que existe; no puede marcarse listo/cargado hasta resolver destino. No bloquear todo el proyecto por discrepancias de muebles todavía no revisados.

Un cambio de archivo fuente puede introducir las mismas filas con nuevo hash. Mostrar posibles duplicados por procedencia/nombre/cantidad y pedir revisión; la idempotencia por hash de archivo no es deduplicación semántica.

## Conservación y correcciones

Los extractos del repositorio son inmutables como fuente v1. Correcciones de la mudanza nueva viven en la base de datos y en eventos, no se aplican retrospectivamente al JSON histórico. Si se recibe una nueva fuente, agregar una versión y documentar su procedencia.

No copiar presupuestos, comentarios de compradores o importes a campos de inventario por similitud de columna. Los datos de cotización no definen volumen, ubicación ni valor económico actual de un objeto.

## Exportación

### JSON canónico

Incluir `schema_version`, fecha UTC, mudanza, revisión consistente, ambientes, participantes (IDs y apodos), unidades, entradas, relaciones, historial, procedencia, contadores de etiquetas y reservas de códigos sin credenciales. Excluir `move_memberships`, correos autorizados, vínculos con `auth.users`, sesiones, claves, reservas de gasto y tokens de Supabase/Google/proveedor de IA. Los mensajes completos pueden ser un export opcional separado; el historial de cambios y texto de origen suficiente deben conservarse.

Obtener una vista transaccional coherente: no mezclar unidades de antes de una transferencia con entradas de después. Preservar UUID y códigos para restauración.

### CSV

Ofrecer archivos/tablas separados para unidades, contenido y eventos si resulta necesario. Documentar encabezados y codificación UTF-8. Proteger valores que empiezan con `=`, `+`, `-` o `@` al abrir en hojas de cálculo; el JSON conserva el valor original. CSV facilita consulta; no es el respaldo canónico de todas las relaciones.

### Recuperación

Validar un export JSON en una base de prueba vacía: mismo número de unidades/entradas/eventos, mismas relaciones y códigos, sin duplicación. Una restauración sobre una mudanza con datos exige modo explícito y revisión de conflictos; nunca reemplazo silencioso del inventario completo.

Restaurar participantes con sus UUID y apodos conserva autores históricos, pero no concede acceso. Supabase Auth y la lista de acceso se configuran por separado en el destino. La herramienta administrativa debe permitir vincular explícitamente los correos autorizados a participantes restaurados sin duplicarlos; no copiar usuarios Auth ni asumir que sus UUID existen en otro proyecto. Probar login y un cierre nuevo después de esa vinculación, conservando la autoría anterior.

Restaurar los contadores y códigos ya reservados para no reciclar etiquetas impresas/escritas que todavía no tengan una unidad sincronizada. Reconciliar el consumo de IA con su registro/proveedor antes de volver a habilitar llamadas: restaurar el inventario no debe reiniciar implícitamente el saldo gastado.

El export offline tiene formato y etiqueta diferenciados, incluyendo `confirmed_revision` y `pending_commands`. No importar esos pendientes como hechos confirmados.


### Sesiones y lotes implementados · 14/10/2026

`POST /imports/preview` recupera la sesión propia para el hash inmutable y devuelve originales/progreso sin crear inventario. Cada fila se revisa con existencia, tipo, nombre, cantidad y destino; Removed empieza sin selección. Guardar una revisión la conserva en el dispositivo y el resumen muestra nombres, cantidades, destinos y exclusiones. Una confirmación explícita envía páginas de hasta veinte filas. Cada página es transaccional, la procedencia única evita duplicados incluso entre sesiones y cada reintento debe conservar la decisión original. Cajas/bolsas se revisan individualmente y comienzan vacías. El vínculo de participantes y la administración de accesos permanecen fuera de la API familiar.
