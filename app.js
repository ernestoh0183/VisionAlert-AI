// [EN] PWA Setup (Service Worker) / [ES] Configuración PWA (Service Worker)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// [EN] Config & State Setup / [ES] Configuración y Estado Global
import { SUPABASE_CONFIG } from './config.js';

// @ts-ignore
const supabase = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);

const state = {
    user: null, profile: null, model: null, cameraStream: null,
    isInferencing: false, lastTrigger: 0, cooldownMs: 30000,
    zone: null, videoDimensions: null, usageInterval: null,
    drawing: false, drawStart: { x: 0, y: 0 }
};

// [EN] Global Exposure for navigation / [ES] Exposición Global para navegación
window.app = {
    navigate,
    auth: {
        signOut: async () => { await supabase.auth.signOut(); }
    }
};

// [EN] Initialize Events on Load / [ES] Inicializar Eventos al Cargar
document.addEventListener('DOMContentLoaded', () => {
    initAnimatedBackground();

    // Clock
    setInterval(() => {
        const now = new Date();
        document.getElementById('clock-h').textContent = String(now.getHours()).padStart(2, '0');
        document.getElementById('clock-m').textContent = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('clock-s').textContent = String(now.getSeconds()).padStart(2, '0');
    }, 1000);

    // Glow Effect Pointer
    const updateMousePos = (e) => {
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        if (clientX !== undefined && clientY !== undefined) {
            document.documentElement.style.setProperty('--mouse-x', `${clientX}px`);
            document.documentElement.style.setProperty('--mouse-y', `${clientY}px`);
        }
    };
    document.addEventListener('mousemove', updateMousePos);
    document.addEventListener('touchmove', updateMousePos, { passive: true });

    // Button Binds
    document.getElementById('auth-form').addEventListener('submit', handleLogin);
    document.getElementById('btn-register').addEventListener('click', handleRegister);
    
    // Reset Password Binds
    document.getElementById('btn-show-reset').addEventListener('click', () => {
        document.getElementById('auth-form').parentElement.classList.add('hidden');
        document.getElementById('reset-box').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-reset').addEventListener('click', () => {
        document.getElementById('reset-box').classList.add('hidden');
        document.getElementById('auth-form').parentElement.classList.remove('hidden');
    });
    document.getElementById('reset-form').addEventListener('submit', handleResetPassword);

    document.getElementById('config-form').addEventListener('submit', saveConfig);
    document.getElementById('reset-trip').addEventListener('click', resetTrip);
    document.getElementById('btn-clear-history').addEventListener('click', clearHistory);
    document.getElementById('btn-clear-zone').addEventListener('click', clearZone);

    // Canvas Listeners
    const canvas = document.getElementById('camera-canvas');
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', doDraw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); doDraw(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend', endDraw);
});

// [EN] AUTH FLOW & SESSION / [ES] FLUJO DE AUTENTICACIÓN Y SESIÓN
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        state.user = session.user;
        document.getElementById('main-nav').classList.remove('hidden');
        await loadProfile();
        navigate('dashboard');
        initRealtime();
    } else {
        state.user = null;
        state.profile = null;
        document.getElementById('main-nav').classList.add('hidden');
        navigate('auth');
    }
});

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.textContent = 'Logging in...';

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) errEl.textContent = error.message;
    else errEl.textContent = '';
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.textContent = 'Registering...';

    try {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) errEl.textContent = error.message;
        else {
            errEl.textContent = '';
            document.getElementById('auth-message').textContent = 'Registration success! Please Check your email/log in.';
        }
    } catch (err) { errEl.textContent = err.message; }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const email = document.getElementById('reset-email').value;
    const errEl = document.getElementById('reset-error');
    const msgEl = document.getElementById('reset-message');
    
    errEl.textContent = '';
    msgEl.textContent = 'Sending...';

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });

    if (error) {
        msgEl.textContent = '';
        errEl.textContent = error.message;
    } else {
        errEl.textContent = '';
        msgEl.textContent = 'Password reset link sent! Check your inbox.';
    }
}

