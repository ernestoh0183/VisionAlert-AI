# VisionAlert AI 👁️🛡️

**VisionAlert AI** is an advanced Edge-Computing Progressive Web App (PWA) designed for physical security, intrusion detection, and arrival monitoring. It utilizes localized, in-browser artificial intelligence (TensorFlow.js and the COCO-SSD machine learning model) to detect vehicles and people within a user-defined physical zone using the device's camera.

---

## 🇪🇸 Documentación en Español

### Descripción Técnica del Proyecto

VisionAlert AI funciona como un sistema de vigilancia "Inteligente y Autónomo" que se ejecuta **directamente en el navegador** de cualquier dispositivo que tenga una cámara (teléfonos móviles, tablets, computadoras portátiles o PCs antiguas de reciclaje).

A diferencia de los sistemas de videovigilancia tradicionales (CCTV) que graban 24/7 y requieren discos duros masivos o que suben el video constantemente a la nube, VisionAlert AI **procesa el video localmente** usando la GPU/CPU de tu propio dispositivo táctico. Solo cuando el sistema detecta una intrusión real (una persona o un vehículo) es que toma una fotografía y la envía a través de internet.

Al detectar una intrusión dentro del "Área de Interés" trazada por el usuario en la pantalla, el sistema:

1. Emite una alarma visual (la pantalla parpadea en rojo) y una alarma sonora.
2. Captura un cuadro de video (foto) del incidente.
3. Sube la foto de manera segura a la nube usando **Supabase Storage**.
4. Dispara una **función Edge** (o API directa) para enviar la fotografía y un mensaje de texto directamente a tu teléfono mediante un bot de **Telegram**.
5. Registra el evento en una base de datos PostgreSQL en tiempo real, actualizando instantáneamente el "Panel de Control" (Dashboard) en cualquier otro dispositivo donde estés conectado.

### Arquitectura y Tecnologías (Tech Stack)

* **Frontend (UI/UX)**: Vanilla HTML5, CSS3, JavaScript puro (ES6 Modules). No usa frameworks pesados como React o Angular para maximizar el rendimiento en dispositivos móviles antiguos.
* **Inteligencia Artificial**: `TensorFlow.js` con el modelo pre-entrenado `COCO-SSD` (Common Objects in Context - Single Shot MultiBox Detector). Este modelo ha sido optimizado para ejecutarse en el navegador.
* **Backend as a Service (BaaS)**: **Supabase**. Maneja la autenticación segura (JWT), la base de datos (PostgreSQL), el almacenamiento de imágenes (Storage Buckets) y las notificaciones en tiempo real (WebSockets / Supabase Realtime).
* **Notificaciones Push**: Integración con la API REST de **Telegram** para entrega de fotografías y alertas.
* **Progressive Web App (PWA)**: Implementación de Service Worker (`sw.js`) y Manifest (`manifest.json`) que permite "Instalar" la página web como si fuera una aplicación nativa.

### 🤖 TUTORIAL DETALLADO: Cómo crear tu Bot de Telegram (API y Chat ID)

Para que VisionAlert AI pueda enviarte fotos a tu teléfono, necesitas crear tu propio Bot de Telegram. Es un proceso gratuito y toma menos de 2 minutos.

**Pasos para obtener tu `Telegram Bot Token`:**

1. Abre la aplicación de **Telegram** en tu teléfono o computadora.
2. En la barra de búsqueda superior, escribe **`@BotFather`** (asegúrate de que tenga el gancho azul de verificación oficial).
3. Inicia un chat con BotFather y presiona el botón "Iniciar" (o escribe `/start`).
4. Escribe el comando **`/newbot`** y envíalo.
5. BotFather te pedirá un **"Nombre"** para tu bot (ejemplo: *Seguridad Casa*).
6. Luego te pedirá un **"Username"** (Usuario). Este debe terminar obligatoriamente en la palabra "bot" (ejemplo: *VisionAlert_MiCasa_bot*).
7. ¡Felicidades! BotFather te responderá con un mensaje largo. En ese mensaje busca la frase "Use this token to access the HTTP API:".
8. Debajo verás una cadena larga de números y letras (ejemplo: `123456789:ABCdefGHIjklmNOPQrsTUVwxyZ`). **Ese es tu Telegram Token**. Cópialo y guárdalo.

**Pasos para obtener tu `Telegram Chat ID`:**

