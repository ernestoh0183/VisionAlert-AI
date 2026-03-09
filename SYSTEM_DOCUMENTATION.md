# VisionAlert AI - System Documentation / Documentación del Sistema

This document provides a deep dive into the technical architecture and modules of the VisionAlert AI project.

---

## 🇪🇸 Español: Documentación Técnica

### 1. Arquitectura General
VisionAlert AI es una aplicación "Edge-Computing", lo que significa que el procesamiento de datos ocurre en el dispositivo del usuario (`Edge`) y no en un servidor central.
- **Frontend**: Desarrollado en Vanilla JS, HTML5 y CSS3.
- **Backend as a Service (BaaS)**: Supabase (Auth, DB, Realtime, Storage).
- **Procesamiento de IA**: Motor de TensorFlow.js con modelo COCO-SSD.

### 2. Módulos del Sistema
- **Módulo de Cámara**: Gestiona los permisos de `getUserMedia` y la alimentación del flujo de video al motor de IA.
- **Motor de Inferencia (Inference Engine)**: Ejecuta un bucle continuo (`requestAnimationFrame`) que analiza cada fotograma. Detecta cajas de colisión (bounding boxes) y las compara con la "Zona de Interés" dibujada por el usuario.
- **Lógica de Autenticación**: Sistema de sesión persistente con Supabase. Permite registro, inicio de sesión y recuperación de contraseña.
- **Panel de Control (Dashboard)**: Utiliza suscripciones en tiempo real para actualizar las estadísticas de alertas globales y por viaje sin refrescar la página.

### 3. Seguridad y Privacidad
- **Políticas RLS (Row Level Security)**: Cada fila en la base de datos pertenece a un `auth.uid()`. Ningún usuario puede leer los datos de configuración o alertas de otro.
- **Protección de Datos**: Las imágenes capturadas se almacenan en un bucket privado/protegido y solo se generan URLs firmadas o de acceso controlado.
- **Variables de Entorno**: El uso de `config.js` y `.gitignore` asegura que las llaves de producción no se expongan en sistemas de control de versiones públicos.

### 4. Integraciones
- **Telegram Bot API**: Utiliza el método `sendPhoto` para enviar alertas con evidencia visual. La comunicación es asíncrona para no bloquear el hilo principal de la IA.

---

## 🇬🇧 English: Technical Documentation

### 1. General Architecture
VisionAlert AI is an "Edge-Computing" application, meaning that data processing occurs on the user's device (`Edge`) rather than a central server.
- **Frontend**: Built with Vanilla JS, HTML5, and CSS3.
- **Backend as a Service (BaaS)**: Supabase (Auth, DB, Realtime, Storage).
- **AI Processing**: TensorFlow.js engine running the COCO-SSD model.

### 2. System Modules
- **Camera Module**: Manages `getUserMedia` permissions and pipes the video stream into the AI core.
- **Inference Engine**: Runs a continuous loop (`requestAnimationFrame`) analyzing each frame. It detects bounding boxes and checks for intersections with the user-defined "Zone of Interest."
- **Authentication Logic**: Persistent session management via Supabase. Supports registration, login, and password recovery flow.
- **Dashboard**: Leverages real-time subscriptions to update global and trip-specific alert statistics without page reloads.

### 3. Security and Privacy
- **RLS (Row Level Security) Policies**: Every database row is linked to an `auth.uid()`. No user can access or modify another user's configuration or alerts.
- **Data Protection**: Captured images are stored in a secure bucket. Access is restricted through Supabase policies.
- **Environment Management**: Using `config.js` and `.gitignore` prevents production keys from being exposed in public version control systems.

### 4. Integrations
- **Telegram Bot API**: Uses the `sendPhoto` method to relay alerts with visual evidence. Communications are handled asynchronously to avoid performance hits on the AI inference loop.

---

### Technical Specifications / Especificaciones Técnicas
- **AI Model**: COCO-SSD (Common Objects in Context).
- **Format**: PWA (Progressive Web App).
- **Storage**: Supabase Storage (S3-compatible).
- **Styling**: Glassmorphism with Digital/Neon accents.
- **UI/UX**: Hardware-accelerated SVG animated background & custom SVG vector branding.
- **License**: MIT License (Open Source, provided AS-IS without liability).
