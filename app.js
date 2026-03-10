/**
 * @file app.js
 * @description Main application logic for VisionAlert AI. This file handles everything from
 *              Service Worker registration, global state management, authentication flows
 *              via Supabase, UI navigation, real-time database subscriptions, and the core
 *              machine learning inference loop using TensorFlow.js (COCO-SSD).
 * @author Rodrigo Hernandez
 */

// ============================================================================
// [EN] PWA Setup (Service Worker) / [ES] Configuración PWA (Service Worker)
// ============================================================================
/**
 * Registers the Service Worker to enable Progressive Web App (PWA) capabilities,
 * allowing the application to work offline and be installable on mobile devices.
 */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// ============================================================================
// [EN] Config & State Setup / [ES] Configuración y Estado Global
// ============================================================================
import { SUPABASE_CONFIG } from './config.js';

/**
 * Initializes the Supabase client using the configuration provided in config.js.
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
// @ts-ignore
const supabase = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);

/**
 * Global application state object. Holds runtime variables that need to be accessed
 * and modified across different functions.
 * @property {Object|null} user - The currently authenticated Supabase user object.
 * @property {Object|null} profile - User's profile data (settings, stats) from the 'profiles' table.
 * @property {Object|null} model - The loaded TensorFlow.js COCO-SSD machine learning model.
 * @property {MediaStream|null} cameraStream - The active MediaStream object from the webcam.
 * @property {boolean} isInferencing - Flag indicating if the AI detection loop is currently running.
 * @property {number} lastTrigger - Timestamp (ms) of the last triggered alert to manage cooldowns.
 * @property {number} cooldownMs - Minimum time (in ms) required between consecutive alerts (default: 30000ms / 30s).
 * @property {Object|null} zone - The coordinates {x, y, w, h} of the user-drawn Area of Interest zone.
 * @property {Object|null} videoDimensions - The original width and height of the camera stream.
 * @property {number|null} usageInterval - The ID of the setInterval timer tracking usage minutes.
 * @property {boolean} drawing - Flag indicating if the user is currently drawing on the canvas.
 * @property {Object} drawStart - The {x, y} coordinates where the current mouse/touch drag started.
 * @property {number} alertsOffset - The current pagination offset for loading historical alerts.
 */
const state = {
    user: null, profile: null, model: null, cameraStream: null,
    isInferencing: false, lastTrigger: 0, cooldownMs: 30000,
    zone: null, videoDimensions: null, usageInterval: null,
    drawing: false, drawStart: { x: 0, y: 0 }, alertsOffset: 0
};

// ============================================================================
// [EN] Global Exposure / [ES] Exposición Global 
// ============================================================================
/**
 * Exposes internal functions to the global `window` object so they can be triggered
 * directly from inline HTML `onclick` attributes. Since this file is loaded as an
 * ES Module (`type="module"`), variables are scoped to the file by default.
 */
window.app = {
    navigate,
    openImageModal,
    closeImageModal,
    auth: {
        /**
         * Safely signs the user out of the application.
         * 1. Stops the camera and usage tracking timers.
         * 2. Flushes final usage tracking data to the database asynchronously.
         * 3. Clears local state and LocalStorage preferences.
         * 4. Awaits the Supabase sign-out to guarantee the JWT token is wiped from LocalStorage.
         * 5. Forces a hard redirect to the home page to re-initialize the app cleanly.
         */
        signOut: async () => {
            stopCamera();
            stopUsageTracking();
            // [EN] Fire-and-forget flush: don't block logout on a DB write
            // [ES] Flush sin espera: no bloquear logout por una escritura a BD
            flushUsageTrackingToDB().catch(() => { });
            state.user = null;
            state.profile = null;
            localStorage.removeItem('visionAlertLastView');
            // [EN] MUST await signOut so the token is cleared from localStorage BEFORE we reload.
            // [EN] Without await: page reloads -> getSession() finds old token -> re-authenticates!
            // [ES] DEBE esperar signOut para que el token se borre de localStorage ANTES de recargar.
            // [ES] Sin await: página recarga -> getSession() encuentra viejo token -> re-autentica!
            try { await supabase.auth.signOut(); } catch (e) { console.warn('signOut error:', e); }
            window.location.replace(window.location.origin);
        }
    }
};

