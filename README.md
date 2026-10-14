# UGO Platform

React 19 + TypeScript + Vite front-end for the existing UGO Supabase **TEST** project. Public deployment target: `https://sebastianzothoficial-cell.github.io/ugo-platform/`.

## Getting started

```sh
npm ci
cp .env.example .env # optional: checked-in defaults contain only the existing public project URL and publishable key
npm run dev
npm run typecheck
npm test
npm run build
npm run check:pages              # Pages base-path doctor (docs/github-pages-diagnostic.md)
```

The SPA uses hash navigation, so a direct `/#/requests` load works under `/ugo-platform/` without a server rewrite. The Vite base prefixes JS/CSS assets. Supabase confirmation and reset links must allow the Pages URL in **Supabase Auth URL Configuration** (Site URL / additional redirect URLs). GitHub Pages serves static files only; no server-side payment, AI or webhook keys belong here.

## Implemented contracts

- Authentication uses existing Supabase Auth and `usuarios` for *canonical* role and active status, never client-supplied role metadata for access. The backend RLS/RPC policies remain the authorization boundary. Client, provider and admin areas fail closed when the profile cannot be read.
- Catalog reads `categorias` and the **redacted** `proveedores_mapa` view. Map markers are approximate coordinates provided by that view, not a provider's private GPS. MapLibre displays OpenStreetMap raster tiles by default; for production volume configure a licensed hosted `VITE_MAP_STYLE_URL`, respecting the provider's tile usage terms.
- Client profile uses `completar_onboarding_cliente`; orders use `servicios` INSERT, `guardar_ubicacion_servicio_cliente`, then `iniciar_matching`, with session draft ID to avoid duplicate orders on retries. Existing orders, status and cancellation through `cancelar_servicio` are available. A failed match leaves the saved order visible for retry.
- Provider profile, private KYC document upload (`provider-kyc`), review submission, GPS-based online activation, offers, acceptance/rejection and lifecycle RPCs follow the previous project's migrations. Approval remains an admin/back-end decision. Existing provider RLS and readiness checks still apply. Administrators see read-only operational counts and recent records (no privileged writes or financial actions from static Pages).
- Language defaults to pt-BR; es/en selection is stored locally and in Auth `preferred_language` metadata per account. No new tables or migrations are created.

## Deployment

`.github/workflows/pages.yml` runs tests, typecheck and build on pushes to `main`, then publishes `dist/` using GitHub Pages Actions. Pages must be enabled in repository settings with **Build and deployment → GitHub Actions**. Only public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may optionally be added as repository variables; defaults point at the public UGO TEST project from the previous repository. Never set service-role credentials as Pages variables.

## Verification limitations

The reference is `sebastisnzoth/ugo-admin-panel` (inspected without modifying it), particularly `supabase/migrations/20260904_client_onboarding_gate.sql`, `20260913062000_client_onboarding_rpc.sql`, `20260912203500_service_insert_integrity_guard.sql`, `20260920162500_client_service_pickup_rpc.sql`, `20260929205900_harden_provider_offer_rpc_cross_role.sql`, `20261001131000_provider_profile_location_and_atomic_online.sql`, `20261002115500_matching_requires_service_location.sql` and `20261003000211_authenticated_matching_gateway.sql`. Those are **versioned contracts, not a live schema dump**. The sandbox cannot reach the Supabase host (TLS connection failed), so no authenticated E2E/RLS proof or payment flow was run. Do not treat a successful static build as proof that the existing database has all migrations applied. Production payment checkout, admin financial operations and external messaging require secured backend deployment, not GitHub Pages.
