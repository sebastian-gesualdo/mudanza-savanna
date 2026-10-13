# Implementación inicial · Casa de los Gesualdo

13 de octubre de 2026. Entrega funcional para desarrollo y demo; todavía no cumple la condición de lanzamiento T11.

Se revisaron AGENTS, SPEC, los ocho specs, guía, README, manifest y ambientes; los tres extractos históricos completos (99/145/148 filas); el prototipo HTML completo, los siete tableros PNG, la ilustración y las 27 páginas del PDF. La interfaz toma esa propuesta como referencia sin declararla una aprobación visual final.

## Alcance implementado

- Next.js 16.4, React 19.3, TypeScript, Node 24 y lockfile. Chat inicial con teclado/dictado de iOS, contexto compacto y menú secundario según los mockups.
- Demo explícita, inicialmente vacía, en IndexedDB. No comparte inventario ni usa Google/IA. Candidatos de importación demo ficticios; referencias reales servidas solo desde endpoint protegido y ausentes de bundles públicos.
- Cajas, bolsas, muebles y otros; contenido literal, cantidades opcionales, destino/origen, tamaño, notas, fragilidad y prioridad. Cierre/reapertura, carga/llegada, ambiente real independiente del destino, desempaque, transferencia, lotes, accesorios, archivo, historial y deshacer compensatorio.
- Búsqueda por código normalizado, tildes/case, sinónimos limitados y un error de escritura. Evidencia visible; contenido retirado se presenta como histórico.
- Comandos Zod con actor esperado, versiones, idempotencia y compuestos atómicos. PostgreSQL bloquea la mudanza y confirma filas afectadas, revisión, evento y recibo juntos. RLS sin acceso directo de anon/authenticated; FK entre mudanzas y eventos inmutables.
- Google PKCE/Supabase SSR desde servidor, `getUser`, identidad Google/correo verificados, membresía activa y vinculación atómica. CLI de alta/revocación y vínculo de participantes restaurados.
- Cola por cuenta/mudanza, proyección pendiente, UUID estable, conflictos conservados, dependientes pausados, coordinación entre tabs y reservas pequeñas de etiquetas. Borradores sin etiqueta al agotarlas. Recibo y remoción de pendiente juntos en IndexedDB.
- Mensajes/contexto locales y API protegida de conversaciones. Chat estructurado reutiliza el comando de la cola y guarda su recibo/mensaje en la misma transacción. El polling usa snapshots coherentes cada 10 segundos visibles.
- Service worker para shell público/estáticos; exclusión de API/Auth, recarga offline, aviso de actualización sin recarga automática. Salida local conserva propietario; salida remota pendiente se completa antes de reingresar.
- Importación histórica revisada de una fila por vez y unicidad fuente/fila. JSON coherente con reservas/recibos; restauración en base vacía sin membresías/credenciales. CSV de unidades neutraliza fórmulas.
- Adaptador de selección Jev compilado contra `experimental_decide` publicado en `ai@7.0.139`; presupuesto y rate limits persistentes, reservas atómicas y reserva conservada ante timeout. Sin clave directa de OpenAI; flags desactivados.

## Evidencia de verificación

| Capa | Resultado y alcance |
| --- | --- |
| Tipos/lint/build | Verificados con Next.js y TypeScript; sin servicios alojados. |
| Dominio/chat/local | 24 pruebas: estados, actores, versiones, compuestos, reintentos, transferencias, deshacer, búsqueda, exportación y cola. IndexedDB simulado. |
| PostgreSQL real temporal | 7 pruebas: seed, permisos, concurrencia, rollback, FK entre mudanzas, reservas de presupuesto, restore/revinculación y revocación. No es Supabase alojado. |
| Reglas deterministas | 40/40 casos manualmente etiquetados en `tests/ai-cases.json`; no mide calidad ni costo/latencia de Jev/generación. |
| Navegador | 6 recorridos en Chromium escritorio y viewport/touch de iPhone: chat completo, controles manuales y recarga offline de PWA conservando unidad/borrador. Build de producción, demo local. |
| Referencias | Cadenas únicas de datos históricos ausentes de los chunks públicos del cliente. |

WebKit no se ejecutó: su descarga desde `cdn.playwright.dev` recibió `403 Domain forbidden` por política de red. Playwright incluye el proyecto WebKit para un entorno con acceso; Chromium se ejecutó con `CHROMIUM_EXECUTABLE=/usr/bin/chromium`. Viewport móvil no equivale a Safari ni a un iPhone físico.

Los comandos reproducibles están en README/package.json y CI. La prueba PostgreSQL espera el cierre de sockets del pool antes de terminar el proceso temporal; un build no se usa como evidencia de persistencia.

## Decisiones físicas

El backend usa `node-postgres` directamente contra PostgreSQL de Supabase, como equivalente transaccional a RPC. `DATABASE_URL` es un secreto del servidor y `DATABASE_SSL=true` verifica TLS. Supabase SSR/publicable sigue resolviendo Auth; `SUPABASE_SECRET_KEY` está reservada y no se usa en este adaptador.

