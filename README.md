# VisionAlert AI 👁️🛡️

**VisionAlert AI** is an Edge-Computing Progressive Web App (PWA) designed for physical security and arrival monitoring. It utilizes local AI inference (TensorFlow.js with COCO-SSD) to detect vehicles and people within a defined zone through the device's camera.

---

## 🇪🇸 Documentación en Español

### Descripción del Proyecto

Esta aplicación funciona como un sistema de vigilancia "Inteligente y Autónomo" que se ejecuta directamente en el navegador de cualquier dispositivo con cámara (teléfonos, tablets, computadoras viejas). Al detectar personas o vehículos dentro del "Área de Interés", envía notificaciones visuales, sonoras y mensajes de Telegram en tiempo real, registrando los eventos en una base de datos segura (Supabase).

### Características Principales

- **Inferencia de IA Local**: Usa TensorFlow.js y COCO-SSD, lo que significa que las imágenes **no** se suben constantemente a la nube para ser analizadas, ahorrando ancho de banda y protegiendo tu privacidad.
- **PWA (Aplicación Web Progresiva)**: Se puede instalar en la pantalla de inicio del móvil como una app nativa gracias a su `manifest.json` y `sw.js` (Service Worker).
- **Notificaciones por Telegram**: Envía una foto del evento detectado directamente a un chat de Telegram.
- **Arquitectura SPA**: Interfaz rápida y sin recargas de página (Single Page Application) usando Vanilla JavaScript.
- **Base de Datos en Tiempo Real**: Sincronización instantánea de alertas mediante Suscripciones de Supabase (WebSockets).

### Guía de Implementación y Configuración

#### 1. Configuración de Supabase (Backend)

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. Copia la URL de tu proyecto y la clave **`anon` `public`** (Settings > API).
3. **Seguridad para GitHub**:
   - Notarás un archivo `config.js.example`. Cámbiale el nombre a `config.js`.
   - Pega tus credenciales dentro de ese archivo.
   - El archivo `config.js` está incluido en `.gitignore`, por lo que tus llaves nunca se subirán a GitHub si haces el repositorio público.
4. Ve a **SQL Editor** en Supabase y ejecuta todo el contenido del archivo `schema.sql` para crear las tablas (`profiles`, `alerts`) y las políticas de seguridad.
5. Ve a **Storage** y crea un "Bucket" público llamado exactamente `alerts-photos`.
6. En **Authentication > Providers > Email**, asegúrate de tener una configuración acorde a tus necesidades (puedes desactivar "Confirm email" para pruebas rápidas).

#### 2. Configuración de Telegram (Bot)

1. Abre Telegram y busca **@BotFather**.
2. Envía el comando `/newbot` y sigue las instrucciones para crear tu bot.
3. Copia el **Token de la API HTTP** que te da BotFather.
4. Para obtener tu **Chat ID**, inicia un chat con tu nuevo bot (envíale un "Hola"), luego reenvía ese mensaje al bot **@userinfobot** o usa la API web de Telegram para ver tus actualizaciones.
5. Ingresa el Token y el Chat ID en la sección **"Config"** dentro de la aplicación VisionAlert AI.

#### 3. Ejecución Local (Desarrollo)

Para evitar problemas de CORS, necesitas un servidor HTTP local. Si tienes Python instalado, abre la terminal en la carpeta del proyecto y ejecuta:

```bash
python -m http.server 3000
```

Luego abre en tu navegador <http://127.0.0.1:3000>.

#### 4. Despliegue en Producción (Recomendado)

Para usar la aplicación en tu teléfono, necesitas subirla a internet (HTTPS requerido para usar la cámara web).

- **Opción recomendada**: [Netlify](https://www.netlify.com/) o [Vercel](https://vercel.com/) o GitHub Pages. Simplemente arrastra la carpeta del proyecto a Netlify Drop y en segundos tendrás una URL segura.

---

## 🇬🇧 English Documentation

### Project Description

This application functions as an "Intelligent & Autonomous" surveillance system that runs directly in the browser of any camera-equipped device (phones, tablets, old PCs). Upon detecting people or vehicles within the "Zone of Interest," it sends real-time visual, audio, and Telegram notifications, logging the events in a secure database (Supabase).

### Key Features

- **Local AI Inference**: Uses TensorFlow.js and COCO-SSD, meaning video frames are **not** constantly uploaded to the cloud for analysis, saving bandwidth and protecting privacy.
- **Progressive Web App (PWA)**: Can be installed to a mobile home screen like a native app via its `manifest.json` and `sw.js` (Service Worker).
- **Telegram Notifications**: Sends a photo of the detected event directly to a Telegram chat.
- **SPA Architecture**: Fast, reload-free User Interface (Single Page Application) using pure Vanilla JavaScript.
- **Real-Time Database**: Instant synchronization of alerts using Supabase Realtime Subscriptions (WebSockets).

### Implementation and Setup Guide

#### 1. Supabase Setup (Backend)

1. Create a project on [Supabase](https://supabase.com/).
2. Copy your Project URL and the **`anon` `public`** key (Settings > API).
3. **GitHub Security**:
   - You will see a `config.js.example` file. Rename it to `config.js`.
   - Paste your credentials inside that file.
   - The `config.js` file is included in `.gitignore`, so your keys will never be uploaded to GitHub if you make the repository public.
4. Go to the **SQL Editor** in Supabase and run all the contents of the `schema.sql` file to create the tables (`profiles`, `alerts`) and security policies.
5. Go to **Storage** and create a public "Bucket" named exactly `alerts-photos`.
6. Under **Authentication > Providers > Email**, ensure the settings match your needs (you can disable "Confirm email" for quick testing).

#### 2. Telegram Bot Setup

1. Open Telegram and search for **@BotFather**.
2. Send the `/newbot` command and follow the instructions to create your bot.
3. Copy the **HTTP API Token** provided by BotFather.
4. To get your **Chat ID**, start a chat with your new bot (send it "Hello"), then forward that message to the **@userinfobot** or use the Telegram web API to view your updates.
5. Enter the Token and Chat ID in the **"Config"** section inside the VisionAlert AI application.

#### 3. Local Execution (Development)

To avoid CORS issues, you need a local HTTP server. If Python is installed, open your terminal in the project folder and run:

```bash
python -m http.server 3000
```

Then open <http://127.0.0.1:3000> in your browser.

#### 4. Production Deployment (Recommended)

To use the application on your phone, you must host it online (HTTPS is required for webcam access).

- **Recommended Option**: [Netlify](https://www.netlify.com/) or [Vercel](https://vercel.com/) or GitHub Pages. Simply drag and drop the project folder into Netlify Drop, and you'll have a secure URL in seconds.

---

## 📜 License & Liability / Licencia y Responsabilidad

### 🇪🇸 Español

Este proyecto se distribuye bajo la **Licencia MIT**. Eres libre de usar, modificar y distribuir este software, incluso para uso comercial. Sin embargo, **el creador (Rodrigo Hernandez) no se hace responsable** por el mal uso de la aplicación, fallos en la detección de seguridad, o cualquier daño derivado del uso de este software. Esta herramienta se proporciona "tal cual" (AS IS) con propósitos de portafolio y demostración técnica.

### 🇬🇧 English

This project is licensed under the **MIT License**. You are free to use, modify, and distribute this software, including for commercial use. However, **the creator (Rodrigo Hernandez) assumes no liability** for misuse of the application, security detection failures, or any damages arising from the use of this software. This tool is provided "AS IS" for portfolio and technical demonstration purposes.

---
**Developed by [Rodrigo Hernandez](https://rodrigo.us)**
