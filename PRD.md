
# PRODUCT REQUIREMENTS DOCUMENT (PRD) & TECHNICAL ARCHITECTURE: VisionAlert AI

## 1. Project Overview

**VisionAlert AI** is an Edge-Computing Progressive Web App (PWA) built for physical security and arrival monitoring. It leverages local AI inference via the device's camera (webcam or mobile) to detect vehicles and people entering a user-defined geometric zone. It features zero-page-reload SPA routing, real-time database synchronization, native OS push notifications, and third-party mobile alerts via Telegram.

## 2. Infrastructure & Tech Stack

* **Deployment:** Netlify (Static hosting, optimized for PWAs).
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+ Modules).
* **AI Engine:** `TensorFlow.js` running the `COCO-SSD` pre-trained model via CDN.
* **Backend (BaaS):** Supabase (PostgreSQL, Auth, Realtime WebSockets, Storage).
* **APIs:** Telegram Bot API (`https://api.telegram.org/bot<token>/sendPhoto`), Web Notifications API, `navigator.mediaDevices.getUserMedia`.

## 3. Database Architecture (Supabase / PostgreSQL)

### Table: `profiles`

* `id` (uuid, primary key, references `auth.users`)
* `telegram_token` (text, nullable)
* `telegram_chat_id` (text, nullable)
* `detect_cars` (boolean, default: true)
* `detect_persons` (boolean, default: true)
* `interest_zone` (jsonb, stores canvas coordinates: `{"x": int, "y": int, "w": int, "h": int}`)
* `total_alerts` (integer, default: 0)
* `trip_alerts` (integer, default: 0)
* `total_usage_minutes` (integer, default: 0)
* `trip_usage_minutes` (integer, default: 0)

### Table: `alerts`

* `id` (uuid, primary key, default: `uuid_generate_v4()`)
* `user_id` (uuid, foreign key references `profiles.id`)
* `created_at` (timestamptz, default: `now()`)
* `type` (text) - e.g., 'car', 'person', 'mixed'
* `quantity` (integer) - Count of entities in the frame
* `photo_url` (text) - Public URL from Supabase Storage

### CRON Job (pg_cron)

* Schedule: Daily at 00:00.
* Query: `DELETE FROM alerts WHERE created_at < NOW() - INTERVAL '7 days';`

## 4. UI/UX & PWA Specifications

* **PWA:** Must include `manifest.json` (standalone display) and `sw.js` (Service Worker caching the App Shell).
* **Responsive/Mobile-First:** Flexbox/Grid layouts adapting from mobile screens to desktop monitors.
* **Color System:** Background (`#0a0a0a`), Text (`#ffffff`), Accent (`#00e5ff`), Primary UI (`#2979ff`), Success (`#00e676`).
* **Visual Effects:** * *Glassmorphism:* `background: rgba(255,255,255,0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05);`
* *Interactive Glow:* A fixed, full-screen `div` with `pointer-events: none` containing a radial gradient that updates its `X` and `Y` position based on `mousemove` or `touchmove` events via CSS variables.

* **Widgets:** A system clock updating every second (`HH:MM:SS`), and an SVG status dot with an infinite `@keyframes` pulse animation.

---

---

# 🤖 MASTER AI CODING PROMPT

**System Role:** You are an Expert Principal Full-Stack Engineer and UI/UX Architect.
**Objective:** Build "VisionAlert AI" entirely from scratch based on the PRD above.

**Strict Architecture Constraints:**

1. **Single Page Application (SPA):** The entire app lives in `index.html`. Navigation between the Auth, Dashboard, Config, and Camera views MUST be handled by toggling CSS display classes (e.g., `.hidden { display: none; }`) via Vanilla JavaScript. **Absolutely ZERO page reloads.**
2. **Vanilla JS Only:** Do not use React, Vue, or Tailwind. Write highly modular, modern Vanilla JS (ES6+).
3. **PWA Compliance:** You must generate a fully compliant `manifest.json` and a functional `sw.js` that implements a cache-first strategy for the app shell assets.

**Task Breakdown & Required Deliverables:**
I require the complete, production-ready code for the following files. Do not skip logic. Implement robust `try/catch` error handling for all API/Database calls.

### Deliverable 1: `schema.sql`

Write the PostgreSQL queries to:

* Create the `profiles` and `alerts` tables with the exact columns listed in the PRD.
* Enable Row Level Security (RLS) on both tables so users can only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` their own data (`auth.uid() = user_id`).
* Write the `pg_cron` setup to automatically delete records from `alerts` older than 7 days.

### Deliverable 2: `manifest.json` & `sw.js`

* Generate the manifest with standalone display, dark theme colors, and icons placeholder.
* Generate the Service Worker code to register, install, and fetch-cache the HTML, CSS, and JS files.

### Deliverable 3: `index.html`

Structure the SPA with the following semantic sections:

* `<div id="glow-pointer"></div>` for the interactive background.
* `<header>`: Contains the app title, the System Clock widget (`HH:MM:SS`), and an SVG circle with the class `.pulse-active`.
* `<main id="view-auth">`: Login and Registration forms.
* `<main id="view-config">`: Inputs for Telegram Token, Chat ID, and checkboxes for detection preferences.
* `<main id="view-dashboard">`:
* **Odometer Panel:** Two Glassmorphism cards. Card 1: "Lifetime" (`total_usage_minutes`, `total_alerts`). Card 2: "Trip" (`trip_usage_minutes`, `trip_alerts`) featuring a `<button id="reset-trip">Reset</button>`.
* **Cleanup Controls:** A `<select>` with options (1h, 3h, 6h, 12h, 24h, 36h, 1 week) and a "Clear History" button.
* **Alerts Feed:** An empty `<div id="alerts-grid">` to be populated dynamically.

* `<main id="view-camera">`:
* A `<video autoplay playsinline muted>` element.
* An absolutely positioned `<canvas>` overlay matching the video dimensions. This canvas must listen to mouse/touch events allowing the user to draw and save a geometric bounding box ("Zone of Interest").

### Deliverable 4: `style.css`

* Define CSS custom properties (`:root`) using the PRD color system.
* Implement the Glassmorphism utility classes.
* Implement the `#glow-pointer` using `background: radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(0, 229, 255, 0.08), transparent 40%);`.
* Write the `@keyframes pulse` animation (altering `box-shadow` spread and opacity) for the SVG indicator.
* Write a `.fade-out` class (`opacity: 0; transition: opacity 0.5s ease;`) to animate DOM removal of deleted alert cards.

### Deliverable 5: `app.js` (Core Logic)

Write the complete JavaScript logic covering these critical flows:

1. **Global UI:** `mousemove`/`touchmove` listener to update `--mouse-x` and `--mouse-y`. `setInterval` to update the System Clock every 1000ms.

2. **Camera & AI Flow:** - Load `coco-ssd` via TensorFlow.js CDN.

* Request webcam access (`navigator.mediaDevices.getUserMedia`).
* Run `requestAnimationFrame` inference loop. Filter detected objects: They must be 'car' or 'person', AND their bounding boxes must intersect with the user's drawn "Zone of Interest".
* **Trigger Logic:** Group multiple simultaneous detections (e.g., "2 Persons", "1 Car"). If detection occurs, block new detections for 30 seconds (Cooldown).
* **Parallel Execution:** On trigger, capture the video frame to a Canvas Blob. Execute a `Promise.all()` to:
* A) Upload Blob to Supabase Storage.
* B) INSERT into `alerts` table (quantity, type, photo_url).
* C) Send the photo to Telegram using `fetch()` and `FormData`.
* D) UPDATE `profiles` table to increment `total_alerts` and `trip_alerts` by 1.

1. **Usage Odometer:** When the camera view is active, run a `setInterval` that performs a silent UPDATE to Supabase every 60 seconds, incrementing `total_usage_minutes` and `trip_usage_minutes` by 1.

2. **Dashboard Realtime Sync:** - Fetch initial `alerts` on load.

* Subscribe to Supabase Realtime `postgres_changes` for the `alerts` table. On `INSERT`, play an `Audio()` object, fire a `new Notification('New Alert')`, and prepend the new alert card to the `#alerts-grid` dynamically.

1. **AJAX Deletion:** When the user clicks "Clear History" with a selected timeframe, execute a `DELETE` query to Supabase. Upon success, find all corresponding alert card elements in the DOM, apply the `.fade-out` CSS class, and use `setTimeout` to `.remove()` them from the DOM after 500ms without reloading the page.

Execute this prompt step-by-step. Provide all code blocks clearly.
