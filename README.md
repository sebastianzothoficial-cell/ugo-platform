# UGO Platform

Responsive React + TypeScript + Vite application for UGO's local-services marketplace. Configured for GitHub Pages at `/ugo-platform/` and designed to use the existing UGO TEST Supabase browser configuration from the previous repository.

## Implemented in this initial foundation

- Responsive Portuguese-first interface with Spanish and English language selection, saved per browser.
- Supabase email/password sign-in and sign-up.
- Read-only display of existing `usuarios`, `categorias`, and `servicios` data, subject to Supabase RLS.
- Dashboard role label sourced from the database profile. A requested role during sign-up does not grant privileges.
- GitHub Actions build/deployment workflow for GitHub Pages.
- No service-role key or server-side secret included in the client bundle.

## Environment

The `.env.example` file uses the public browser configuration referenced by the old repository. The corresponding values can be configured as GitHub Actions variables if needed:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Publishable keys are browser-visible by design. Never place a Supabase secret/service-role key in a `VITE_` variable.

## Development

```sh
npm install
npm run typecheck
npm run build
```

## Deployment

The workflow in `.github/workflows/deploy.yml` builds on pushes to `main` and deploys the `dist` artifact to GitHub Pages. Repository Pages settings must use **GitHub Actions** as the deployment source.

## Important verification boundaries

The previous repository is a reference, not runtime proof. It identifies `https://tmossnqfwfwjrtzwcbmm.supabase.co` as UGO TEST, while the currently connected Supabase workspace exposed a different project (`pasion-travel-tour`). No database was changed. Do not change targets or apply schema changes until access to the original UGO project and its actual schema/RLS is confirmed. This initial foundation does not yet implement the full client/professional/admin service lifecycle, maps, contracting, payment operations, or privileged administration. Those require further schema, policy, and runtime verification.
