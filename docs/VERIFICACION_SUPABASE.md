# Verificación P0/P1 contra la instancia Supabase existente (TEST `tmossnqfwfwjrtzwcbmm`)

Documento de trabajo. **No borra ni altera nada**: todo lo de abajo es lectura o comandos idempotentes
que decidís correr vos en el editor SQL del proyecto TEST. No se agregaron tablas, views, migrations,
policies ni RPCs desde este repo, y no va a suceder: el frente es estático.

## Estado real de esta sesión

| Comprobación | Cómo se intentó | Resultado |
| --- | --- | --- |
| Esquema aplicado, Auth, relaciones, grants, Storage, policies RLS | `curl https://tmossnqfwfwjrtzwcbmm.supabase.co/rest/v1/categorias`, `/auth/v1/health` | **No ejecutable.** El DNS resuelve, la conexión TLS no se establece (salida de red bloqueada en el sandbox: `http=000`). Ningún dato de la instancia fue leído ni verificado. |
| URL pública de Pages | `curl https://sebastianzothoficial-cell.github.io/ugo-platform/` | **No verificable desde el sandbox** (misma restricción de red). Lo único comprobable era el estado del workflow, y sí corre verde: run `Build and deploy UGO` → `build` **pass** (`npm ci`, `npm test`, `npm run build`), `deploy` salteado en PRs. El despliegue real a `github.io` quedó sin confirmar por HTTP. |
| Contrato esperado (nombres de tablas, columnas, RPCs, estados, buckets) | Lectura del repo de referencia `sebastisnzoth/ugo-admin-panel` (migrations y servicios, sin modificarlo) | **Hecho.** Es la fuente de las listas de abajo. Sigue siendo una inferencia sobre contratos versionados, no un volcado del esquema vivo. |
| Flujo cliente → pedido → ubicación → matching → oferta → aceptación → seguimiento | Tests de comportamiento con un doble de PostgREST en `tests/flow.test.mjs` | **Hecho en local.** Idempotencia, verificación del estado persistido y portales de evidencia están cubiertos por 10 tests. No reemplaza una corrida autenticada real. |
| Cobro Pix / tarjeta / cierre financiero | — | **No implementado a propósito.** Requiere backend seguro; la UI sólo registra preferencia y lo dice explícitamente (`paymentNote`). |

## Pendiente explícito (lo que hay que correr del lado de la instancia)

1. Que `public.servicio_estado` contenga exactamente `borrador, buscando, ofrecido, asignado, en_camino, llegado, en_progreso, esperando_aprobacion, completado, cancelado, disputado` (el frente ya no emite `ejecutando` ni `confirmado`, que no existen en el enum y hacían fallar el paso del profesional).
2. Que las columnas que lee el frente existan en cada tabla (lista en `scripts/verificar-contrato.mjs`).
3. Que `proveedores_mapa` sea efectivamente una vista **redactada** con coordenadas aproximadas, y que un proveedor autenticado no pueda leer la ubicación privada de otro.
4. Que RLS esté habilitado y las policies por rol sean las esperadas en `usuarios`, `perfiles_cliente`, `perfiles_proveedor`, `categorias`, `servicios`, `ofertas_servicio`, `documentos`, `evidencias_servicio`.
5. Que los buckets `provider-kyc` y `service-evidence` existan, sean privados y tengan policies de path por `usuario_id` (subida propia, lectura de participantes).
6. Que los `GRANT EXECUTE` lleguen a `authenticated` para cada RPC listada abajo, y que `private.*_impl` no sea ejecutable desde PostgREST.
7. Que Auth tenga Site URL / redirect URLs con la URL de Pages, SMTP confirmando y plantillas de recuperación activas.

## Paso 1 · sonda pública, sin clave privada

```sh
UGO_URL=https://tmossnqfwfwjrtzwcbmm.supabase.co \
UGO_KEY=<publishable key del .env.example> \
node scripts/verificar-contrato.mjs
```

Solo GET/HEAD y un POST vacío por RPC, `limit=0`: no se transfiere ni escribe dato. Reporta `FALLO` si falta
una tabla/columna/RPC, `PENDIENTE` cuando sin JWT no se puede decidir, y `REVISAR` si una tabla responde sin
token (señal de policy abierta a `anon`). Sale con código ≠ 0 ante fallas, así se puede enchufar a un job.

## Paso 2 · SQL de introspección (editor SQL del proyecto TEST)

