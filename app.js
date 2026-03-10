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
    drawing: false, drawStart: { x: 0, y: 0 }, alertsOffset: 0
};

// [EN] Global Exposure for navigation / [ES] Exposición Global para navegación
window.app = {
    navigate,
    openImageModal,
    closeImageModal,
    auth: {
        signOut: async () => {
            stopCamera();
            stopUsageTracking();
            await flushUsageTrackingToDB();
            // [EN] Sign out via Supabase. The `onAuthStateChange` SIGNED_OUT event will handle the page reload.
            // [ES] Cerrar sesión via Supabase. El evento SIGNED_OUT en `onAuthStateChange` manejará la recarga.
            try { await supabase.auth.signOut(); } catch (e) { console.warn(e); }
            localStorage.removeItem('visionAlertLastView');
            // [EN] Do NOT call window.location.replace here - let the onAuthStateChange handler do the reload.
            // [ES] NO llamar window.location.replace acá - dejar que el manejador de onAuthStateChange recargue.
        }
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
    // [EN] Camera Power Controls / [ES] Controles de Encendido de Cámara
    document.getElementById('btn-start-camera').addEventListener('click', startCamera);
    document.getElementById('btn-stop-camera').addEventListener('click', stopCamera);
    document.getElementById('btn-clear-zone').addEventListener('click', clearZone);
    document.getElementById('btn-request-notifications').addEventListener('click', requestNotifications);
    // [EN] Independent Display Settings Save (separate from Telegram form) / [ES] Guardado Independiente de Ajustes de Visualización
    document.getElementById('btn-save-animations')?.addEventListener('click', saveAnimations);

    // [EN] Pagination / [ES] Paginación
    document.getElementById('btn-load-more')?.addEventListener('click', () => {
        state.alertsOffset += 20;
        loadAlerts(true);
    });

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
        if (!state.user) {
            state.user = session.user;
            document.getElementById('main-nav').classList.remove('hidden');
            await loadProfile();
            const lastView = localStorage.getItem('visionAlertLastView') || 'dashboard';
            navigate(lastView === 'auth' ? 'dashboard' : lastView);
            initRealtime();
        }
    } else {
        state.user = null;
        state.profile = null;
        // [EN] Force a hard reload on sign out to cleanly kill camera, TFJS model, and WebSockets
        // [ES] Forzar recarga al cerrar sesión para limpiar la cámara, el modelo TFJS y los WebSockets
        if (event === 'SIGNED_OUT') {
            window.location.reload();
        } else {
            document.getElementById('main-nav').classList.add('hidden');
            navigate('auth');
        }
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

    // Checkbox for animations (defaults to true if undefined)
    const animCheckbox = document.getElementById('enable-animations');
    if (animCheckbox) animCheckbox.checked = state.profile.enable_animations ?? true;

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
        detect_persons: document.getElementById('detect-persons').checked,
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

// [EN] Save animated background preference independently / [ES] Guardar preferencia de fondo animado de forma independiente
async function saveAnimations() {
    const animCheckbox = document.getElementById('enable-animations');
    const status = document.getElementById('animations-status');
    if (!animCheckbox || !status) return;

    const enableAnim = animCheckbox.checked;
    status.textContent = 'Saving...';

    if (!state.user?.id) {
        status.textContent = 'Error: Not authenticated.';
        status.className = 'error-msg';
        return;
    }

    const { error } = await supabase.from('profiles').update({ enable_animations: enableAnim }).eq('id', state.user.id);
    if (error) {
        status.textContent = 'Error: ' + error.message;
        status.className = 'error-msg';
    } else {
        state.profile = { ...state.profile, enable_animations: enableAnim };
        // [EN] Apply animation change immediately / [ES] Aplicar el cambio de animación inmediatamente
        if (enableAnim) {
            initAnimatedBackground();
        } else {
            const bgContainer = document.getElementById('animated-bg');
            if (bgContainer) bgContainer.innerHTML = '';
        }
        status.textContent = 'Display settings saved!';
        status.className = 'success-msg';
        setTimeout(() => status.textContent = '', 3000);
    }
}

// [EN] UI LOGIC & VIEWS SWITCHING / [ES] LÓGICA DE INTERFAZ Y CAMBIO DE VISTAS
function navigate(viewId) {
    if (viewId !== 'auth') localStorage.setItem('visionAlertLastView', viewId);

    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');

    if (viewId === 'camera') {
        // startCamera(); // Removed as per instruction
        startUsageTracking();
    } else {
        stopCamera();
        stopUsageTracking();
        flushUsageTrackingToDB();
    }

    if (viewId === 'dashboard') {
        state.alertsOffset = 0; // Reset offset when entering dashboard
        loadAlerts();
        checkNotificationStatus();
    }
}

// [EN] MODAL LOGIC / [ES] LÓGICA DE MODAL
function openImageModal(src) {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('modal-image');
    if (!modal || !img) return;
    img.src = src;
    modal.classList.remove('hidden');
}

function closeImageModal(e) {
    if (e && e.target.id === 'modal-image') return; // Don't close when clicking the actual image
    const modal = document.getElementById('image-modal');
    if (modal) modal.classList.add('hidden');
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
    state.usageInterval = setInterval(() => {
        if (!state.profile) return;
        state.profile.total_usage_minutes++;
        state.profile.trip_usage_minutes++;
        updateOdometerUI();
        // Memory buffered. Will flush to DB implicitly when camera stops or user logs out.
    }, 60000); // 1 minute
}

function stopUsageTracking() {
    if (state.usageInterval) {
        clearInterval(state.usageInterval);
        state.usageInterval = null;
    }
}

async function flushUsageTrackingToDB() {
    if (!state.user || !state.profile) return;
    try {
        await supabase.from('profiles').update({
            total_usage_minutes: state.profile.total_usage_minutes,
            trip_usage_minutes: state.profile.trip_usage_minutes
        }).eq('id', state.user.id);
    } catch (e) { console.error('Error flushing odometer to DB', e); }
}

// [EN] BROWSER NOTIFICATIONS / [ES] NOTIFICACIONES DEL NAVEGADOR
function checkNotificationStatus() {
    const statusEl = document.getElementById('notification-status');
    const btnEl = document.getElementById('btn-request-notifications');
    if (!statusEl || !btnEl) return;

    if (!('Notification' in window)) {
        statusEl.textContent = 'Status: Not Supported by Browser';
        statusEl.className = 'error-msg';
        btnEl.style.display = 'none';
        return;
    }

    if (Notification.permission === 'granted') {
        statusEl.textContent = 'Status: Enabled ✅';
        statusEl.className = 'success-msg';
        btnEl.textContent = 'Test Notification';
        btnEl.style.display = 'inline-block';
    } else if (Notification.permission === 'denied') {
        statusEl.textContent = 'Status: Blocked (Fix in Browser Settings) ❌';
        statusEl.className = 'error-msg';
        btnEl.style.display = 'none';
    } else {
        statusEl.textContent = 'Status: Waiting for Permission ⚠️';
        statusEl.className = '';
        btnEl.textContent = 'Enable Notifications';
        btnEl.style.display = 'inline-block';
    }
}

async function requestNotifications() {
    if (!('Notification' in window)) return;

    const sendTestNotification = (title, message) => {
        if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, { body: message, icon: './logo192.png' });
            });
        } else {
            new Notification(title, { body: message, icon: './logo192.png' });
        }
    };

    if (Notification.permission === 'granted') {
        sendTestNotification('VisionAlert AI Test', 'Notifications are working correctly!');
        return;
    }

    const permission = await Notification.requestPermission();
    checkNotificationStatus();
    if (permission === 'granted') {
        sendTestNotification('VisionAlert AI', 'Notifications successfully enabled!');
    }
}

