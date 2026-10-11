# 05 · PWA, iPhone y desconexiones

## Instalación y requisitos

PWA con HTTPS, manifiesto, iconos, nombre corto, `display=standalone`, colores de tema y soporte de safe areas. Instrucciones visibles y breves: abrir en Safari, Compartir, Agregar a inicio. La app funciona también sin instalar.

Probar Safari y la PWA instalada en al menos un iPhone real, además de WebKit automatizado. No considerar una prueba de escritorio como evidencia completa de micrófono, teclado, suspensión o almacenamiento en iOS. Registrar versión de iOS probada; compatibilidad objetivo: versión estable actual y anterior cuando se disponga de dispositivos para comprobarlo.

## Persistencia local

IndexedDB guarda:

- Snapshot confirmado y revisión de la mudanza autorizada.
- Cola de comandos estructurados, UUID de operación, payload, versiones esperadas, contexto y dependencias.
- Mensajes pendientes de interpretación, diferenciados de comandos ya estructurados.
- Borradores de texto, unidad activa por conversación y reservas de etiquetas.
- Estados de sincronización y recibos recibidos.

Separar datos por mudanza y sesión autorizada. Al cambiar de mudanza o salir, ofrecer resolver/exportar pendientes antes de borrar datos locales. El service worker cachea shell y estáticos; no cachea indiscriminadamente respuestas de sesión, invitaciones, IA o mutaciones. La copia de inventario se administra explícitamente en IndexedDB.

## Estados visibles

| Estado | Significado |
| --- | --- |
| Borrador | Texto todavía no enviado. |
| Pendiente de interpretar | Mensaje de chat guardado localmente que requiere conexión/IA. No cambió el inventario. |
| Pendiente de sincronizar | Comando estructurado guardado localmente. Puede verse en la proyección local, pero otros usuarios aún no lo ven. |
| Sincronizando | Solicitud en curso. |
| Guardado | Existe recibo confirmado del servidor. |
| Requiere revisión | Conflicto de versiones, estado o datos. El texto/payload se conserva. |
| Error reintentable | Fallo transitorio con reintento acotado. |

Mostrar cantidad de pendientes y “Última sincronización”. No presentar el simple evento `online` como prueba de acceso al servidor; comprobar con solicitudes reales.

## Operaciones offline

Sin conexión se puede consultar la copia, buscar localmente, editar borradores y encolar acciones estructuradas. Un pedido libre como “cambiá esas tres cosas” queda como mensaje pendiente de interpretar si no tiene una interpretación determinista segura.

La cola captura la unidad elegida al enviar. Al volver la conexión no se redirige una instrucción a la nueva caja activa. Si un pronombre o referencia perdió validez por cambios concurrentes, pedir aclaración.

Procesar dependencias en orden: crear caja → agregar contenido → cerrar. Una falla/conflicto pausa dependientes de esa caja, pero no operaciones independientes de otra unidad. Aplicar recibos a la copia local e integrar luego los cambios de otros participantes.

Reintentar con el mismo `operationId`; una respuesta perdida después del commit se resuelve recuperando el recibo. Actualizar cola y snapshot en una transacción de IndexedDB para tolerar cierre de la app durante el procesamiento.

## Identificadores offline

Con conexión, reservar por dispositivo bloques pequeños de códigos, por ejemplo 10 cajas y 5 bolsas, mediante una operación idempotente y contadores de PostgreSQL. No reservar cientos anticipadamente. Los códigos pueden tener huecos; nunca se reciclan.

Una creación offline usa UUID local más código reservado. El servidor valida la reserva y el dispositivo al sincronizar. Varios tabs comparten asignación atómica en IndexedDB, evitando reutilizar una etiqueta.

Si se agotaron las reservas, crear un borrador temporal identificado como tal. No presentar su código temporal como etiqueta definitiva para escribir en la caja. Asignar código estable al sincronizar y hacer visible el cambio. No generar “siguiente número” leyendo solo el máximo local.

## Suspensión y recuperación

No depender de Background Sync, tareas permanentes ni de que una PWA cerrada siga enviando datos. Reanudar sincronización al abrir, volver al primer plano y mediante botón Reintentar.

El almacenamiento de iOS puede ser eliminado por el usuario o el sistema; los datos exclusivamente locales aún no son un respaldo compartido. Mantener pendientes visibles y permitir exportar un archivo con copia local y operaciones pendientes. El archivo debe distinguir estos datos de un export confirmado del servidor.

Si la sesión expiró, conservar la cola, solicitar reingreso y solo reenviar después de validar que corresponde a la misma mudanza. No reasignar silenciosamente a otro participante la autoría de operaciones creadas con una sesión anterior; conservar actor original validable o pedir confirmación explícita de la nueva atribución.

## Actualizaciones de aplicación

- Si hay nueva versión, mostrar “Actualización disponible” cuando no interrumpa un envío.
- No recargar automáticamente con borrador o pendientes sin persistir.
- Versionar y migrar IndexedDB sin perder la cola; si no es compatible, preservar/exportar y pedir intervención.
- Mantener compatibilidad del contrato de comandos entre clientes viejos y servidor nuevo durante la actualización. Rechazar versiones no soportadas con explicación y conservando el payload.
- No mezclar caches de preview y producción.

## Voz

El input utiliza teclado normal con dictado de iOS. El usuario puede revisar y corregir antes de enviar. No bloquear dictado con controles de entrada no estándar. La voz no requiere permiso de micrófono otorgado a la web mientras se use el dictado del sistema.

La transcripción propia es P1: requeriría permisos, límites de duración y tamaño, codecs admitidos por Safari, cancelación y costo. Jev no recibe audio; una transcripción eventual entra al mismo pipeline de texto.