1. El Bot que acabas de crear no puede enviarte mensajes hasta que tú le hables primero (medida de seguridad de Telegram).
2. Busca a tu nuevo bot en Telegram (usando el Username que creaste en el paso 6) y envíale un mensaje cualquiera, por ejemplo: **"Hola Bot!"**.
3. Ahora, en el buscador de Telegram busca a otro bot llamado **`@userinfobot`**. Inicia el chat con él.
4. Regresa al chat de tu propio bot, selecciona ese mensaje de "Hola Bot!" que le enviaste, y **Reenvíalo** (Forward) al `@userinfobot`.
5. El `@userinfobot` te responderá inmediatamente con tus datos. Busca el número al lado de la palabra **`Id:`** (ejemplo: `987654321` o a veces números negativos si es un grupo `-987654321`). **Ese es tu Chat ID**.
6. Abre la aplicación de VisionAlert AI, ve a la pestaña **Config**, pega estos dos códigos en sus respectivos campos, y dale clic a Guardar. ¡Listo!

### Guía de Implementación del Sistema (Developer Setup)

#### 1. Configuración de Supabase (Backend)

1. Crea un proyecto gratuito en [Supabase](https://supabase.com/).
2. Copia la URL de tu proyecto y la clave **`anon` `public`** (`Settings > API`).
3. **Seguridad**: Renombra el archivo `config.js.example` a `config.js` y pega tus credenciales dentro de ese archivo. (El repositorio está protegido para no subir este archivo a GitHub).
4. Ve a la pestaña **SQL Editor** en Supabase, pega y ejecuta todo el contenido del archivo `schema.sql`. Esto creará automáticamente las tablas (`profiles`, `alerts`), la habilitación de Realtime en la tabla `alerts`, y las Políticas de Seguridad de Nivel de Fila (Row Level Security RLS) que protegen los datos de tus usuarios.
5. Ve a **Storage** y manualmente crea un nuevo "Bucket" que sea Público (Public) y que se llame exactamente `alerts-photos`.

#### 2. Despliegue en Producción

Debido a estrictas políticas de privacidad de los navegadores web (Chrome, Safari, Firefox), **es obligatorio que la página esté bajo HTTPS** para que el navegador le permita encender la cámara web.

* **Para desarrollo local**: Ejecuta un servidor local para probar en tu computadora: `python -m http.server 3000`. Luego navega a `http://localhost:3000`.
* **Hosting Gratuito Sugerido**: Arrastra esta carpeta a **Netlify Drop** o conéctalo con tu cuenta de GitHub, Vercel, o GitHub Pages.

---

## 🇬🇧 English Documentation

### Technical Project Description

VisionAlert AI functions as an "Intelligent & Autonomous" surveillance system executing **directly inside the web browser** of any camera-equipped device (mobile phones, tablets, laptops, or repurposed old PCs).

Unlike traditional CCTV logic that records 24/7—requiring massive hard drives or continuous high-bandwidth cloud uploads—VisionAlert AI **processes video locally** using your own device's GPU/CPU. It acts purely as a trigger system: only when a verified intrusion (person or car) occurs does the system take a snapshot and transmit data over the network.

When a breach is detected within the user-drawn "Area of Interest", the system autonomously:

1. Triggers localized visual (flashing red screen) and audio alarms.
2. Captures a video frame snapshot of the incident.
3. Uploads the image securely to a **Supabase Storage Cloud Bucket**.
4. Dispatches an **Edge Function** to ping the Telegram API, instantly delivering the photo and a status message to your mobile phone.
5. Inserts an event log into a live PostgreSQL database, triggering a WebSocket broadcast to instantaneously update the "Dashboard" of any other device you are logged into.

### Architecture & Tech Stack

* **Frontend**: Vanilla HTML5, CSS3, ES6 JavaScript Modules. Framework-less design chosen deliberately to minimize memory consumption on low-end recycled mobile hardware.
* **Artificial Intelligence**: `TensorFlow.js` powering the `COCO-SSD` (Common Objects in Context) pre-trained object detection neural network.
* **Backend (BaaS)**: **Supabase**. Governing JWT Authentication, PostgreSQL database schema, Image Storage Buckets, and Real-Time WebSocket subscription channels.
* **Push Notifications**: Third-party integration via the **Telegram REST API**.
* **Progressive Web App (PWA)**: Implemented Service Worker (`sw.js`) and Manifest (`manifest.json`) features to bypass traditional app stores and allow direct "Add to Home Screen" installations.

### 🤖 DETAILED TUTORIAL: Creating your Telegram Bot (API Token & Chat ID)

For VisionAlert AI to send photos directly to your phone, you must create a personal Telegram Bot. It is a free process that takes less than 2 minutes.

**How to acquire your `Telegram Bot Token`:**

1. Open the **Telegram** app on your phone or desktop.
2. In the global search bar, search for **`@BotFather`** (ensure it has the official blue verification checkmark).
3. Start a chat with BotFather and press "Start" (or send the command `/start`).
4. Type the command **`/newbot`** and send it.
5. BotFather will ask for a **"Name"** for your bot (e.g., *Warehouse Security*).
6. Next, it will ask for a **"Username"**. This username MUST end in the word "bot" (e.g., *VisionAlert_Warehouse_bot*).
7. Success! BotFather will reply with a long message. Look for the phrase: "Use this token to access the HTTP API:".
8. Below it, you will see a long alphanumeric string (e.g., `123456789:ABCdefGHIjklmNOPQrsTUVwxyZ`). **This is your Telegram Token**. Copy and save it safely.

**How to acquire your `Telegram Chat ID`:**

1. Telegram's anti-spam security prevents your new bot from messaging you until you speak to it first.
2. Search for your newly created bot in Telegram (using the Username from step 6) and send it any message, like **"Hello Bot!"**.
3. Now, in the Telegram search bar, look for another bot named **`@userinfobot`**. Start a chat with it.
4. Return to the chat with your own bot, select that "Hello Bot!" message you just sent, and **Forward it** to the `@userinfobot`.
5. The `@userinfobot` will instantly reply with your account data. Look for the number next to the word **`Id:`** (e.g., `987654321` or sometimes a negative number for groups `-987654321`). **This is your Chat ID**.
6. Open the VisionAlert AI application, navigate to the **Config** tab, paste these two codes into their respective input fields, and click Save.

### Implementation Guide (Developer Setup)

#### 1. Supabase Setup (Backend)

1. Create a free tier project on [Supabase](https://supabase.com/).
2. Copy your Project URL and the **`anon` `public`** key located in `Settings > API`.
3. **Security Check**: Rename the `config.js.example` file to `config.js` and paste your credentials inside. You must never commit `config.js` to a public GitHub repository (it is ignored by default in `.gitignore`).
4. Navigate to the **SQL Editor** tab in the Supabase dashboard. Paste and execute the entirety of the `schema.sql` file provided in this repository. This script handles the automatic creation of the `profiles` and `alerts` tables, enables the `supabase_realtime` publication, and sets up watertight Row Level Security (RLS) policies.
5. Go to the **Storage** tab and manually create a new bucket. It must be named exactly `alerts-photos` and you must toggle it to be a **Public** bucket.

#### 2. Production Deployment

Due to strict modern browser security protocols (Chrome, Safari, iOS), **webcam access is permanently blocked on HTTP connections**. The application **must** be served over HTTPS to function.

* **Local Development**: Run `python -m http.server 3000` to spin up localhost (which circumvents the HTTPS requirement solely for development).
* **Public Hosting**: Deploying the static files to **Netlify** (via Netlify Drop), **Vercel**, or **GitHub Pages** is the easiest way to secure an SSL (HTTPS) certificate for free in seconds.

---

## 📜 License & Liability / Licencia y Responsabilidad

### 🇪🇸 Español

Este proyecto se distribuye bajo la **Licencia MIT**. Eres libre de usar, modificar y distribuir este software, incluso para uso comercial. Sin embargo, **el creador (Rodrigo Hernandez) no se hace responsable** por el mal uso de la aplicación, fallos en la detección de seguridad, pérdida de datos, o cualquier daño derivado del uso de este software. Esta herramienta se proporciona "tal cual" (AS IS) con propósitos de portafolio y demostración técnica.

### 🇬🇧 English

This project is licensed under the **MIT License**. You are free to use, modify, and distribute this software, including for commercial use. However, **the creator (Rodrigo Hernandez) assumes no liability** for misuse of the application, security detection failures, data loss, or any damages arising from the use of this software. This tool is provided "AS IS" for portfolio and technical demonstration purposes.

---
**Developed by [Rodrigo Hernandez](https://rodrigo.us)**