// ============================================================================
// [EN] Initialize Events on Load / [ES] Inicializar Eventos al Cargar
// ============================================================================
/**
 * Main initialization block. Fires when the HTML document is fully loaded and parsed.
 * Sets up all UI event listeners, timers, animations, and boots the session logic.
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize aesthetic background animations (if enabled)
    initAnimatedBackground();

    // 2. Setup the digital clock header
    setInterval(() => {
        const now = new Date();
        document.getElementById('clock-h').textContent = String(now.getHours()).padStart(2, '0');
        document.getElementById('clock-m').textContent = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('clock-s').textContent = String(now.getSeconds()).padStart(2, '0');
    }, 1000);

    // 3. Setup the mouse glow effect effect using CSS custom properties
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

    // 4. Bind Authentication Form Events
    document.getElementById('auth-form').addEventListener('submit', handleLogin);
    document.getElementById('btn-register').addEventListener('click', handleRegister);

    // 5. Bind Password Reset UI toggles and form submissions
    document.getElementById('btn-show-reset').addEventListener('click', () => {
        document.getElementById('auth-form').parentElement.classList.add('hidden');
        document.getElementById('reset-box').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-reset').addEventListener('click', () => {
        document.getElementById('reset-box').classList.add('hidden');
        document.getElementById('auth-form').parentElement.classList.remove('hidden');
    });
    document.getElementById('reset-form').addEventListener('submit', handleResetPassword);

    // 6. Bind Configuration/Dashboard Action Buttons
    document.getElementById('config-form').addEventListener('submit', saveConfig);
    document.getElementById('reset-trip').addEventListener('click', resetTrip);
    document.getElementById('btn-clear-history').addEventListener('click', clearHistory);
    document.getElementById('btn-start-camera').addEventListener('click', startCamera);
    document.getElementById('btn-stop-camera').addEventListener('click', stopCamera);
    document.getElementById('btn-clear-zone').addEventListener('click', clearZone);
    document.getElementById('btn-request-notifications').addEventListener('click', requestNotifications);
    document.getElementById('btn-save-animations')?.addEventListener('click', saveAnimations);

    // 7. Bind Pagination button for alerts table
    document.getElementById('btn-load-more')?.addEventListener('click', () => {
        state.alertsOffset += 20;
        loadAlerts(true);
    });

    // 8. Bind Canvas Listeners for drawing the Area of Interest (Zone)
    // Supports both mouse clicks (desktop) and touch events (mobile)
    const canvas = document.getElementById('camera-canvas');
    if (canvas) {
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', doDraw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e.touches[0]); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); doDraw(e.touches[0]); }, { passive: false });
        canvas.addEventListener('touchend', endDraw);
    }

    // 9. Kickstart the core Authentication Flow
    initSession();
});

// ============================================================================
// [EN] AUTHENTICATION & SESSION LOGIC / [ES] LÓGICA DE SESIÓN Y AUTENTICACIÓN
// ============================================================================

/**
 * Primary session initializer using getSession().
 * This approach is crucial because getSession() is a Promise that inherently WAITS
 * for Supabase to finish verifying the JWT token stored in LocalStorage.
 * Without this, querying the database immediately on page load might fail with a 401 
 * because the client's internal headers aren't ready yet.
 */
async function initSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        console.log('[Auth] getSession result:', session ? 'session found' : 'no session', error || '');

        if (session) {
            // User is already logged in (e.g., page reload)
            state.user = session.user;
            document.getElementById('main-nav')?.classList.remove('hidden');
            await loadProfile(); // Hydrate application state with user preferences
            const lastView = localStorage.getItem('visionAlertLastView') || 'dashboard';
            navigate(lastView === 'auth' ? 'dashboard' : lastView);
            initRealtime(); // Connect to WebSockets for live alerts
        } else {
            // No saved session found, force user to login screen
            document.getElementById('main-nav')?.classList.add('hidden');
            navigate('auth');
        }
    } catch (e) {
        console.error('[Auth] initSession failed:', e);
        navigate('auth');
    }

    // Establish a listener for FUTURE auth changes only.
    // We already handled the initial load state above. This handles manual logouts,
    // explicit sign-ins, and background token refreshes.
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[Auth] onAuthStateChange:', event);

        // A user successfully submitted the login/register form
        if (event === 'SIGNED_IN' && !state.user) {
            state.user = session.user;
            document.getElementById('main-nav')?.classList.remove('hidden');
            await loadProfile();
            navigate('dashboard');
            initRealtime();
        }

        // Another tab logged out, or this tab received a forced logout
        if (event === 'SIGNED_OUT') {
            state.user = null;
            state.profile = null;
            document.getElementById('main-nav')?.classList.add('hidden');
            navigate('auth');
        }
    });
}

/**
 * Handles the submission of the Login form.
 * @param {Event} e - The form submit event.
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    errEl.textContent = 'Logging in...';

    // Attempt to authenticate with Supabase using email/password provider
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) errEl.textContent = error.message;
    else errEl.textContent = ''; // Success is handled automatically by onAuthStateChange('SIGNED_IN')
}

/**
 * Handles the submission of the Registration button.
 * Uses the same email/password fields as login but triggers a signUp call.
 * @param {Event} e - The button click event.
 */
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
            // If email confirmations are enabled in Supabase, the user won't be signed in automatically
            document.getElementById('auth-message').textContent = 'Registration success! Please Check your email/log in.';
        }
    } catch (err) { errEl.textContent = err.message; }
}

/**
 * Handles the Forgot Password flow.
 * Sends a password reset email link to the provided address.
 * @param {Event} e - The form submit event.
 */