```sql
-- 1. Enum canónico
select e.enumlabel::text as estado, e.enumsortorder::int as orden
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname = 'servicio_estado' order by e.enumsortorder;

-- 2. Columnas que consume el frente
select table_name, string_agg(column_name, ',' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public'
  and table_name in ('usuarios','perfiles_cliente','perfiles_proveedor','categorias','proveedores_mapa',
                     'servicios','ofertas_servicio','documentos','evidencias_servicio')
group by table_name order by table_name;

-- 3. RLS activo y policies por tabla
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       coalesce(json_agg(json_build_object('p', p.polname, 'cmd', p.polcmd, 'roles', array_to_string(p.polroles::regrole[], ','),
                                           'using', coalesce(array_to_string(p.polqual, ' '), '(solo writer)')) order by p.polname), '[]') as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('usuarios','perfiles_cliente','perfiles_proveedor','categorias','proveedores_mapa',
                    'servicios','ofertas_servicio','documentos','evidencias_servicio')
group by c.relname, c.relrowsecurity order by c.relname;

-- 4. Grants sobre las RPCs que llama el frente
select p.proname as function_name,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
       array_agg(distinct privilege_type) as anon_or_authenticated_privileges,
       r.rolname as grantee
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
join pg_roles r on r.oid = any (select grantee::regrole::oid from information_schema._pg_func_privs where grantor = p.proowner)
where p.proname in ('completar_onboarding_cliente','guardar_ubicacion_servicio_cliente','iniciar_matching','iniciar_matching_dirigido',
                    'cancelar_servicio','obtener_ofertas_proveedor','aceptar_oferta','rechazar_oferta','avanzar_servicio',
                    'marcar_llegada_proveedor','activar_disponibilidad_proveedor','aprobar_servicio','confirmar_pago_efectivo_cliente','cash_payment_enabled')
group by 1,2,3,5 order by 1;

-- 5. Storage: buckets, acceso público y policies de objeto
select b.bucket_id, b.public, coalesce(json_agg(json_build_object('p', sp.policyname, 'cmd', sp.cmd, 'roles', sp.roles)) order by sp.policyname) as policies
from storage.buckets b left join storage.policies sp on sp.bucket_id = b.id
where b.id in ('provider-kyc','service-evidence','request-evidence','client-public','provider-public')
group by b.bucket_id, b.public order by b.bucket_id;
```

Si el paso 4 no anda en tu versión de Postgres (depende de catálogos internos), alternativa simple:

```sql
select proname, proacl from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('avanzar_servicio','aprobar_servicio','confirmar_pago_efectivo_cliente','iniciar_matching');
```

## Paso 3 · recorrido autenticado, con dos cuentas de prueba del TEST

Con una cuenta `cliente` y una `proveedor` **aprobada** (`estado_verificacion='verificado'`), y GPS activo:

1. Cliente: crear pedido (categoría + descripción + dirección + GPS) → debe quedar `buscando` con `ubicacion_cliente` persistida.
2. Reintentar sin red en el medio (offline toggle): **no** debe aparecer un segundo pedido; el borrador se recupera por `metadata.request_draft_id` y el aviso dice "recuperado sin duplicar".
3. Proveedor: `obtener_ofertas_proveedor` muestra la oferta; aceptar → la oferta queda `aceptada` **y** el servicio `asignado` con `proveedor_id` propio. Rechazar un offer ajeno o ya respondida debe fallar con aviso, no con éxito falso.
4. Proveedor: `asignado → en_camino` (a ≤60 min del agendado), `en_camino → llegada` (a ≤200 m del cliente; la plataforma manda `marcar_llegada_proveedor`), `llegado → en_progreso` exige foto **inicial**, `en_progreso → esperando_aprobacion` exige foto **final**. Ningún paso más es del proveedor: cerrar el servicio le pertenece al cliente.
5. Cliente: ver el mismo `numero` de servicio avanzar sin recargar (realtime sobre `servicios` filtrado por `cliente_id`), y el pill con el estado localizado.
6. Cross-role, y debe fallar: cliente leyendo `perfiles_proveedor` de otro, proveedor leyendo `documentos` de otro, ambos escribiendo `estado` directo en `servicios` (sólo RPCs), anon leyendo `proveedores_mapa.lat/lng` exactos.
7. Cierre con dinero: **fuera de alcance aquí**. `aprobar_servicio` y `confirmar_pago_efectivo_cliente` exigen fila en `pagos` con `estado`/`pago_externo_id` reales, y eso lo produce el backend seguro, no Pages.

## Qué se verificó realmente en producción

Nada todavía: el sandbox no tiene salida a Supabase ni a Pages. Nada de este documento debe leerse como
"probado contra la instancia". Lo probado localmente es `npm test` (contratos de esquema/i18n, render por ruta e
idempotencia del flujo con un doble de PostgREST), `tsc --noEmit` y `vite build`, más el job `build` del workflow en GitHub.