async function loadProfile() {
    let { data, error } = await supabase.from('profiles').select('*').eq('id', state.user.id).single();
    if (error || !data) {
        const { data: newData, error: iErr } = await supabase.from('profiles').insert({ id: state.user.id }).select().single();
        if (iErr) return console.error(iErr);
        data = newData;
    }
    state.profile = data || {};

    document.getElementById('telegram-token').value = state.profile.telegram_token || '';
    document.getElementById('telegram-chat-id').value = state.profile.telegram_chat_id || '';
    document.getElementById('detect-cars').checked = state.profile.detect_cars ?? true;
    document.getElementById('detect-persons').checked = state.profile.detect_persons ?? true;
    state.zone = state.profile.interest_zone || null;
    updateOdometerUI();
}

async function saveConfig(e) {
    e.preventDefault();
    const status = document.getElementById('config-status');
    status.textContent = 'Saving...';

    const updates = {
        telegram_token: document.getElementById('telegram-token').value,
        telegram_chat_id: document.getElementById('telegram-chat-id').value,
        detect_cars: document.getElementById('detect-cars').checked,
        detect_persons: document.getElementById('detect-persons').checked
    };

    if (!state.user?.id) {
        status.textContent = 'Error: User not authenticated.';
        status.className = 'error-msg';
        return;
    }

    const { data, error } = await supabase.from('profiles').update(updates).eq('id', state.user.id);
    if (error) {
        status.textContent = 'Error saving: ' + error.message;
        status.className = 'error-msg';
    } else {
        state.profile = { ...state.profile, ...updates };
        status.textContent = 'Configuration saved!';
        status.className = 'success-msg';
        setTimeout(() => status.textContent = '', 3000);
    }
}

// [EN] UI LOGIC & VIEWS SWITCHING / [ES] LÓGICA DE INTERFAZ Y CAMBIO DE VISTAS
function navigate(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');

    if (viewId === 'camera') {
        startCamera();
        startUsageTracking();
    } else {
        stopCamera();
        stopUsageTracking();
    }

    if (viewId === 'dashboard') loadAlerts();
}

// [EN] ODOMETER & USAGE TRACKING / [ES] ODÓMETRO Y SEGUIMIENTO DE USO
function updateOdometerUI() {
    document.getElementById('stat-total-usage').textContent = state.profile?.total_usage_minutes || 0;
    document.getElementById('stat-total-alerts').textContent = state.profile?.total_alerts || 0;
    document.getElementById('stat-trip-usage').textContent = state.profile?.trip_usage_minutes || 0;
    document.getElementById('stat-trip-alerts').textContent = state.profile?.trip_alerts || 0;
}

async function resetTrip() {
    if (!state.profile) return;
    state.profile.trip_usage_minutes = 0;
    state.profile.trip_alerts = 0;
    updateOdometerUI();
    await supabase.from('profiles').update({ trip_usage_minutes: 0, trip_alerts: 0 }).eq('id', state.user.id);
}

function startUsageTracking() {
    if (state.usageInterval) clearInterval(state.usageInterval);
    state.usageInterval = setInterval(async () => {
        if (!state.profile) return;
        state.profile.total_usage_minutes++;
        state.profile.trip_usage_minutes++;
        updateOdometerUI();
        await supabase.from('profiles').update({
            total_usage_minutes: state.profile.total_usage_minutes,
            trip_usage_minutes: state.profile.trip_usage_minutes
        }).eq('id', state.user.id);
    }, 60000); // 1 minute
}

function stopUsageTracking() {
    if (state.usageInterval) clearInterval(state.usageInterval);
}

// [EN] ALERTS AND DASHBOARD LOGIC / [ES] LÓGICA DE ALERTAS Y DASHBOARD
async function loadAlerts() {
    const grid = document.getElementById('alerts-grid');
    grid.innerHTML = '<p>Loading alerts...</p>';
    const { data, error } = await supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(20);
    grid.innerHTML = '';
    if (error || !data || data.length === 0) {
        grid.innerHTML = '<p>No alerts yet.</p>';
        return;
    }
    data.reverse().forEach(alert => prependAlertCard(alert));
}