async function handleResetPassword(e) {
    e.preventDefault();
    const email = document.getElementById('reset-email').value;
    const errEl = document.getElementById('reset-error');
    const msgEl = document.getElementById('reset-message');

    errEl.textContent = '';
    msgEl.textContent = 'Sending...';

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin // Where user is sent after clicking the email link
    });

    if (error) {
        msgEl.textContent = '';
        errEl.textContent = error.message;
    } else {
        errEl.textContent = '';
        msgEl.textContent = 'Password reset link sent! Check your inbox.';
    }
}

// ============================================================================
// [EN] PROFILE & CONFIGURATION MANAGEMENT / [ES] GESTIÓN DE PERFIL Y CONFIG
// ============================================================================

/**
 * Loads the user's profile data from the `profiles` table.
 * If a profile doesn't exist for a newly registered user, it creates one automatically (upsert behavior).
 * It then populates the DOM inputs with the saved configuration.
 */
async function loadProfile() {
    if (!state.user) return;

    // Fetch user profile from DB
    let { data, error } = await supabase.from('profiles').select('*').eq('id', state.user.id).single();

    // Auto-create profile on first login
    if (error || !data) {
        const { data: newData, error: iErr } = await supabase.from('profiles').insert({ id: state.user.id }).select().single();
        if (iErr) return console.error(iErr);
        data = newData;
    }
    state.profile = data || {};

    // Hydrate all HTML form inputs
    document.getElementById('telegram-token').value = state.profile.telegram_token || '';
    document.getElementById('telegram-chat-id').value = state.profile.telegram_chat_id || '';
    document.getElementById('detect-cars').checked = state.profile.detect_cars ?? true;
    document.getElementById('detect-persons').checked = state.profile.detect_persons ?? true;

    // Checkbox for UI animations (defaults to true)
    const animCheckbox = document.getElementById('enable-animations');
    if (animCheckbox) animCheckbox.checked = state.profile.enable_animations ?? true;

    // Load saved Area of Interest zone shape if it exists
    state.zone = state.profile.interest_zone || null;

    // Refresh odometer counters
    updateOdometerUI();
}

/**
 * Saves the main Configuration form (Telegram creds & Detection toggles) to the database.
 * @param {Event} e - The form submit event.
 */
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
        // Sync local state profile memory with the database
        state.profile = { ...state.profile, ...updates };
        status.textContent = 'Configuration saved!';
        status.className = 'success-msg';
        setTimeout(() => status.textContent = '', 3000);
    }
}

/**
 * Saves the aesthetic animated background setting independently of the main config.
 * It writes to LocalStorage first (instant gratification) and then to the database if authenticated.
 */
async function saveAnimations() {
    const animCheckbox = document.getElementById('enable-animations');
    const status = document.getElementById('animations-status');
    if (!animCheckbox || !status) return;

    const enableAnim = animCheckbox.checked;

    // Save to localStorage always (works as a fallback even if DB write fails)
    localStorage.setItem('visionAlertAnimations', enableAnim ? 'true' : 'false');

    if (state.user?.id) {
        status.textContent = 'Saving...';
        const { error } = await supabase.from('profiles').update({ enable_animations: enableAnim }).eq('id', state.user.id);
        if (error) {
            status.textContent = 'Error: ' + error.message;
            status.className = 'error-msg';
        } else {
            if (state.profile) state.profile.enable_animations = enableAnim;
            status.textContent = 'Display settings saved!';
            status.className = 'success-msg';
            setTimeout(() => status.textContent = '', 3000);
        }
    }

    // Apply the visual change immediately without requiring a page reload
    if (enableAnim) {
        initAnimatedBackground();
    } else {
        const bgContainer = document.getElementById('animated-bg');
        if (bgContainer) bgContainer.innerHTML = '';
    }
}

// ============================================================================
// [EN] UI LOGIC & VIEWS SWITCHING / [ES] LÓGICA DE INTERFAZ Y CAMBIO DE VISTAS
// ============================================================================

/**
 * Central routing function. Hides all sections and reveals the requested active section.
 * @param {string} viewId - The ID identifier of the view to activate (e.g., 'dashboard', 'camera', 'config').
 */
function navigate(viewId) {
    // Remember the user's location so refreshing the page yields the same screen
    if (viewId !== 'auth') localStorage.setItem('visionAlertLastView', viewId);

    // Hide everything
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    // Show requested view
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.classList.remove('hidden');

    // Context-sensitive actions based on where the user navigated
    if (viewId === 'camera') {
        startUsageTracking(); // Odometer starts rolling when looking at camera
    } else {
        stopCamera(); // Turn off webcam if navigating away to save battery
        stopUsageTracking();
        flushUsageTrackingToDB().catch(() => { }); // Save odometer to DB
    }

    if (viewId === 'dashboard') {
        state.alertsOffset = 0; // Reset pagination
        loadAlerts(); // Fetch latest alerts
        checkNotificationStatus(); // Verify if they permitted browser notifications
    }
}

