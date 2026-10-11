# Especificación de Mudanza Savanna

Versión 1.0 · 11 de octubre de 2026 · Estado: lista para iniciar implementación por tareas.

Este documento y sus documentos vinculados consolidan la conversación con el usuario. Describen el resultado esperado; no afirman que exista una aplicación, infraestructura desplegada o integración de IA probada. Las decisiones técnicas necesarias para completar el diseño se identifican como defaults de implementación.

## Objetivo

Ayudar a 3–5 personas a empacar, trasladar y encontrar pertenencias durante una mudanza de Weston Hills a Savanna realizada en un solo día. La preparación y el desempaque pueden durar más días. Todos usarán iPhone. El chat y el dictado son la entrada principal; las fichas y botones permiten completar las mismas operaciones de forma directa.

La persistencia compartida, la ausencia de duplicaciones y la veracidad de las confirmaciones son requisitos centrales. Una respuesta de IA nunca prueba que un cambio se haya guardado.

## Decisiones consolidadas

| Tema | Decisión |
| --- | --- |
| Usuarios | Grupo familiar de 3–5 colaboradores; nombre elegido y recordado por dispositivo. |
| Acceso | Invitación compartida, sin cuentas con contraseña ni verificación de identidad personal. La API y los gastos requieren una sesión válida. |
| Plataforma | PWA instalada desde Safari en iPhone; también usable desde el navegador. |
| Datos | Inventario central en Supabase/PostgreSQL; copia local y cola de operaciones para desconexiones. |
| Publicación | Vercel conectado a GitHub: producción desde `main`, previews para ramas/PR. |
| IA | Priorizar Jev en toda decisión adecuada a sus capacidades. Reglas y controles explícitos evitan llamadas innecesarias. Modelo generativo económico solo para lo que lo necesita. |
| Acceso a modelos | Vercel AI SDK + Vercel AI Gateway. Sin integración directa ni clave propia de la API de OpenAI como requisito. Un modelo de OpenAI vía Gateway es una opción, no una obligación. |
| Voz inicial | Dictado del teclado de iOS. Grabación y transcripción propias son una ampliación opcional. |
| Inventario inicial | Cajas y bolsas vacías desde cero. Muebles y otros objetos históricos como candidatos para revisar. |
| Historial | Registro de quién cambia qué, con fecha, cierre por persona y correcciones reversibles. |
| Idioma | Interfaz inicialmente en español; entender entradas en español o inglés y responder en el idioma del mensaje cuando sea inequívoco. |

## Defaults de implementación

- Next.js con App Router, React y TypeScript. Componentes accesibles, CSS/Tailwind según conveniencia; ninguna dependencia visual es requisito de producto.
- Node.js 24 LTS. Fijar versiones estables compatibles del framework, gestor de paquetes y SDK durante T00/T01; guardar lockfile. La documentación de una rama `main` de un SDK no garantiza que la función esté publicada en npm.
- Consultas al inventario desde el backend; sincronización por cambios y polling de 10 segundos mientras la app esté visible. Supabase Realtime no es necesario en v1.
- Presupuesto inicial de IA: USD 5 por mudanza, aviso al 80%, límite aplicado por la aplicación. Es una configuración propuesta, no una compra ni una estimación garantizada de factura.
- Alcance de diseño: 5 usuarios concurrentes, hasta 300 unidades de traslado y 2.000 entradas de contenido. Superar estos números no debe perder datos; requiere revisar rendimiento y presupuesto.
- Zona horaria de la mudanza: `America/New_York`; almacenar instantes en UTC. La fecha exacta de mudanza queda sin asignar hasta que la indique el usuario.

## Qué debe entregar v1

1. Acceso por invitación, selección de nombre y contexto de caja independiente por conversación.
2. Crear y consultar cajas, bolsas, muebles y otros objetos; registrar contenido, cantidades opcionales, destino, fragilidad y prioridad de apertura.
3. Cerrar y reabrir contenedores con autor y fecha; consultar historial y corregir errores.
4. Registrar traslado y desempaque, con vista de pendientes por ambiente.
5. Chat con prioridad a Jev, respuestas sustentadas por el inventario y manejo explícito de ambigüedades.
6. Navegación, búsquedas locales y operaciones estructuradas sin conexión; sincronización visible e idempotente.
7. Revisar/importar muebles históricos, exportar datos y demostrar restauración de un respaldo.
8. PWA verificada en iPhone real, despliegue automático y separación de datos de producción/prueba.