// [EN] ALERTS AND DASHBOARD LOGIC / [ES] LÓGICA DE ALERTAS Y DASHBOARD
async function loadAlerts(isAppend = false) {
    const tbody = document.getElementById('alerts-tbody');
    const loadBtn = document.getElementById('btn-load-more');
    if (!tbody) return;

    if (!isAppend) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading alerts...</td></tr>';
    } else {
        const tr = document.createElement('tr');
        tr.id = 'loading-row';
        tr.innerHTML = '<td colspan="4" style="text-align: center;">Loading more...</td>';
        tbody.appendChild(tr);
        if (loadBtn) loadBtn.disabled = true;
    }

    const { data, error } = await supabase.from('alerts').select('*')
        .order('created_at', { ascending: false })
        .range(state.alertsOffset, state.alertsOffset + 19);

    if (document.getElementById('loading-row')) document.getElementById('loading-row').remove();
    if (!isAppend) tbody.innerHTML = '';

    if (loadBtn) {
        loadBtn.disabled = false;
        loadBtn.style.display = (data && data.length === 20) ? 'block' : 'none';
        if (data && data.length < 20 && isAppend) {
            loadBtn.style.display = 'block';
            loadBtn.textContent = 'No more alerts';
            loadBtn.disabled = true;
        } else if (loadBtn.textContent === 'No more alerts') {
            loadBtn.textContent = 'Load More Alerts'; // Reset
        }
    }

    if (error || !data || (data.length === 0 && !isAppend)) {
        if (!isAppend) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No alerts yet.</td></tr>';
        return;
    }

    // Append older alerts to the bottom
    data.forEach(alert => appendAlertRow(alert, isAppend));
}