function prependAlertCard(alert) {
    const grid = document.getElementById('alerts-grid');
    if (grid.innerHTML.includes('No alerts yet')) grid.innerHTML = '';

    const div = document.createElement('div');
    div.className = 'glass-card alert-card';
    div.dataset.id = alert.id;
    const date = new Date(alert.created_at).toLocaleString();

    div.innerHTML = `
        <h4>Alert: ${alert.type.toUpperCase()}</h4>
        <small>${date}</small>
        <p>Quantity: ${alert.quantity}</p>
        ${alert.photo_url ? `<img src="${alert.photo_url}" alt="Alert photo" loading="lazy">` : ''}
    `;
    grid.prepend(div);
}

async function clearHistory() {
    const hours = parseInt(document.getElementById('cleanup-timeframe').value, 10);
    const timeLimit = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    try {
        const { data, error } = await supabase.from('alerts')
            .delete()
            .lt('created_at', timeLimit)
            .select();

        if (error) throw error;

        if (data && data.length > 0) {
            data.forEach(deletedAlert => {
                const el = document.querySelector(`.alert-card[data-id="${deletedAlert.id}"]`);
                if (el) {
                    el.classList.add('fade-out');
                    setTimeout(() => el.remove(), 500); // Wait for transition
                }
            });
        }
    } catch (e) { console.error('Failed to clear history:', e); }
}

function initRealtime() {
    if (!('Notification' in window)) return;
    Notification.requestPermission();

    supabase.channel('public:alerts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts', filter: `user_id=eq.${state.user.id}` }, payload => {
            try {
                const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
                audio.play().catch(e => console.warn('Audio playback prevented by browser auto-play policy:', e));
            } catch (err) {
                console.error('Error attempting to play audio:', err);
            }

            if (Notification.permission === 'granted') {
                new Notification('VisionAlert: Detection!', { body: `Detected ${payload.new.quantity} ${payload.new.type}(s)` });
            }
            prependAlertCard(payload.new);
        }).subscribe();
}

// [EN] CAMERA & AI INFERENCE CORE / [ES] CÁMARA Y NÚCLEO DE INFERENCIA DE IA
async function startCamera() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    const aiStatus = document.getElementById('ai-status');

    if (!state.model) {
        aiStatus.textContent = 'AI Status: Loading Model (COCO-SSD)...';
        try {
            // @ts-ignore
            state.model = await window.cocoSsd.load();
        } catch (e) {
            aiStatus.textContent = 'AI Status: Failed to load TFJS Model.';
            return;
        }
    }

    try {
        // Rear camera preferred
        state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = state.cameraStream;

        video.onloadedmetadata = () => {
            state.videoDimensions = { width: video.videoWidth, height: video.videoHeight };
            canvas.width = state.videoDimensions.width;
            canvas.height = state.videoDimensions.height;
            drawZone();

            state.isInferencing = true;
            aiStatus.textContent = 'AI Status: Active & Monitoring';
            requestAnimationFrame(inferenceLoop);
        };
    } catch (err) {
        console.error(err);
        aiStatus.textContent = 'Camera Access Denied';
    }
}

function stopCamera() {
    state.isInferencing = false;
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(t => t.stop());
    }
}

