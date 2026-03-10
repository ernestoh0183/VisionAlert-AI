# VisionAlert AI - System Documentation / Documentación del Sistema

This document provides a deep dive into the technical architecture and modules of the VisionAlert AI project.

---

## 🇪🇸 Español: Documentación Técnica

### 1. Arquitectura General

VisionAlert AI es una aplicación "Edge-Computing", lo que significa que el procesamiento de datos ocurre en el dispositivo del usuario (`Edge`) mediante su navegador y GPU/CPU, y no en un servidor central en la nube.

- **Frontend**: Desarrollado 100% en Vanilla JS (Módulos ES6), HTML5 y CSS3. No se utilizan frameworks pesados para maximizar el desempeño en teléfonos y PCs antiguos.
- **Backend as a Service (BaaS)**: Supabase (PostgreSQL para BD, Auth para inicio de sesión, Realtime WebSockets para el Dashboard, y Storage para guardar fotos).
- **Procesamiento de IA**: Motor de TensorFlow.js corriendo el modelo `COCO-SSD` en el navegador.

### 2. Módulos del Sistema

- **Módulo de Autenticación**: Sesión persistente gestionada con `supabase.auth.getSession()` de manera síncrona al cargar la app para evitar parpadeos visuales (flickering). El `Logout` fuerza una limpieza de caché (`window.location.replace`) a la ruta relativa (`window.location.pathname`) para soportar despliegues en subcarpetas.
- **Motor de Inferencia (Inference Engine)**: Ejecuta un bucle continuo (`requestAnimationFrame`) que analiza cada fotograma. Detecta cajas de colisión (bounding boxes), filtra por 'Clase' (Personas/Vehículos) y verifica iterativamente las colisiones con la `Zona de Interés` dibujada en el canvas por el usuario.
- **Panel de Control (Dashboard)**: Utiliza suscripciones activas (`supabase_realtime`) para actualizar las estadísticas de alertas (Odómetros globales y de viaje) sin refrescar la página.
- **Gestión de Interfaz**: Implementa fondos animados SVG dinámicos en lugar de punteros estáticos para mejorar la experiencia Cyber/Hacking, con un interruptor para desactivarlos (`localStorage`) para ahorrar batería.
- **Borrado de Datos (UX)**: Interfaz de borrado de historial protegida con `window.confirm` interactivo, capaz de purgar datos viejos o realizar borrados masivos ("All Time") con `feedback` de éxito/fracaso dinámico incrustado en el DOM con transiciones `.fade-out`.

### 3. Seguridad y Privacidad

- **Políticas RLS (Row Level Security)**: Totalmente hermético. Cada fila en la base de datos pertenece a un `auth.uid()`. Ningún usuario puede leer ni borrar visualizaciones, configuraciones o alertas de otro usuario.
- **Protección de Evidencia**: Las imágenes capturadas se almacenan temporalmente en un bucket y dependen de RLS para las inserciones. Un "Cron Job" automático (`pg_cron`) en PostgreSQL elimina evidencias físicas del servidor automáticamente después de 7 días.

### 4. Estrategia de Telecomunicaciones (Telegram Dual Routing)

Para evitar problemas de CORS inter-dominios (Cross-Origin Resource Sharing) dictados por los navegadores móviles, la integración con la API de Telegram consta de 2 rutas paralelas:

- **Principal**: Llama a una `Edge Function` de Supabase encargada de enviar el archivo multimedia (Blob de imagen) a los servidores de la Federación Rusa.
- **Fallback (Respaldo)**: Si la Función falla, caduca, o el usuario no la instaló, el Try/Catch transfiere instantáneamente la responsabilidad al método pasivo HTTP REST (`fetch` hacia `https://api.telegram.org`) asegurando la entrega del aviso.

---

## 🇬🇧 English: Technical Documentation

### 1. General Architecture

VisionAlert AI is an "Edge-Computing" application, meaning that data processing occurs on the user's local device (`Edge`) tapping directly into its browser/GPU/CPU, rather than leaning on an expensive central cloud cluster.

- **Frontend**: Developed 100% via Vanilla JS (ES6 Modules), HTML5, and CSS3. Zero heavy frameworks like React/Vue guarantees bare-metal performance on low-end hardware.
- **Backend as a Service (BaaS)**: Supabase (PostgreSQL DB, Auth, Realtime WebSockets for Dashboard streams, and cloud Storage).
- **AI Processing**: TensorFlow.js inference engine running the `COCO-SSD` (Common Objects in Context) model in the browser.

### 2. System Modules

- **Authentication Engine**: Strictly synchronous bootstrapping leveraging `supabase.auth.getSession()` to prevent SPA race conditions upon F5 refreshes. `Logout` forcefully triggers token purges and dynamically routes `window.location.replace` to `window.location.pathname` to tolerate subdirectory hosting (e.g., `/visionalertAI/`).
- **Inference Engine**: Employs an infinitely recursive `requestAnimationFrame` loop. Frame snapshots are scanned for bounding box collisions, rigidly filtered by `Class` (Person/Car), and verified geographically against the custom Cartesian `Zone of Interest` Canvas rectangle drawn by the user.
- **Dashboard**: Hooks into WebSocket `supabase_realtime` channels to reflect global trip metrics and render real-time grid changes devoid of mechanical page reloads.
- **UX & Aesthetic Layer**: Transcended static DOM glows in favor of dynamic SVG generated shape arrays (Cyberpunk theme) cascading structurally across the background. Bound to `localStorage` + `DB` config sync to allow battery-saving disable toggles.
- **Data Remediation**: "Clear History" arrays wrapped around synchronous `window.confirm` barricades preventing accidental deletions. Backend Supabase DELETE payloads parse time matrices ("older than X hours" vs "All Time"), terminating DOM nodes visually using `.fade-out` cascades and explicitly printing success/error status toasts to the user.

### 3. Security and Privacy

- **Row Level Security (RLS)**: Hermetically sealed data structures globally constrained by `auth.uid()`. Cross-tenant data bleeds are physically impossible directly at the SQL kernel layer.
- **Evidence Protection**: Captured frames inject directly into Cloud Buckets via RLS. To prevent eternal sprawl, PostgreSQL native CRONS (`pg_cron`) detonate silently at 00:00 UTC strictly scrubbing evidence payloads older than 7 calendar days.

### 4. Telecommunications Strategy (Telegram Dual-Route)

By design, modern mobile browsers flag heavy Blob transmissions to arbitrary domains (like `api.telegram.org`) as dangerous Cross-Origin acts (CORS) and block them. We circumvent this mechanically:

- **Primary Node**: Initiates a sterile CORS-safe API payload to a trusted Supabase Edge Function (`/v1/telegram-alert`) containing the image and metadata.
- **Fail-Safe Node**: If the Edge container errors out, cold-starts slowly, or wasn't even installed, a localized `catch()` block intercepts the failure, builds a local `FormData()`, and gambles an emergency direct HTTP hit to the Telegram REST backbone.

---

### Technical Specifications / Especificaciones Técnicas

- **AI Model**: COCO-SSD (Common Objects in Context).
- **Format**: PWA (Progressive Web App).
- **Storage Policy**: 7-Day automatic decay.
- **Styling**: Vanilla CSS3 Glassmorphism UI Arrays.
- **DOM Refresh Matrix**: Zero. 100% Single Page Application runtime.
- **Push Handlers**: HTML5 Native Web API `[new Notification()]` integrated mechanically for cross-tab multi-monitor setups.
- **License**: MIT License (Open Source, provided AS-IS without liability).