// ============================================================================
// [EN] MODAL LOGIC / [ES] LÓGICA DE MODAL
// ============================================================================

/**
 * Opens a full-screen overlay to display an alert's evidence photo.
 * @param {string} src - The URL of the image to display.
 */
function openImageModal(src) {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('modal-image');
    if (!modal || !img) return;
    img.src = src;
    modal.classList.remove('hidden');
}

/**
 * Closes the image overlay modal.
 * @param {Event} e - The click event. Only triggers close if clicking the background backdrop.
 */
function closeImageModal(e) {
    if (e && e.target.id === 'modal-image') return; // Do nothing if clicking the image itself
    const modal = document.getElementById('image-modal');
    if (modal) modal.classList.add('hidden');
}

// ============================================================================
// [EN] ODOMETER & USAGE TRACKING / [ES] ODÓMETRO Y SEGUIMIENTO DE USO
// ============================================================================

/**
 * Updates the visual DOM text elements representing the total and trip counters.
 */
function updateOdometerUI() {
    document.getElementById('stat-total-usage').textContent = state.profile?.total_usage_minutes || 0;
    document.getElementById('stat-total-alerts').textContent = state.profile?.total_alerts || 0;
    document.getElementById('stat-trip-usage').textContent = state.profile?.trip_usage_minutes || 0;
    document.getElementById('stat-trip-alerts').textContent = state.profile?.trip_alerts || 0;
}

/**
 * Zeros out the "Trip" counters in both local state and the database.
 */
async function resetTrip() {
    if (!state.profile || !state.user) return;
    state.profile.trip_usage_minutes = 0;
    state.profile.trip_alerts = 0;
    updateOdometerUI();
    await supabase.from('profiles').update({ trip_usage_minutes: 0, trip_alerts: 0 }).eq('id', state.user.id);
}

/**
 * Starts an interval timer that increments the usage minutes counter every 60 seconds (60000ms).
 */
function startUsageTracking() {
    if (state.usageInterval) clearInterval(state.usageInterval);
    state.usageInterval = setInterval(() => {
        if (!state.profile) return;
        state.profile.total_usage_minutes++;
        state.profile.trip_usage_minutes++;
        updateOdometerUI();
    }, 60000);
}

/**
 * Clears the active usage interval timer.
 */
function stopUsageTracking() {
    if (state.usageInterval) {
        clearInterval(state.usageInterval);
        state.usageInterval = null;
    }
}

/**
 * Saves the current value of the odometer back to the Supabase Database.
 */
async function flushUsageTrackingToDB() {
    if (!state.user || !state.profile) return;
    try {
        await supabase.from('profiles').update({
            total_usage_minutes: state.profile.total_usage_minutes,
            trip_usage_minutes: state.profile.trip_usage_minutes
        }).eq('id', state.user.id);
    } catch (e) { console.error('Error flushing odometer to DB', e); }
}

// ============================================================================
// [EN] BROWSER NOTIFICATIONS / [ES] NOTIFICACIONES DEL NAVEGADOR
// ============================================================================

/**
 * Checks if the browser supports notifications and what the current permission level is.
 * Updates the Dashboard UI string reflecting this status.
 */
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

/**
 * Requests permission from the user to show popup notifications.
 * If already granted, it acts as a button to send a test notification.
 */
async function requestNotifications() {
    if (!('Notification' in window)) return;

    const sendTestNotification = (title, message) => {
        // If Service Worker is active, route the notification through it so it works in background
        if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, { body: message, icon: './logo192.png' });
            });
        } else {
            // Fallback for non-supported SW environments
            new Notification(title, { body: message, icon: './logo192.png' });
        }
    };

    // If we're just clicking "Test Notification" because they already approved it
    if (Notification.permission === 'granted') {
        sendTestNotification('VisionAlert AI Test', 'Notifications are working correctly!');
        return;
    }

    // Native browser prompt popup
    const permission = await Notification.requestPermission();
    checkNotificationStatus();
    if (permission === 'granted') {
        sendTestNotification('VisionAlert AI', 'Notifications successfully enabled!');
    }
}

// ============================================================================
// [EN] ALERTS AND DASHBOARD LOGIC / [ES] LÓGICA DE ALERTAS Y DASHBOARD
// ============================================================================

/**
 * Fetches the user's past incident alerts from Supabase to render in the HTML table.
 * Supports pagination by fetching chunks of 20.
 * @param {boolean} isAppend - If true, appends 20 more rows. If false, wipes table and loads first 20.
 */
