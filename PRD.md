# PRODUCT REQUIREMENTS DOCUMENT (PRD) & TECHNICAL ARCHITECTURE: VisionAlert AI

## 1. Project Overview

**VisionAlert AI** is an Edge-Computing Progressive Web App (PWA) built for physical security and arrival monitoring. It leverages local AI inference via the device's camera (webcam or mobile) to detect vehicles and people entering a user-defined geometric zone. It features zero-page-reload SPA routing, real-time database synchronization, native OS push notifications, and third-party mobile alerts via Telegram.

## 2. Infrastructure & Tech Stack

* **Deployment:** Netlify, Vercel, or GitHub Pages (Must run in HTTPS context for Camera Permissions). Handles subdirectories directly by tracking `window.location.pathname`.
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+ Modules). Zero heavy frameworks (No React/Vue).
* **AI Engine:** `TensorFlow.js` running the `COCO-SSD` pre-trained model via fast CDN.
* **Backend (BaaS):** Supabase (PostgreSQL, Auth, Realtime WebSockets, Storage).
* **APIs:**
  * Telegram Bot API (`https://api.telegram.org/bot<token>/sendPhoto`)
  * Supabase Edge Functions (`/functions/v1/telegram-alert`)
  * Web Notifications API (Local Device)
  * `navigator.mediaDevices.getUserMedia` (WebRTC)

## 3. Database Architecture (Supabase / PostgreSQL)

### Table: `profiles`

* `id` (uuid, primary key, references `auth.users`)
* `telegram_token` (text, nullable)
* `telegram_chat_id` (text, nullable)
* `detect_cars` (boolean, default: true)
* `detect_persons` (boolean, default: true)
* `enable_animations` (boolean, default: true)
* `interest_zone` (jsonb, stores canvas coordinates: `{"x": int, "y": int, "w": int, "h": int}`)
* `total_alerts` (integer, default: 0)
* `trip_alerts` (integer, default: 0)
* `total_usage_minutes` (integer, default: 0)
* `trip_usage_minutes` (integer, default: 0)
* `created_at` (timestamptz, default: `now()`)

### Table: `alerts`

* `id` (uuid, primary key, default: `uuid_generate_v4()`)
* `user_id` (uuid, foreign key references `profiles.id`)
* `created_at` (timestamptz, default: `now()`)
* `type` (text) - e.g., 'car', 'person', 'mixed'
* `quantity` (integer) - Count of entities in the frame
* `photo_url` (text) - Public URL from Supabase Storage `alerts-photos` Bucket

### CRON Job (pg_cron)

* Schedule: Daily at 00:00.
* Query: `DELETE FROM public.alerts WHERE created_at < NOW() - INTERVAL '7 days';`

## 4. UI/UX & PWA Specifications

* **PWA:** Includes `manifest.json` (standalone display) and `sw.js` (Service Worker caching the App Shell offline).
* **Responsive/Mobile-First:** Flexbox/Grid layouts adapting seamlessly from mobile screens to desktop monitors.
* **Color System:** Background (`#0a0a0a`), Text (`#ffffff`), Accent (`#00e5ff`), Primary UI (`#2979ff`), Danger (`#ff1744`), Success (`#00e676`).
* **Visual Effects:**
  * *Glassmorphism:* `background: rgba(255,255,255,0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05);`
  * *Animated Ambient Background:* A generated SVG canvas containing randomly floating Cyber/Hacker geometric shapes (Triangles, Diamonds, Hexagons, Squares) floating infinitely upwards to simulate data traffic. Can be toggled off to save battery via LocalStorage + DB Sync.
* **Navigation Widgets:** A system clock updating every second (`HH:MM:SS`), and an SVG status dot with an infinite CSS `@keyframes` pulse animation indicating connection health.

## 5. Architectural Flow & Logic Specifications

### Boot & Session Engine

The application determines authentication by explicitly awaiting `supabase.auth.getSession()` BEFORE revealing the UI. This prevents race conditions and UI flickering upon `F5` or hard refreshes.

### AI Inference Engine

1. Uses `requestAnimationFrame` for a smooth, non-blocking evaluation loop.
2. The user draws a rectangular boundary on the canvas. Collisions are ONLY counted if the center point of the COCO-SSD detected bounding box lands *inside* the user's custom boundary.
3. Groups multiple detections ("2 Persons", "1 Car") mathematically before dispatching a single incident report payload.
4. **Cooldown Mechanism:** Imposed 30,000ms (30 second) mechanical cooldown after an alert to prevent database flooding from static objects (e.g., a parked car).

### Telegram Dual-Routing System

To guarantee delivery across different mobile carrier configurations and browser CORS security protocols, the app uses a dual routing path:

* **Primary Path:** Pings a custom Supabase Edge Function with the alert payload.
* **Fallback Path:** If the Edge Function responds with `404` or times out, it traps the error and immediately uses the direct Telegram REST API via `fetch()` as a secondary fail-safe.

### Logout & Cleanup Hardening

* **Logout:** The `signOut` routine forces an asynchronous wait for the JWT token wiping process to finish, followed by a hard `window.location.replace(window.location.pathname)` to prevent cache resurgences.
* **Data Cleanup:** The UX permits the user to delete old evidence records natively. It provides a `window.confirm` safety catch and executes a targeted `DELETE` matrix against Supabase, dynamically removing rows from the DOM with a 500ms CSS fade-out transition.
