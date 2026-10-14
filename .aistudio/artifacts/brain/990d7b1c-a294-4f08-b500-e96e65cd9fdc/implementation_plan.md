# Implementation Plan - Professional Photo Gallery & Work History

## User Goal
Implement a photo gallery editor in the Professional profile where providers can upload multiple project photos, enabling clients to see their past work history across profiles and service details.

## Proposed Changes

### 1. Database & State Management
- Support storing professional portfolio photos in Supabase (`perfiles_proveedor` gallery table or jsonb column, or `localStorage` fallback for robust offline/local resilience).
- Provide clean state management in `src/App.tsx` for professional project gallery photos (adding, deleting captions, uploading images).

### 2. Professional Profile Editor ("App Provedor")
- Add a dedicated **Project Portfolio / Past Work Gallery** section in the Professional profile edit view.
- Allow uploading multiple project photos with optional title/description/category.
- Allow deleting existing portfolio photos instantly.

### 3. Client View ("App Cliente" & Service Details)
- Display the professional's project photo gallery in their public profile view so clients can inspect past work history before booking.
- Display portfolio photos in service details / booking preview modals when a client selects a professional.

## Verification Plan
- Compile applet with `compile_applet`.
- Lint with `lint_applet`.