// [EN] DRAWING INTEREST ZONE LOGIC / [ES] LÓGICA DE DIBUJO DE ZONA DE INTERÉS
function getCanvasCoords(e) {
    const canvas = document.getElementById('camera-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function startDraw(e) {
    if (!state.isInferencing) return;
    state.drawing = true;
    state.drawStart = getCanvasCoords(e);
    state.zone = { x: state.drawStart.x, y: state.drawStart.y, w: 0, h: 0 };
}

function doDraw(e) {
    if (!state.drawing) return;
    const coords = getCanvasCoords(e);
    state.zone.x = Math.min(state.drawStart.x, coords.x);
    state.zone.y = Math.min(state.drawStart.y, coords.y);
    state.zone.w = Math.abs(coords.x - state.drawStart.x);
    state.zone.h = Math.abs(coords.y - state.drawStart.y);
}

async function endDraw(e) {
    if (!state.drawing) return;
    state.drawing = false;
    if (state.zone.w > 20 && state.zone.h > 20) {
        state.profile.interest_zone = state.zone;
        await supabase.from('profiles').update({ interest_zone: state.zone }).eq('id', state.user.id);
    } else {
        state.zone = state.profile.interest_zone; // cancel negligible draw
    }
}

async function clearZone() {
    state.zone = null;
    state.profile.interest_zone = null;
    await supabase.from('profiles').update({ interest_zone: null }).eq('id', state.user.id);
}

function drawZone() {
    const canvas = document.getElementById('camera-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (state.zone) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
        ctx.strokeRect(state.zone.x, state.zone.y, state.zone.w, state.zone.h);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';
        ctx.fillRect(state.zone.x, state.zone.y, state.zone.w, state.zone.h);
    }
}

// [EN] CONTINUOUS INFERENCE LOOP / [ES] BUCLE CONTINUO DE INFERENCIA
async function inferenceLoop() {
    if (!state.isInferencing) return;

    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');

    if (video.readyState === 4 && state.model) {
        const predictions = await state.model.detect(video);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); // clear entire canvas

        drawZone();

        if (state.drawing && state.zone) {
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 4;
            ctx.strokeRect(state.zone.x, state.zone.y, state.zone.w, state.zone.h);
        }

        let validTargets = [];
        let pCount = 0;
        let cCount = 0;

        predictions.forEach(p => {
            const isTarget = (p.class === 'person' && state.profile.detect_persons) ||
                (p.class === 'car' && state.profile.detect_cars);
            if (!isTarget) return;

            const [x, y, w, h] = p.bbox;

            // Check intersection with interest zone
            if (state.zone) {
                const z = state.zone;
                const intersects = x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y;
                if (!intersects) return;
            }

            // Draw detected box
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#FF0000';
            ctx.font = '20px sans-serif';
            ctx.fillText(`${p.class} (${Math.round(p.score * 100)}%)`, x, y > 20 ? y - 5 : y + 20);

            validTargets.push(p);
            if (p.class === 'person') pCount++;
            if (p.class === 'car') cCount++;
        });

        if (validTargets.length > 0) {
            handleTrigger(pCount, cCount, video);
        }
    }

    requestAnimationFrame(inferenceLoop);
}

// [EN] INCIDENT REPORTING (Parallel Execution via Promise.all) / [ES] REPORTE DE INCIDENTES (Ejecución Paralela vía Promise.all)
function handleTrigger(persons, cars, video) {
    const now = Date.now();
    if (now - state.lastTrigger < state.cooldownMs) return;
    state.lastTrigger = now;

    // [EN] Image Optimization for Supabase (Max 800px width) / [ES] Optimización de Imagen para Supabase (Máximo 800px de ancho)
    const MAX_WIDTH = 800;
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > MAX_WIDTH) {
        const ratio = MAX_WIDTH / width;
        width = MAX_WIDTH;
        height = height * ratio;
    }

    // Capture off-screen and resize
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = width;
    captureCanvas.height = height;
    captureCanvas.getContext('2d').drawImage(video, 0, 0, width, height);

    captureCanvas.toBlob(blob => {
        const type = (persons > 0 && cars > 0) ? 'mixed' : (persons > 0 ? 'person' : 'car');
        const quantity = persons + cars;
        const msg = `Alert! VisionAlert detected: ${persons} person(s), ${cars} car(s).`;
        const fileName = `alert_${state.user.id}_${now}.jpg`;

        // A & B: Upload photo -> Then Insert to Alerts Database
        const uploadAndInsertPromise = supabase.storage.from('alerts-photos').upload(fileName, blob, { contentType: 'image/jpeg' })
            .then(() => supabase.storage.from('alerts-photos').getPublicUrl(fileName).data.publicUrl)
            .then(publicUrl => supabase.from('alerts').insert({
                user_id: state.user.id,
                type: type,
                quantity: quantity,
                photo_url: publicUrl
            }));

        // C: Prepare Telegram Send
        let telegramPromise = Promise.resolve();
        if (state.profile.telegram_token && state.profile.telegram_chat_id) {
            const fd = new FormData();
            fd.append('chat_id', state.profile.telegram_chat_id);
            fd.append('photo', blob, fileName);
            fd.append('caption', msg);
            telegramPromise = fetch(`https://api.telegram.org/bot${state.profile.telegram_token}/sendPhoto`, {
                method: 'POST',
                body: fd
            }).catch(e => console.error('Telegram error:', e));
        }

        // D: Update Odometer Database
        state.profile.total_alerts += 1;
        state.profile.trip_alerts += 1;
        updateOdometerUI();
        const updateODPromise = supabase.from('profiles').update({
            total_alerts: state.profile.total_alerts,
            trip_alerts: state.profile.trip_alerts
        }).eq('id', state.user.id);

        // Execute all promises simultaneously
        Promise.all([uploadAndInsertPromise, telegramPromise, updateODPromise])
            .catch(e => console.error('Trigger execution error:', e));

    }, 'image/jpeg', 0.7);
}

