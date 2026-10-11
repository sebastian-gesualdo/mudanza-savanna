# 01 · Producto y experiencia

## Personas y contexto

Todos los colaboradores pertenecen a la misma mudanza y pueden trabajar sobre su inventario. Al entrar por invitación, eligen un nombre existente o crean uno. Evitar nombres duplicados por mayúsculas/espacios. Es una atribución familiar: no prueba la identidad de la persona. Se puede cambiar de nombre explícitamente en el dispositivo.

Cada conversación mantiene su propia unidad activa. El cierre que hace Lu no cambia la caja activa de Seba. Abrir una ficha ajena no debe alterar silenciosamente el contexto del chat: ofrecer “Trabajar con esta caja”. Mostrar siempre una etiqueta visible como “Trabajando en C-024 · Kitchen”.

## Ambientes de Savanna

Las claves son estables; los textos visibles pueden corregirse sin cambiar referencias. [destination-rooms.json](../references/destination-rooms.json) es el listado inicial, con alias propuestos.

| Clave | Nombre visible |
| --- | --- |
| garage | Garage |
| lavadero | Lavadero |
| dining-room | Dining Room |
| play-room | Play Room |
| living-room | Living Room |
| kitchen | Kitchen |
| patio | Patio |
| master-bedroom | Master Bedroom |
| guest-bedroom | Guest Bedroom |
| office | Office |
| boys-room | Boys Room |
| chloes-room | Chloe's Room |
| master-bathroom | Master Bathroom |
| kids-bathroom | Kids Bathroom |
| chloes-bathroom | Chloe's Bathroom |
| guest-bathroom | Guest Bathroom |
| downstairs-bathroom | Downstairs Bathroom |

Se corrigen `Dinning` y `Downstatins`; se conserva su interpretación como alias. `Guest's Bathroom` es alias de `Guest Bathroom`. “Baño”, “cuarto” o “master” solos pueden ser ambiguos: preguntar cuando no haya una referencia inequívoca. Un destino pendiente se representa con valor nulo y texto “Sin asignar”, no con un ambiente ficticio. No trasladar automáticamente habitaciones de la casa anterior a estos ambientes.

## Unidades que se trasladan

- Caja (`C-001`): cartón, plástica o custom como subtipo.
- Bolsa (`B-001`): color o descripción opcional.
- Mueble (`M-001`): objeto individual o grupo que viaja junto.
- Otro objeto (`O-001`): electrodoméstico, equipo de gimnasio, planta, decoración u otro elemento suelto.

El código completo es único en la mudanza. El número 1 puede existir en C y B; una petición por “la 1” necesita contexto o aclaración. Los códigos nunca se renumeran ni reutilizan al archivar.

Datos visibles: código, nombre, tipo/subtipo, destino, origen opcional, ubicación de traslado, contenido cuando corresponda, observaciones, fragilidad, “Abrir primero”, responsables y estado. Tamaño de contenedores opcional: pequeño, mediano, grande, otro; desconocido no equivale a “no aplica”.

Un grupo de ocho sillas puede registrarse como un lote de cantidad 8. Si hay que enviar tres a otro ambiente o registrar solo tres como llegadas, dividir el grupo en dos registros vinculados al origen. Nunca marcar ocho como llegadas cuando se indicaron tres.

## Pantallas

### Chat

- Entrada de texto compatible con dictado de iOS, botón Enviar y selección de nombre visible.
- Caja activa visible; controles “Nueva caja”, “Nueva bolsa”, “Agregar contenido”, “Cerrar” y “Buscar”.
- Conversación individual por dispositivo/conversación; inventario compartido.
- Respuestas cortas y tarjetas con código, ambiente y acción para abrir la ficha.
- Recibo de operación con cambios concretos y acceso a Deshacer cuando corresponda.
- Aclaraciones con opciones tocables: no obligar a reescribir toda la instrucción.
- Indicadores diferentes para procesando, pendiente de sincronizar, guardado y error.
- Modo explícito “Agregar contenido a C-024”: el texto dictado se conserva como descripción; no exige un modelo generativo para dividirlo en objetos.

### Inventario

- Lista buscable con filtros de tipo, ambiente de destino, estado de empaque/traslado/desempaque, fragilidad y prioridad.
- El buscador directo funciona sin IA, con tolerancia básica a tildes, mayúsculas y errores de escritura.
- Búsqueda semántica al enviar una consulta, no en cada pulsación de tecla.
- Conteos provenientes de la base de datos o, sin conexión, claramente identificados como copia local.
- Filtros de pendientes: sin destino, abiertas, falta trasladar, llegó, falta desempacar.