async function loadAlerts(isAppend = false) {
    const tbody = document.getElementById('alerts-tbody');
    const loadBtn = document.getElementById('btn-load-more');
    if (!tbody) return;

    // Show loading state
    if (!isAppend) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading alerts...</td></tr>';
    } else {
        const tr = document.createElement('tr');
        tr.id = 'loading-row';
        tr.innerHTML = '<td colspan="4" style="text-align: center;">Loading more...</td>';
        tbody.appendChild(tr);
        if (loadBtn) loadBtn.disabled = true;
    }

    try {
        // Fetch rows exclusively belonging to the signed-in user, ordered newest first
        const { data, error } = await supabase.from('alerts').select('*')
            .order('created_at', { ascending: false })
            .range(state.alertsOffset, state.alertsOffset + 19);

        if (document.getElementById('loading-row')) document.getElementById('loading-row').remove();
        if (!isAppend) tbody.innerHTML = '';

        // Manage the "Load More" pagination button visibility
        if (loadBtn) {
            loadBtn.disabled = false;
            loadBtn.style.display = (data && data.length === 20) ? 'block' : 'none';
            if (data && data.length < 20 && isAppend) {
                loadBtn.style.display = 'block';
                loadBtn.textContent = 'No more alerts';
                loadBtn.disabled = true;
            } else if (loadBtn.textContent === 'No more alerts') {
                loadBtn.textContent = 'Load More Alerts';
            }
        }

        // Handle empty datasets
        if (error || !data || (data.length === 0 && !isAppend)) {
            if (!isAppend) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No alerts yet.</td></tr>';
            if (error) console.error('Alerts fetch error:', error);
            return;
        }

        data.forEach(alert => appendAlertRow(alert));
    } catch (e) {
        console.error('loadAlerts exception:', e);
        if (!isAppend) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Error loading alerts.</td></tr>';
    }
}

/**
 * Helper function to inject an HTML Table Row `<tr>` block at the bottom of the table.
 * Used exclusively for historical pagination loading.
 * @param {Object} alert - Alert row object returned by Supabase.
 */
function appendAlertRow(alert) {
    const tbody = document.getElementById('alerts-tbody');
    // Clear initial empty state messaging if it exists
    if (tbody.innerHTML.includes('No alerts yet') || tbody.innerHTML.includes('Loading alerts')) tbody.innerHTML = '';

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
    tbody.appendChild(tr);
}

/**
 * Helper function to inject an HTML Table Row `<tr>` block at the TOP of the table.
 * Used exclusively by the WebSockets Realtime Listener for new incoming alerts.
 * @param {Object} alert - Live Alert row object pushed via WebSockets.
 */
function prependAlertRow(alert) {
    const tbody = document.getElementById('alerts-tbody');
    if (!tbody) return;
    if (tbody.innerHTML.includes('No alerts yet') || tbody.innerHTML.includes('Loading alerts')) tbody.innerHTML = '';

    const tr = document.createElement('tr');
    tr.dataset.id = alert.id;
    tr.innerHTML = `<td>${new Date(alert.created_at).toLocaleString()}</td><td><strong>${alert.type.toUpperCase()}</strong></td><td>${alert.quantity}</td><td>${alert.photo_url ? `<img src="${alert.photo_url}" class="alert-thumbnail" onclick="app.openImageModal(this.src)">` : '<span style="opacity: 0.5;">No Image</span>'}</td>`;
    tbody.prepend(tr); // Injects at index 0
}

/**
 * Empties historical alerts from the database older than X hours as defined by the user dropdown.
 * Also visually animates row removal from the DOM if they are visible.
 */
async function clearHistory() {
    const hours = parseInt(document.getElementById('cleanup-timeframe').value, 10);
    const timeLimit = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    try {
        const { data, error } = await supabase.from('alerts')
            .delete()
            .lt('created_at', timeLimit)
            .select(); // Ask Supabase to return the rows it deleted so we can remove them visually

        if (error) throw error;

        if (data && data.length > 0) {
            data.forEach(deletedAlert => {
                const el = document.querySelector(`tr[data-id="${deletedAlert.id}"]`);
                if (el) {
                    el.classList.add('fade-out'); // CSS animation hook
                    setTimeout(() => el.remove(), 500);
                }
            });
        }
    } catch (e) { console.error('Failed to clear history:', e); }
}

/**
 * Subscribes to Supabase Realtime (WebSockets channel).
 * Listens for any new rows INSERTED into the `alerts` table that belong to this user.
 * Allows the Dashboard to update instantaneously without a page refresh, and to trigger
 * device beeps even if the app is minimized.
 */
function initRealtime() {
    if (!state.user) return;

    supabase.channel('public:alerts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts', filter: `user_id=eq.${state.user.id}` }, payload => {
            // Trigger auditory beep
            try {
                const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
                audio.play().catch(e => console.warn('Audio playback prevented:', e));
            } catch (err) {
                console.error('Audio error:', err);
            }

            // Trigger system browser notification
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('VisionAlert: Detection!', { body: `Detected ${payload.new.quantity} ${payload.new.type}(s)` });
            }

            // Render the new row at the top of the table
            prependAlertRow(payload.new);
        }).subscribe();
}

// ============================================================================
// [EN] CAMERA & AI INFERENCE CORE / [ES] CÁMARA Y NÚCLEO DE INFERENCIA DE IA
// ============================================================================