// [EN] ANIMATED BACKGROUND / [ES] FONDO ANIMADO
function initAnimatedBackground() {
    const bgContainer = document.getElementById('animated-bg');
    if (!bgContainer) return;

    const shapes = ['line', 'square', 'rect', 'triangle', 'pentagon'];
    const colors = ['#00e5ff', '#00e676']; // Cyan and Green
    const numShapes = 40; // Dense enough for texture
    const svgNS = "http://www.w3.org/2000/svg";

    for (let i = 0; i < numShapes; i++) {
        const type = shapes[Math.floor(Math.random() * shapes.length)];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 8 + 6; // 6px to 14px (small texture)
        const duration = Math.random() * 40 + 30; // 30s to 70s
        const delay = Math.random() * -70; // Start at random progress
        const leftPos = Math.random() * 100; // 0vw to 100vw

        const rootSvg = document.createElementNS(svgNS, "svg");
        rootSvg.setAttribute("class", "floating-shape");
        rootSvg.setAttribute("width", size * 2);
        rootSvg.setAttribute("height", size * 2);
        rootSvg.style.left = `${leftPos}vw`;
        rootSvg.style.animationDuration = `${duration}s`;
        rootSvg.style.animationDelay = `${delay}s`;
        rootSvg.style.stroke = color;

        let el;
        if (type === 'line') {
            el = document.createElementNS(svgNS, "line");
            el.setAttribute("x1", "0"); el.setAttribute("y1", "0");
            el.setAttribute("x2", size); el.setAttribute("y2", size);
        } else if (type === 'square') {
            el = document.createElementNS(svgNS, "rect");
            el.setAttribute("width", size); el.setAttribute("height", size);
            el.setAttribute("x", size / 2); el.setAttribute("y", size / 2);
        } else if (type === 'rect') {
            el = document.createElementNS(svgNS, "rect");
            el.setAttribute("width", size * 1.5); el.setAttribute("height", size * 0.8);
            el.setAttribute("x", size / 4); el.setAttribute("y", size / 2);
        } else if (type === 'triangle') {
            el = document.createElementNS(svgNS, "polygon");
            el.setAttribute("points", `${size},0 0,${size * 1.5} ${size * 2},${size * 1.5}`);
        } else if (type === 'pentagon') {
            el = document.createElementNS(svgNS, "polygon");
            const s = size * 1.2;
            el.setAttribute("points", `${s / 2},0 ${s},${s * 0.38} ${s * 0.81},${s} ${s * 0.19},${s} 0,${s * 0.38}`);
            el.setAttribute("transform", `translate(${size * 0.4}, ${size * 0.4})`);
        }

        rootSvg.appendChild(el);
        bgContainer.appendChild(rootSvg);
    }
}