### Ficha de unidad

- Contenido legible, editable por entrada, sin exigir cantidades para descripciones como “cosas del mueble azul”.
- Acciones apropiadas al tipo; un mueble no tiene botón “Cerrar caja”.
- Destino previsto separado de ubicación real. “Va a Kitchen” no significa “está en Kitchen”.
- Historial con persona, hora y cambios; identidad de la persona que cerró visible.
- Relaciones a accesorios: “Tornillos de M-003, dentro de C-014”.
- Traslado con botones “Cargado” y “Llegó”, y confirmación de ambiente real al entregar.
- Desempaque parcial o terminado para cajas/bolsas. Permitir marcar contenido como retirado y registrar destino/contenedor nuevo cuando se conoce.

### Mudanza y ajustes

- Resumen por ambiente de destino, pendientes de cargar/entregar/desempacar y elementos “Abrir primero”.
- Cambio explícito de participante, estado de sincronización, exportación y consumo de IA.
- Acceso a revisión de muebles históricos.
- Pequeña lista opcional “Últimas cosas”: texto, persona opcional y completada. Es P1; no bloquea inventario v1.

## Flujos principales

### Empacar

1. “Estoy armando una caja para la cocina”. Crear C-024, asignar Kitchen y dejarla activa.
2. “Seis platos y cuatro bowls”. En modo agregar contenido, guardar el texto completo como una entrada; dividirlo en dos es opcional y corregible.
3. “También la fuente azul; es frágil”. Aplicar lo que pueda resolverse de forma inequívoca. Si “frágil” puede referirse al objeto o a la caja, mostrar la propuesta apropiada y permitir corregir.
4. “Cerrala”. Cerrar la caja activa, registrar quién y cuándo y devolver contenido/resumen y destino confirmados.

Para cerrar se necesita destino y contenido registrado, o una declaración explícita de contenedor vacío. Si falta información, conservar lo ya guardado y pedir solo lo faltante. No inferir el contenido de una caja a partir de su habitación.

### Registrar un objeto suelto

“El escritorio blanco va a Office; sus tornillos están en C-014”. Crear o resolver el mueble, asignar destino y registrar la relación solo cuando esté claro qué registro representa al escritorio. Si hay dos escritorios similares, ofrecer ambos. Una nueva descripción libre puede requerir extracción generativa o un formulario breve.

### Encontrar algo

“¿Dónde está el hervidor?” puede recuperar “pava eléctrica”. Mostrar coincidencias con contenido textual y código. Con varias coincidencias, listar alternativas. “Varios de cocina” es una posible pista, no evidencia de que contenga el hervidor.

“¿Qué hay en C-024?” consulta directamente la unidad, con cero llamadas de IA. “¿Cuántas cajas faltan llegar?” utiliza un conteo determinista con filtros explícitos.

### Trasladar y desempacar

Registrar carga y llegada desde ficha, lista o chat. La llegada sin confirmación de habitación significa “Savanna · habitación sin confirmar”. Mantener el destino previsto visible.

Durante el desempaque se puede marcar una entrada como retirada, indicar dónde quedó o moverla a otro contenedor. Si toda una caja se marca como desempacada, sus entradas dejan de afirmarse como físicamente dentro; su contenido histórico sigue consultable. Si no se registró nueva ubicación, decir “estaba en C-024; ya se retiró y no se registró dónde quedó”.

### Corregir

- Agregar o cambiar un dato inequívoco: ejecutar y dar recibo; no pedir confirmación adicional para cada entrada.
- Cerrar: una orden explícita o tocar Cerrar basta, salvo requisitos faltantes o conflicto.
- Reabrir: acción explícita, registrada. No reabrir automáticamente para agregar.
- Archivar una unidad, retirar contenido ambiguo o modificar varias unidades: vista previa y una confirmación explícita. No borrar físicamente los registros.
- Deshacer: generar una operación compensatoria. Si hubo cambios posteriores incompatibles, mostrar el conflicto y ofrecer una corrección actual, sin restaurar una foto antigua de todo el inventario.

## Presentación

Priorizar uso con una mano: objetivos táctiles de al menos 44×44 puntos CSS, texto de formulario de 16 px o mayor, contraste suficiente y soporte para safe areas y teclado. Diferenciar estados con texto e iconos además del color. Mantener búsqueda y código de la caja fáciles de leer bajo luz exterior.

No exponer nombres de modelos, llamadas a herramientas, JSON, puntajes internos ni explicaciones de infraestructura en los flujos normales. Ajustes puede mostrar gasto y estado de conexión en lenguaje simple.