## Fuera del requisito de lanzamiento

- Audio continuo, síntesis de voz, botón propio de grabación y transcripción.
- Fotos, reconocimiento visual automático y generación automática de contenido a partir de imágenes.
- Impresión de etiquetas y QR; los identificadores escritos a mano sí son parte de v1.
- Integración operativa con Google Sheets, cotizaciones de transportistas, pagos o seguimiento GPS.
- Agentes autónomos que reorganizan el inventario, base vectorial dedicada, varios agentes de IA o automatizaciones ajenas a esta mudanza.
- Contenedores estructurados dentro de otros contenedores. V1 conserva esas descripciones como texto y permite relacionar entradas de contenido con un mueble.

## Invariantes obligatorios

- Supabase es la fuente compartida de verdad. Los archivos históricos y la memoria del chat no son inventario actual.
- No mostrar “guardado”, “cerrada” o “llegó” como estado compartido hasta confirmar la transacción. El estado local pendiente se distingue visualmente.
- No duplicar operaciones por doble toque, reconexión, reintentos de IA o recarga.
- No reemplazar todo el inventario al editar un registro. Toda escritura relevante produce un evento de historial en la misma transacción.
- La IA propone operaciones dentro de un catálogo. El backend valida identidad, destino, estado, versiones y reglas antes de ejecutarlas.
- No inventar contenido, ubicación, cantidades ni persona que cerró. La falta de resultados de búsqueda se comunica como tal.
- Mantener separadas la mudanza anterior, la cotización y la mudanza a Savanna.
- Mantener funcionales fichas y controles manuales cuando la IA esté deshabilitada, sin saldo o temporalmente caída.

## Lectura y precedencia

| Documento | Contrato que define |
| --- | --- |
| [01-producto](docs/specs/01-producto.md) | Flujos, pantallas, ambientes y comportamiento visible. |
| [02-datos](docs/specs/02-datos.md) | Entidades, transacciones, estados y concurrencia. |
| [03-ia](docs/specs/03-ia.md) | Selección de herramientas/modelos, evidencia, evaluaciones y costo. |
| [04-arquitectura-api](docs/specs/04-arquitectura-api.md) | Componentes, endpoints, sesiones y despliegue. |
| [05-offline-ios](docs/specs/05-offline-ios.md) | Caché, cola local, recuperación e instalación. |
| [06-importacion](docs/specs/06-importacion.md) | Procedencia, reglas de importación y exportación. |
| [07-aceptacion](docs/specs/07-aceptacion.md) | Escenarios verificables y requisitos de lanzamiento. |
| [08-plan-implementacion](docs/specs/08-plan-implementacion.md) | Entregables por tarea, dependencias y orden sugerido. |

Una nueva instrucción explícita del usuario prevalece. Dentro de esta versión, `SPEC.md` define alcance; cada documento especializado define su contrato. Si hay una contradicción, corregir los documentos afectados y dejar constancia de la decisión, sin implementar dos comportamientos incompatibles.

## Decisiones que se cierran con evidencia durante implementación

- Modelo generativo exacto, versión desplegable de Jev y versión estable compatible de AI SDK: resolver en T00 con disponibilidad real, precios vigentes y una evaluación pequeña.
- Umbrales para las probabilidades de Jev: determinar con ejemplos etiquetados del dominio. Hasta entonces, las decisiones ambiguas requieren aclaración.
- Qué muebles siguen existiendo y a qué ambiente van: resolver con la pantalla de revisión, no inferir de `OK` en una planilla histórica.
- Cuentas, invitación y credenciales de Vercel/Supabase/Gateway: configurar cuando toque desplegar, mediante campos seguros; nunca en el repositorio.

Estas decisiones no bloquean la creación de interfaces, migraciones, lógica determinista y pruebas con adaptadores simulados. No presentar una integración simulada como verificada contra el servicio real.