function appendAlertRow(alert, isAppend = false) {
    const tbody = document.getElementById('alerts-tbody');
    if (tbody.innerHTML.includes('No alerts yet')) tbody.innerHTML = '';

    const tr = document.createElement('tr');
    tr.dataset.id = alert.id;
    const date = new Date(alert.created_at).toLocaleString();

    tr.innerHTML = `
        <td>${date}</td>
        <td><strong>${alert.type.toUpperCase()}</strong></td>
        <td>${alert.quantity}</td>
        <td>
            ${alert.photo_url ? `<img src="${alert.photo_url}" alt="Alert photo" loading="lazy" class="alert-thumbnail" onclick="app.openImageModal(this.src)">` : '<span style="opacity: 0.5;">No Image</span>'}
        </td>
    `;

    // If it's the initial load (which reverses order) or a Realtime insert, we generally want it at the top.
    // However, for pagination, we are fetching history, so we APPEND to the bottom.
    if (isAppend) {
        tbody.appendChild(tr);
    } else {
        tbody.appendChild(tr); // In initial load, range(0,19) gives newest first. 
    }
}

// Separate function specifically for Realtime inserts (which always go to the top)
function prependAlertRow(alert) {
    const tbody = document.getElementById('alerts-tbody');
    if (tbody.innerHTML.includes('No alerts yet')) tbody.innerHTML = '';
    const tr = document.createElement('tr');
    tr.dataset.id = alert.id;
    tr.innerHTML = `<td>${new Date(alert.created_at).toLocaleString()}</td><td><strong>${alert.type.toUpperCase()}</strong></td><td>${alert.quantity}</td><td>${alert.photo_url ? `<img src="${alert.photo_url}" class="alert-thumbnail" onclick="app.openImageModal(this.src)">` : '<span style="opacity: 0.5;">No Image</span>'}</td>`;
    tbody.prepend(tr);
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
                const el = document.querySelector(`tr[data-id="${deletedAlert.id}"]`);
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
            prependAlertRow(payload.new);
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
        state.cameraStream = null;
    }
    document.getElementById('camera-video').srcObject = null;
    document.getElementById('ai-status').textContent = 'AI Status: Camera Stopped';
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
            // [EN] Default to true if profile is somehow missing the property
            const detectPersons = state.profile?.detect_persons !== false;
            const detectCars = state.profile?.detect_cars !== false;

            const isTarget = (p.class === 'person' && detectPersons) ||
                (p.class === 'car' && detectCars);
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

    // [EN] Visual Alarm Feedback / [ES] Retroalimentación Visual de Alarma
    document.body.classList.add('alarm-flash');
    setTimeout(() => document.body.classList.remove('alarm-flash'), 2000);

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
            .then(({ data, error }) => {
                if (error) {
                    console.error('Supabase Storage Error:', error);
                    throw error;
                }
                return supabase.storage.from('alerts-photos').getPublicUrl(fileName).data.publicUrl;
            })
            .then(publicUrl => supabase.from('alerts').insert({
                user_id: state.user.id,
                type: type,
                quantity: quantity,
                photo_url: publicUrl
            }));

        // C: Prepare Telegram Send (Edge Function primarily, direct fetch as fallback)
        let telegramPromise = Promise.resolve();
        if (state.profile.telegram_token && state.profile.telegram_chat_id) {
            const fd = new FormData();
            fd.append('chat_id', state.profile.telegram_chat_id);
            fd.append('token', state.profile.telegram_token);
            fd.append('caption', msg);
            fd.append('photo', blob, fileName);

            telegramPromise = supabase.functions.invoke('telegram-webhook', {
                body: fd,
            }).then(({ data, error }) => {
                if (error || !data?.success) throw new Error('Edge Function failed or not deployed.');
                return data;
            }).catch(e => {
                console.warn('Fallback to direct Telegram API due to Edge Function error:', e.message);
                const fallbackFd = new FormData();
                fallbackFd.append('chat_id', state.profile.telegram_chat_id);
                fallbackFd.append('photo', blob, fileName);
                fallbackFd.append('caption', msg);
                return fetch(`https://api.telegram.org/bot${state.profile.telegram_token}/sendPhoto`, {
                    method: 'POST',
                    body: fallbackFd
                });
            }).catch(err => console.error('Total Telegram failure:', err));
        }

        // D: Update Odometer Database
        state.profile.total_alerts += 1;
        state.profile.trip_alerts += 1;
        updateOdometerUI();
        const updateODPromise = supabase.from('profiles').update({
            total_alerts: state.profile.total_alerts,
            trip_alerts: state.profile.trip_alerts
        }).eq('id', state.user.id);

        // E: Browser Notification via Service Worker (More reliable for PWAs)
        if ('Notification' in window && Notification.permission === 'granted') {
            if (navigator.serviceWorker) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification('VisionAlert Detection', {
                        body: msg,
                        icon: './logo192.png'
                    });
                });
            } else {
                new Notification('VisionAlert Detection', {
                    body: msg,
                    icon: './logo192.png'
                });
            }
        }

        // Execute all promises simultaneously
        Promise.all([uploadAndInsertPromise, telegramPromise, updateODPromise])
            .catch(e => console.error('Trigger execution error:', e));

    }, 'image/jpeg', 0.7);
}