Cada entidad tiene su registro JSONB con columnas generadas/FK/constraints e índices; no hay un blob mutable de todo el inventario. `/api/commands` recibe `{command,deviceId}` y el comando tiene `action:{type,payload}`. El chat admite el mismo `structuredCommand` con UUID del mensaje. Las decisiones están reflejadas en `04-arquitectura-api.md` y la guía.

## Demo privada accesible

El servidor inicial corría en el entorno cloud. `localhost:3000` respondía allí, pero no era una dirección accesible desde el equipo del usuario. Para permitir la prueba se publicó una demo estática privada en [Sites](https://casa-gesualdo-demo.sebagesualdo.chatgpt.site), con acceso de la cuenta propietaria de ChatGPT.

`scripts/prepare-demo.ts` copia únicamente componentes, dominio, almacenamiento local, exportación de respaldos y recursos públicos a un directorio nuevo. Genera una página con demo habilitada y servicios deshabilitados, usando `output: "export"` de Next.js. No incluye rutas API/OAuth, credenciales ni referencias históricas reales. No sustituye el despliegue familiar Vercel/Supabase y no comparte inventario entre navegadores.

Preparación reproducible, con un destino absoluto que todavía no exista:

```bash
npx tsx scripts/prepare-demo.ts /workspace/sites/otra-demo
cd /workspace/sites/otra-demo
npm ci
npm run build
```

La salida estática está en `out/`. Para actualizar el sitio publicado, conservar la identidad de `/workspace/sites/casa-gesualdo-demo/.openai/hosting.json`; no registrar otro sitio.

- Proyecto: `appgprj_6acea867a6b48191a21632a2f08c343f`.
- Fuente publicada en el repositorio propio de Sites: `db9943923601f79e6f201b44a1345bed694a35f3`.
- Versión: `appgprj_6acea867a6b48191a21632a2f08c343f~appgver_495fb056f6f481918b784901604a272e`.
- Despliegue: `appgdep_6acea8e535548191b7c19e91c680af61`, estado `succeeded`, 13 de octubre de 2026.
- Verificación: build estático y tipos correctos; seis recorridos existentes repetidos sobre la exportación con servidor estático, en Chromium escritorio y viewport de iPhone. Incluyen chat, controles manuales y recarga offline conservando unidad/borrador. La publicación y su URL fueron confirmadas por Sites; no se probó la sesión del usuario ni un iPhone físico.

## Pendientes de lanzamiento

1. Configurar test/prod de Supabase, Google OAuth y Vercel; aplicar migraciones en test, autorizar participantes y verificar login/renovación/salida con dos cuentas reales. Este entorno no tiene esas credenciales.
2. Completar T00/T05: disponibilidad/precios live, calibración de Jev, clasificación libre, extracción generativa excepcional, leases/recuperación de cadenas IA y ampliación semántica por bloques. El endpoint semántico actual selecciona entre hasta 30 entradas y todavía no integra el chat libre; no prueba ausencia en todo el inventario. Las reservas están probadas en SQL, la facturación no. Mantener flags desactivados.
3. Completar sesiones/lotes de importación (`/api/imports/:id/commit`), propuestas dedicadas (`/resolve`), interfaces de división de entradas/correcciones de estados anteriores y consumo incremental de deltas. El dominio ofrece las operaciones; la UI inicial importa una fila revisada por vez.
4. Validar HTTP/Auth y multiusuario/offline contra Supabase alojado: respuesta perdida tras commit, revocación concurrente, cambio de cuenta y pestaña antigua, OAuth y actualización con pendientes. Las pruebas SQL/dominio no reemplazan esas integraciones.
5. Publicación de producción en GitHub/Vercel, límites/tarifas actuales, medición p95 y carga de 300 unidades/2.000 entradas. La demo privada de Sites está publicada. La implementación se subió a `feat/casa-gesualdo-app` y está en el [PR #1](https://github.com/sebastian-gesualdo/mudanza-savanna/pull/1), en borrador. La integración Vercel existente informó una preview exitosa del commit `7e11abd8f9e3c849b0a9b85336645f4a6ec0b25f`; no se fusionó a `main` ni se verificó la conexión familiar.
6. Safari/WebKit e iPhone real: instalación, dictado, teclado, suspensión, almacenamiento y OAuth Safari/PWA. Registrar dispositivo/iOS antes de declarar T11.

Las referencias históricas quedan intactas y no se cargan automáticamente. La aprobación de los candidatos y la fecha de mudanza siguen correspondiendo a la familia.

El organizador confirmó los nombres `mudanza-savanna` en Vercel y `mudanza-savanna-prod` en Supabase. Se reutilizan esos proyectos: la conexión GitHub/Vercel está comprobada; URL/ID de Supabase, configuración de Google, variables de los deployments y migraciones alojadas todavía requieren verificación. El entorno cloud no tiene bindings de esos servicios. Ver el registro no secreto en la guía de configuración.
