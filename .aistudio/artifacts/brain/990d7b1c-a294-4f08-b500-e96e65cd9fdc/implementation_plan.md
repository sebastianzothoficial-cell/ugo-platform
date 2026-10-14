# Implementation Plan - Client App Advanced Enhancements

## User Goal
Enhance the Client App with four powerful advanced pillars:
1. **Advanced Filters & Interactive Map Toggle**: Filter by distance, category, price range, rating, and toggle between grid view and interactive OpenStreetMap view.
2. **Favorite Professionals & Instant Booking Calendar**: Save favorite pros to a dedicated "Favorites" tab, and launch an instant booking calendar modal with slot selection and service warranty options.
3. **Real-Time Chat & GPS Tracking**: Live messaging modal with professional during active bookings, and simulated GPS route tracking map for arriving technicians.
4. **Loyalty Program & Coupons**: UGO Rewards points system, tier status (Silver/Gold/Platinum), reward redemption, and promo coupon code input during checkout.

## Proposed Changes

### 1. State & Data Structures in `src/App.tsx`
- Add `favorites` state (array of professional IDs, persisted in `localStorage`).
- Add `clientLoyalty` state (points, tier, active coupons, discount history).
- Add `clientChat` state (active chat messages per booking/professional).
- Add `advancedFilters` state (radius km, minRating, maxPrice, verifiedOnly).
- Add promo code state during booking checkout.

### 2. Client View Enhancements (`Explore` / `ClientDashboard`)
- **Top Bar & Filters Modal**: Advanced filter controls (distance slider, price filter, minimum rating, verified badge only).
- **Interactive Map / Grid Toggle**: Toggle button between Card Grid and Map view (showing pins with OpenStreetMap preview).
- **Favorites Tab**: Dedicated tab or section for saved favorite professionals with quick-book button.
- **Instant Booking Modal**: Date & time slot picker, service warranty add-on checkbox, promo code input applying loyalty discount.
- **Active Orders & GPS Tracking**: Real-time map simulation showing technician en route to client location with ETA countdown, and in-app chat modal.
- **Loyalty & Rewards Center**: Dedicated modal or card showing UGO Coins balance, points history, available reward discounts, and coupon wallet.

## Verification Plan
- Compile with `compile_applet` and test all new client features.