// [EN] ANIMATED BACKGROUND / [ES] FONDO ANIMADO
// [EN] Dynamically generates SVG shapes for a lightweight, textured animated background without heavy performance hits.
// [ES] Genera dinámicamente formas SVG para un fondo animado texturizado y ligero sin grandes impactos en el rendimiento.
function initAnimatedBackground() {
    const bgContainer = document.getElementById('animated-bg');
    if (!bgContainer) return;

    // Clear previous shapes if any
    bgContainer.innerHTML = '';

    // Check user preference
    if (state.profile && state.profile.enable_animations === false) {
        return; // Background stays blank/dark to save CPU/Battery
    }

    const shapes = ['line', 'square', 'rect', 'triangle', 'pentagon'];
    const colors = ['#00e5ff', '#00e676']; // [EN] Cyan and Green / [ES] Cian y Verde
    const numShapes = 40; // [EN] Dense enough for texture / [ES] Suficiente densidad para dar textura
    const svgNS = "http://www.w3.org/2000/svg";

    for (let i = 0; i < numShapes; i++) {
        // [EN] Randomize shape properties / [ES] Aleatorizar propiedades de forma
        const type = shapes[Math.floor(Math.random() * shapes.length)];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 8 + 6; // 6px to 14px (small texture)
        const duration = Math.random() * 40 + 30; // 30s to 70s
        const delay = Math.random() * -70; // [EN] Start at random progress / [ES] Iniciar en progreso aleatorio
        const leftPos = Math.random() * 100; // 0vw to 100vw

        const rootSvg = document.createElementNS(svgNS, "svg");
        rootSvg.setAttribute("class", "floating-shape");
        rootSvg.setAttribute("width", size * 2);
        rootSvg.setAttribute("height", size * 2);
        rootSvg.setAttribute("viewBox", `0 0 ${size * 2} ${size * 2}`); // [EN] Critical for relative scaling / [ES] Crítico para escalado relativo
        rootSvg.style.left = `${leftPos}vw`;
        rootSvg.style.animationDuration = `${duration}s`;
        rootSvg.style.animationDelay = `${delay}s`;

        let el;
        // [EN] Generate geometric paths based on type / [ES] Generar rutas geométricas según el tipo
        if (type === 'line') {
            el = document.createElementNS(svgNS, "line");
            el.setAttribute("x1", "1"); el.setAttribute("y1", "1");
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
            el.setAttribute("points", `${size},1 1,${size * 1.5} ${size * 2 - 1},${size * 1.5}`);
        } else if (type === 'pentagon') {
            el = document.createElementNS(svgNS, "polygon");
            const s = size * 1.2;
            el.setAttribute("points", `${s / 2},1 ${s - 1},${s * 0.38} ${s * 0.81},${s - 1} ${s * 0.19},${s - 1} 1,${s * 0.38}`);
            el.setAttribute("transform", `translate(${size * 0.4}, ${size * 0.4})`);
        }

        // [EN] Apply explicit stroke for visibility / [ES] Aplicar trazo explícito para visibilidad
        el.setAttribute("stroke", color);
        el.setAttribute("stroke-width", "2");
        el.setAttribute("fill", "none");

        rootSvg.appendChild(el);
        bgContainer.appendChild(rootSvg);
    }
}