/**
 * Initializes the AI Model and requests permission for Webcam access.
 * Start the continuous recursive video frame scanning algorithm.
 */
async function startCamera() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    const aiStatus = document.getElementById('ai-status');

    // 1. Download and compile the Machine Learning model if not already done
    if (!state.model) {
        aiStatus.textContent = 'AI Status: Loading Model (COCO-SSD)...';
        try {
            // @ts-ignore - Uses the globally imported `@tensorflow-models/coco-ssd` script
            state.model = await window.cocoSsd.load();
        } catch (e) {
            aiStatus.textContent = 'AI Status: Failed to load TFJS Model.';
            return;
        }
    }

    try {
        // 2. Request rear-camera (environment) if available (mobile-priority)
        state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = state.cameraStream;

        // 3. Wait for the camera to actually spin up and report its resolution
        video.onloadedmetadata = () => {
            state.videoDimensions = { width: video.videoWidth, height: video.videoHeight };
            canvas.width = state.videoDimensions.width;
            canvas.height = state.videoDimensions.height;

            // Draw any previously saved zone
            drawZone();

            // Ignite the engine
            state.isInferencing = true;
            aiStatus.textContent = 'AI Status: Active & Monitoring';
            requestAnimationFrame(inferenceLoop);
        };
    } catch (err) {
        console.error(err);
        aiStatus.textContent = 'Camera Access Denied';
    }
}

/**
 * Shuts down all hardware tracks and breaks the ML inference requestAnimationFrame loop.
 */
function stopCamera() {
    state.isInferencing = false; // Breaks recursive loop
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(t => t.stop()); // Explicitly release hardware control
        state.cameraStream = null;
    }
    const video = document.getElementById('camera-video');
    if (video) video.srcObject = null;
    const aiStatus = document.getElementById('ai-status');
    if (aiStatus) aiStatus.textContent = 'AI Status: Camera Stopped';
}

// ============================================================================
// [EN] DRAWING INTEREST ZONE LOGIC / [ES] LÓGICA DE DIBUJO DE ZONA DE INTERÉS
// ============================================================================

/**
 * Translates an exact pixel coordinate from the raw Web API event into a scaled coordinate
 * relative to the HTML `<canvas>` element's internal resolution space.
 * Essential because CSS resizes the canvas, making physical DOM pixels drift from drawing pixels.
 */
