# 05 · PWA, iPhone y desconexiones

## Instalación y requisitos

PWA con HTTPS, manifiesto, iconos, nombre corto, `display=standalone`, colores de tema y soporte de safe areas. Instrucciones visibles y breves: abrir en Safari, Compartir, Agregar a inicio. La app funciona también sin instalar.

Probar Safari y la PWA instalada en al menos un iPhone real, además de WebKit automatizado. No considerar una prueba de escritorio como evidencia completa de micrófono, teclado, suspensión o almacenamiento en iOS. Registrar versión de iOS probada; compatibilidad objetivo: versión estable actual y anterior cuando se disponga de dispositivos para comprobarlo.

El primer login con Google y la renovación de una sesión vencida necesitan conexión. Usar redirección completa con PKCE; comprobar el retorno al contexto que inició el login y la persistencia del verificador/cookies. Safari y la PWA instalada pueden tener sesiones/almacenamiento separados: no prometer que instalar copia una sesión ya iniciada. Probar ingreso desde ambos y permitir reintentar desde el contexto original si el retorno abrió otro navegador.

## Persistencia local

IndexedDB guarda:

- Snapshot confirmado y revisión de la mudanza autorizada.
- Cola de comandos estructurados, UUID de operación, payload, versiones esperadas, contexto, dependencias y propietario original (`move_id`, `participant_id`, identificador del usuario Auth).
- Mensajes pendientes de interpretación, diferenciados de comandos ya estructurados.
- Borradores de texto, unidad activa por conversación y reservas de etiquetas.
- Estados de sincronización y recibos recibidos.

Separar datos por entorno, mudanza y cuenta/participante autorizado, no por el token de sesión que cambia al renovarse. No guardar tokens de Auth o Google en IndexedDB. Al salir, ofrecer sincronizar, exportar o conservar los pendientes bajo su cuenta original antes de borrar datos locales. Otra cuenta no puede ver ni reenviar esa cola. El service worker cachea shell y estáticos; excluye rutas de autenticación/callback y respuestas de IA o mutaciones. La copia de inventario se administra explícitamente en IndexedDB.

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

Si el token de acceso vence, intentar renovación mediante el backend/Supabase al recuperar conexión. Si la sesión ya no es renovable, conservar la cola y solicitar Google Login. Solo reenviar después de validar la misma mudanza, cuenta, participante y membresía activa; mantener los mismos UUID y contexto. Un apodo distinto no afecta la autoría ni obliga a recrear comandos.

Si se ingresa con otra cuenta, mantener ocultos y pausados los pendientes originales hasta volver a la cuenta correcta. No permitir que una confirmación reasigne esos comandos a la persona nueva. Si la membresía fue revocada, bloquear envío y preservar/exportar los pendientes para recuperación revisada; la copia local previa puede seguir existiendo en ese dispositivo, sin acceso renovado al servidor.

La salida requiere cerrar la sesión local de Supabase y limpiar cookies en servidor. Sin red, ofrecer bloqueo local y conservación/exportación de pendientes, indicar que la salida del servidor está pendiente y completarla antes de reactivar sincronización. No simular una revocación remota mientras el dispositivo está desconectado.

## Actualizaciones de aplicación

- Si hay nueva versión, mostrar “Actualización disponible” cuando no interrumpa un envío.
- No recargar automáticamente con borrador o pendientes sin persistir.
- Versionar y migrar IndexedDB sin perder la cola; si no es compatible, preservar/exportar y pedir intervención.
- Mantener compatibilidad del contrato de comandos entre clientes viejos y servidor nuevo durante la actualización. Rechazar versiones no soportadas con explicación y conservando el payload.
- No mezclar caches de preview y producción.

## Voz

El input utiliza teclado normal con dictado de iOS. El usuario puede revisar y corregir antes de enviar. No bloquear dictado con controles de entrada no estándar. La voz no requiere permiso de micrófono otorgado a la web mientras se use el dictado del sistema.

La transcripción propia es P1: requeriría permisos, límites de duración y tamaño, codecs admitidos por Safari, cancelación y costo. Jev no recibe audio; una transcripción eventual entra al mismo pipeline de texto.


### Contrato incremental implementado · 14/10/2026

`LocalDocument.syncedRevision` sigue únicamente páginas completas del feed; nunca se adelanta con un recibo propio. `confirmed.revision` puede estar adelante mientras se recuperan cambios intermedios. IndexedDB guarda cambios, historial, contadores y cursor en una sola transacción; un hueco aborta la página. Documentos de la versión anterior sin cursor comienzan en cero, conservando su cola y usando las versiones para evitar regresiones. No cambia el namespace de propietarios existente.

Una respuesta HTTP 202 de chat mantiene el request durable. Las confirmaciones del asistente se conservan en `resolutions` por cuenta, con actor, mensaje, índice, dispositivo y UUID; conflictos/vencimiento quedan visibles para repetir el pedido. La revisión de importación se conserva localmente y solo se retira una página después de recibir confirmación de su commit; la sesión/fila del servidor permite recuperar una respuesta perdida sin duplicar.