function getCanvasCoords(e) {
    const canvas = document.getElementById('camera-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

/**
 * Canvas Drag Event: Starts tracing a new box
 */
function startDraw(e) {
    if (!state.isInferencing) return;
    state.drawing = true;
    state.drawStart = getCanvasCoords(e);
    state.zone = { x: state.drawStart.x, y: state.drawStart.y, w: 0, h: 0 };
}

/**
 * Canvas Drag Event: Continues expanding/contracting the box shape while finger/mouse moves
 */
function doDraw(e) {
    if (!state.drawing) return;
    const coords = getCanvasCoords(e);

    // Calculates Top-Left coordinate properly regardless of which direction user dragged
    state.zone.x = Math.min(state.drawStart.x, coords.x);
    state.zone.y = Math.min(state.drawStart.y, coords.y);
    state.zone.w = Math.abs(coords.x - state.drawStart.x);
    state.zone.h = Math.abs(coords.y - state.drawStart.y);
}

/**
 * Canvas Drag Event: User releases finger/click. Box is locked in and saved to database.
 */
async function endDraw(e) {
    if (!state.drawing) return;
    state.drawing = false;

    // De-noise accidental micro-clicks by enforcing a minimum bounding box of 20x20px
    if (state.zone.w > 20 && state.zone.h > 20) {
        if (state.profile) state.profile.interest_zone = state.zone;
        if (state.user) await supabase.from('profiles').update({ interest_zone: state.zone }).eq('id', state.user.id);
    } else {
        // Discard invalid box and revert to previous saved state if they just rapidly clicked
        state.zone = state.profile?.interest_zone || null;
    }
}

/**
 * Explicit command to erase the custom zone completely. Bounding box becomes "Full Screen".
 */
async function clearZone() {
    state.zone = null;
    if (state.profile) state.profile.interest_zone = null;
    if (state.user) await supabase.from('profiles').update({ interest_zone: null }).eq('id', state.user.id);
}

/**
 * Rendering logic for painting the translucent blue box over the HTML canvas element.
 * Called constantly during the 30fps/60fps inference loop to persist the drawing over new video frames.
 */
function drawZone() {
    const canvas = document.getElementById('camera-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (state.zone) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]); // Make lines dashed for aesthetic
        ctx.strokeRect(state.zone.x, state.zone.y, state.zone.w, state.zone.h);
        ctx.setLineDash([]); // Reset to solid so AI bounding boxes don't inherit dashed state
        ctx.fillStyle = 'rgba(0, 229, 255, 0.2)'; // 20% opacity fill color overlay
        ctx.fillRect(state.zone.x, state.zone.y, state.zone.w, state.zone.h);
    }
}

// ============================================================================
// [EN] CONTINUOUS INFERENCE LOOP / [ES] BUCLE CONTINUO DE INFERENCIA
// ============================================================================

/**
 * The heartbeat function of the application. 
 * Fetches the current exact frame of the `<video>` element and passes it into the COCO-SSD Neural Network.
 * Parses the predictions, compares bounding box geometry against the drawn Area of Interest,
 * and if a match is found, forwards the event to the `handleTrigger` incident reporter.
 */
async function inferenceLoop() {
    if (!state.isInferencing) return; // Exit condition if camera is stopped

    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');

    if (video.readyState === 4 && state.model) {
        // 1. Pass the DOM element itself into TensorFlow
        const predictions = await state.model.detect(video);

        // 2. Wipe the previous frame's drawings from the canvas entirely
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 3. Re-draw the blue Area of Interest Box
        drawZone();

        // (Edge case to gracefully render the blue box AS it is being fluidly drawn by user)
        if (state.drawing && state.zone) {
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 4;
            ctx.strokeRect(state.zone.x, state.zone.y, state.zone.w, state.zone.h);
        }

        let validTargets = [];
        let pCount = 0;
        let cCount = 0;

        // 4. Evaluate each AI prediction
        predictions.forEach(p => {
            // Check user preferences in config
            const detectPersons = state.profile?.detect_persons !== false;
            const detectCars = state.profile?.detect_cars !== false;

            // Strict filter exactly to what user requested
            const isTarget = (p.class === 'person' && detectPersons) ||
                (p.class === 'car' && detectCars);
            if (!isTarget) return; // Ignore dogs, cats, bicycles...

            const [x, y, w, h] = p.bbox;

            // Mathematical check: Does the AI Bounding Box touch the User Interest Zone Box?
            if (state.zone) {
                const z = state.zone;
                // Collision geometry logic (AABB Collision)
                const intersects = x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y;
                if (!intersects) return; // Ignore AI detection because it's physically out-of-bounds
            }

            // At this point, the object is a VALID THREAT. Paint a red box over it.
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

        // 5. If we found at least 1 threat, fire the incident report flow
        if (validTargets.length > 0) {
            handleTrigger(pCount, cCount, video);
        }
    }

    // Recursion: Schedule this function to run again just before the browser paints the NEXT frame
    requestAnimationFrame(inferenceLoop);
}

// ============================================================================
// [EN] INCIDENT REPORTING / [ES] REPORTE DE INCIDENTES
// ============================================================================

/**
 * Dispatches an alert into the ecosystem when the AI detects a verified target.
 * Captures a snapshot of the frame, enforces cooldown rates, writes to the Database,
 * pushes an image to the Storage Bucket, and fires off Webhooks to Telegram.
 * 
 * @param {number} persons - Integer count of humans in the frame.
 * @param {number} cars - Integer count of cars in the frame.
 * @param {HTMLVideoElement} video - Reference to the DOM element to extract a JPEG from.
 */
function handleTrigger(persons, cars, video) {
    const now = Date.now();

    // Anti-Spam mechanism: Reject report if the last alert happened less than 30 seconds ago
    if (now - state.lastTrigger < state.cooldownMs) return;
    state.lastTrigger = now;

    // Provide instant local feedback to the user capturing the event -> flash screen red
    document.body.classList.add('alarm-flash');
    setTimeout(() => document.body.classList.remove('alarm-flash'), 2000);

    // Snapshot mechanism: To not overload data, cap Evidence JPEGs to a max-width of 800px
    const MAX_WIDTH = 800;
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > MAX_WIDTH) {
        const ratio = MAX_WIDTH / width;
        width = MAX_WIDTH;
        height = height * ratio;
    }

    // Hack: Paint the video frame to an invisible, detached canvas simply to run .toBlob()
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = width;
    captureCanvas.height = height;
    captureCanvas.getContext('2d').drawImage(video, 0, 0, width, height);

    // Convert pixels to compressed JPEG stream
    captureCanvas.toBlob(blob => {
        const type = (persons > 0 && cars > 0) ? 'mixed' : (persons > 0 ? 'person' : 'car');
        const quantity = persons + cars;
        const msg = `Alert! VisionAlert detected: ${persons} person(s), ${cars} car(s).`;
        const fileName = `alert_${state.user.id}_${now}.jpg`;

        // Parallel Task 1: Upload the evidence Blob to Supabase S3 bucket and insert Database Row
        const uploadAndInsertPromise = supabase.storage.from('alerts-photos').upload(fileName, blob, { contentType: 'image/jpeg' })
            .then(({ data, error }) => {
                if (error) { console.error('Storage Error:', error); throw error; }
                return supabase.storage.from('alerts-photos').getPublicUrl(fileName).data.publicUrl;
            })
            .then(publicUrl => supabase.from('alerts').insert({
                user_id: state.user.id, type, quantity, photo_url: publicUrl
            })); // NOTE: because of Realtime, this INSERT will automatically reflect on the Dashboard!

        // Parallel Task 2: Dispatch Telegram notification (If user configured it)
        let telegramPromise = Promise.resolve();
        if (state.profile?.telegram_token && state.profile?.telegram_chat_id) {
            const fd = new FormData();
            fd.append('chat_id', state.profile.telegram_chat_id);
            fd.append('token', state.profile.telegram_token);
            fd.append('caption', msg);
            fd.append('photo', blob, fileName);

            // Attempt highly-resilient Edge Function first (hides token exposure)
            telegramPromise = supabase.functions.invoke('telegram-webhook', { body: fd })
                .then(({ data, error }) => {
                    if (error || !data?.success) throw new Error('Edge Function failed.');
                    return data;
                }).catch(e => {
                    // Fallback to direct fetch to Telegram HTTP API if Edge Functions are disabled/offline
                    console.warn('Fallback to direct Telegram API:', e.message);
                    const fallbackFd = new FormData();
                    fallbackFd.append('chat_id', state.profile.telegram_chat_id);
                    fallbackFd.append('photo', blob, fileName);
                    fallbackFd.append('caption', msg);
                    return fetch(`https://api.telegram.org/bot${state.profile.telegram_token}/sendPhoto`, {
                        method: 'POST', body: fallbackFd
                    });
                }).catch(err => console.error('Total Telegram failure:', err));
        }

        // Parallel Task 3: Tick odometer counters up +1 and save state to Database
        state.profile.total_alerts += 1;
        state.profile.trip_alerts += 1;
        updateOdometerUI();
        const updateODPromise = supabase.from('profiles').update({
            total_alerts: state.profile.total_alerts,
            trip_alerts: state.profile.trip_alerts
        }).eq('id', state.user.id);

        // Parallel Task 4: Push a notification to the local device OS using Native API
        if ('Notification' in window && Notification.permission === 'granted') {
            if (navigator.serviceWorker) {
                // Backgroundable through PWA 
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification('VisionAlert Detection', { body: msg, icon: './logo192.png' });
                });
            } else {
                new Notification('VisionAlert Detection', { body: msg, icon: './logo192.png' });
            }
        }

        // Catch any failures in the 3 async networks calls without freezing the UI loop
        Promise.all([uploadAndInsertPromise, telegramPromise, updateODPromise])
            .catch(e => console.error('Trigger execution error:', e));

    }, 'image/jpeg', 0.7);
}

// ============================================================================
// [EN] ANIMATED BACKGROUND / [ES] FONDO ANIMADO
// ============================================================================

/**
 * Renders the "Cyber-Glass Matrix" aesthetic floating geometric shapes.
 * Generates 40 randomized SVG nodes that continuously drift upwards and rotate.
 * Heavy lifting is assigned to CSS Keyframes mapping for Hardware GPU Acceleration.
 */
function initAnimatedBackground() {
    const bgContainer = document.getElementById('animated-bg');
    if (!bgContainer) return;

    bgContainer.innerHTML = '';

    // Check performance preferences. Can be disabled via toggle in the Config Dashboard.
    const localPref = localStorage.getItem('visionAlertAnimations');
    if (localPref === 'false') return;
    if (state.profile && state.profile.enable_animations === false) return;

    const shapes = ['line', 'square', 'rect', 'triangle', 'pentagon'];
    const colors = ['#00e5ff', '#00e676']; // Cyber-Cyan vs Matrix-Green
    const numShapes = 40;
    const svgNS = "http://www.w3.org/2000/svg";

    // Random mathematical generation of floating entities
    for (let i = 0; i < numShapes; i++) {
        const type = shapes[Math.floor(Math.random() * shapes.length)];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 8 + 6;
        const duration = Math.random() * 40 + 30; // Extremely slow drifting (30-70 seconds)
        const delay = Math.random() * -70; // Pre-scatter them so they don't all start at bottom
        const leftPos = Math.random() * 100; // Scatter across horizontal X plane

        const rootSvg = document.createElementNS(svgNS, "svg");
        rootSvg.setAttribute("class", "floating-shape");
        rootSvg.setAttribute("width", size * 2);
        rootSvg.setAttribute("height", size * 2);
        rootSvg.setAttribute("viewBox", `0 0 ${size * 2} ${size * 2}`);
        rootSvg.style.left = `${leftPos}vw`;
        rootSvg.style.animationDuration = `${duration}s`;
        rootSvg.style.animationDelay = `${delay}s`; // Uses CSS '.floating-shape' keyframes 

        let el;
        // Generate SVG geometry points logically based on randomized shape 'type'
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

        // Apply shared stroke styles
        el.setAttribute("stroke", color);
        el.setAttribute("stroke-width", "2");
        el.setAttribute("fill", "none");

        rootSvg.appendChild(el);
        bgContainer.appendChild(rootSvg);
    }
}
