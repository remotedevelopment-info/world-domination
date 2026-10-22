// Kingdom Conquest - Game Client
const API_URL = window.location.origin + '/api';
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let kingdoms = [];
let myKingdom = null;
let selectedKingdomId = null;
let shownKingdomId = null; // kingdom id currently shown in the info popup
let ws = null;
let currentTick = 0;
let loggedOut = false;
let heartbeatTimer = null;
let authBusy = false;
let actionBusy = false;
let lastLoggedActionKey = null;

// Canvas setup
const canvas = document.getElementById('world-map');
const ctx = canvas.getContext('2d');
let canvasWidth, canvasHeight;

// Map projection data (simplified medieval Europe)
// Polygons generated with 25-75 sides per country
// Side count affects border width/color in renderMap()
const kingdomPolygons = {
       'ENG': [[0.35, 0.32], [0.42, 0.30], [0.40, 0.38], [0.33, 0.36]],
    'SCO': [[0.32, 0.22], [0.40, 0.20], [0.38, 0.28], [0.30, 0.30]],
    'FRA': [[0.38, 0.40], [0.50, 0.38], [0.52, 0.52], [0.40, 0.55], [0.36, 0.48]],
    'ESP': [[0.28, 0.55], [0.42, 0.55], [0.40, 0.68], [0.25, 0.65]],
    'POR': [[0.22, 0.55], [0.30, 0.55], [0.28, 0.68], [0.20, 0.65]],
    'HRE': [[0.50, 0.35], [0.65, 0.33], [0.68, 0.48], [0.55, 0.52], [0.48, 0.45]],
    'ITA': [[0.52, 0.52], [0.62, 0.50], [0.65, 0.62], [0.58, 0.68], [0.50, 0.60]],
    'NOR': [[0.45, 0.10], [0.55, 0.08], [0.52, 0.25], [0.42, 0.28]],
    'SWE': [[0.55, 0.12], [0.65, 0.10], [0.62, 0.28], [0.52, 0.30]],
    'POL': [[0.62, 0.28], [0.75, 0.26], [0.78, 0.40], [0.65, 0.42]],
    'BYZ': [[0.70, 0.50], [0.82, 0.48], [0.85, 0.60], [0.72, 0.62]],
    'RUS': [[0.75, 0.15], [0.95, 0.12], [0.98, 0.35], [0.78, 0.38]],
    'VEN': [[0.58, 0.52], [0.62, 0.52], [0.62, 0.55], [0.58, 0.55]],
    'PAP': [[0.55, 0.58], [0.62, 0.58], [0.60, 0.65], [0.54, 0.63]],
    'ARA': [[0.38, 0.62], [0.48, 0.60], [0.45, 0.72], [0.35, 0.70]],
    'CAS': [[0.48, 0.60], [0.58, 0.58], [0.55, 0.70], [0.45, 0.72]],
    'IRL': [[0.25, 0.30], [0.32, 0.28], [0.30, 0.38], [0.22, 0.36]]
};
function resizeCanvas() {
    const container = document.querySelector('.map-container');
    canvasWidth = container.clientWidth;
    canvasHeight = container.clientHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    renderMap();
}

function project(x, y) {
    return [x * canvasWidth, y * canvasHeight];
}

function renderMap() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw ocean background
    ctx.fillStyle = '#1a4d6e';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw each kingdom
    kingdoms.forEach(kingdom => {
        const poly = kingdomPolygons[kingdom.code];
        if (!poly) return;
        
        ctx.beginPath();
        const [startX, startY] = project(poly[0][0], poly[0][1]);
        ctx.moveTo(startX, startY);
        
        for (let i = 1; i < poly.length; i++) {
            const [x, y] = project(poly[i][0], poly[i][1]);
            ctx.lineTo(x, y);
        }
        ctx.closePath();
        
        // Fill with kingdom color
        ctx.fillStyle = kingdom.color;
        ctx.fill();
        
        // Calculate polygon side count
        const sideCount = kingdomPolygons[kingdom.code] ? kingdomPolygons[kingdom.code].length : 0;

        // Calculate border style weight based on side count
        // 25 sides = default (weight 1), 75 sides = bolder (weight 3+)
        const isIsland = kingdom.isIsland || false;
        let borderWeight = 1;
        if (isIsland) {
            borderWeight = 4; // Island countries get thicker gold borders
        } else if (sideCount > 50) {
            borderWeight = 3; // Large countries get bolder borders
        } else if (sideCount > 25) {
            borderWeight = 2; // Medium countries get medium borders
        } else {
            borderWeight = 1; // Small countries get default borders
        }

        // Get border color based on side count and island status
        let borderColor;
        if (isIsland) {
            borderColor = '#FFD700'; // Gold for islands
        } else if (kingdom.owner_id) {
            borderColor = '#fff'; // White for owned kingdoms
        } else {
            // Base color fades with more sides
            const alpha = Math.max(0.1, 0.3 - (sideCount - 25) / 100);
            borderColor = `rgba(255,255,255,${alpha})`;
        }

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWeight;
        ctx.stroke();
        
        // Draw kingdom code label
        const [labelX, labelY] = getCentroid(poly);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(kingdom.code, project(labelX, labelY)[0], project(labelX, labelY)[1]);
    });
}

function getCentroid(poly) {
    let x = 0, y = 0;
    poly.forEach(([px, py]) => { x += px; y += py; });
    return [x / poly.length, y / poly.length];
}

function getKingdomAtPosition(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / canvasWidth;
    const y = (clientY - rect.top) / canvasHeight;
    
    for (const kingdom of kingdoms) {
        const poly = kingdomPolygons[kingdom.code];
        if (!poly) continue;
        if (pointInPolygon(x, y, poly)) {
            return kingdom;
        }
    }
    return null;
}

function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// Auth functions
function setAuthMessage(text, type) {
    const el = document.getElementById('auth-message');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('error', 'success');
    if (text) el.classList.add(type === 'success' ? 'success' : 'error');
}

function clearAuthMessage() {
    setAuthMessage('');
}

// readErrorMessage prefers the backend's JSON error payload and falls back
// to plain-text bodies produced by http.Error.
async function readErrorMessage(res, fallback) {
    let body = '';
    try {
        body = (await res.text()).trim();
    } catch (_) {
        // body unreadable; fall through to the fallback message
    }
    if (body) {
        try {
            const data = JSON.parse(body);
            if (data && (data.error || data.message)) return data.error || data.message;
        } catch (_) {
            return body; // not JSON: plain-text error message
        }
    }
    return fallback;
}

function showRegister(e) {
    if (e) e.preventDefault();
    clearAuthMessage();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
}

function showLogin(e) {
    if (e) e.preventDefault();
    clearAuthMessage();
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
}

async function register() {
    if (authBusy) return;
    clearAuthMessage();

    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (!username || !email || !password) {
        setAuthMessage('Username, email, and password are required.');
        return;
    }

    const btn = document.querySelector('#register-form button');
    authBusy = true;
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Registration failed. Please try again.'));
        }

        // Success: reset the register form, switch to login with the username
        // prefilled, and show a visible confirmation on the auth screen.
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        showLogin();
        document.getElementById('login-username').value = username;
        document.getElementById('login-password').value = '';
        setAuthMessage('Registration successful! You can now log in.', 'success');
        document.getElementById('login-password').focus();
    } catch (err) {
        setAuthMessage(err.message || 'Registration failed. Please try again.');
    } finally {
        authBusy = false;
        if (btn) btn.disabled = false;
    }
}

async function login() {
    if (authBusy) return;
    clearAuthMessage();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        setAuthMessage('Username and password are required.');
        return;
    }

    const btn = document.querySelector('#login-form button');
    authBusy = true;
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Invalid username or password'));
        }

        const data = await res.json();
        token = data.token;
        currentUser = { id: data.user_id, username: data.username };

        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(currentUser));

        // Clear any stale message so it is gone when the auth screen is
        // shown again after logout, then drop the password from the DOM.
        clearAuthMessage();
        document.getElementById('login-password').value = '';
        showGameScreen();
    } catch (err) {
        setAuthMessage(err.message || 'Invalid username or password');
        document.getElementById('login-password').select();
    } finally {
        authBusy = false;
        if (btn) btn.disabled = false;
    }
}

function logout() {
    loggedOut = true;
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});

    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearAuthMessage();

    if (ws) {
        ws.onclose = null; // suppress auto-reconnect
        ws.close();
        ws = null;
    }
    
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('active');
    closeModal();
}

function showGameScreen() {
    closeModal();
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('player-name').textContent = currentUser.username;
    resizeCanvas();
    connectWebSocket();
    loadKingdoms();
    checkMyKingdom();
}

async function loadKingdoms() {
    try {
        const res = await fetch(`${API_URL}/countries?era=medieval`);
        kingdoms = await res.json();
        // Build border lookup map: country code -> set of border country codes
        kingdomBorders = {};
        kingdoms.forEach(k => {
            kingdomBorders[k.code] = new Set(k.borders?.borders || []);
            // Set sea-connected border flag for island countries
            k.sea_connected = k.is_island;
        });
        // England and Ireland border all sea-connected countries
        if (kingdomBorders['ENG']) {
            kingdomBorders['ENG'].add('FRA');
            kingdomBorders['ENG'].add('ESP');
            kingdomBorders['ENG'].add('POR');
            kingdomBorders['ENG'].add('HRE');
            kingdomBorders['ENG'].add('CAS');
            kingdomBorders['ENG'].add('VEN');
        }
        if (kingdomBorders['IRL']) {
            kingdomBorders['IRL'].add('FRA');
            kingdomBorders['IRL'].add('ESP');
            kingdomBorders['IRL'].add('POR');
            kingdomBorders['IRL'].add('HRE');
            kingdomBorders['IRL'].add('CAS');
            kingdomBorders['IRL'].add('VEN');
        }
        renderMap();
        renderKingdomList();
    } catch (err) {
        logMessage('Error loading kingdoms: ' + err.message);
    }
}

async function checkMyKingdom() {
    try {
        const res = await fetch(`${API_URL}/my-country`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.has_country) {
            myKingdom = data;
            document.getElementById('player-kingdom').textContent = data.country_name;
            document.getElementById('country-selection').classList.add('hidden');
            document.getElementById('my-kingdom').classList.remove('hidden');
            document.getElementById('my-kingdom-name').textContent = data.country_name;
            document.getElementById('my-kingdom-active').textContent = new Date(data.last_active).toLocaleString();
        } else {
            // No kingdom (or one we no longer hold): collapse back to the
            // claim panel so the UI never offers actions the server rejects.
            myKingdom = null;
            document.getElementById('player-kingdom').textContent = 'No Kingdom';
            document.getElementById('country-selection').classList.remove('hidden');
            document.getElementById('my-kingdom').classList.add('hidden');
            closeModal(); // dismiss any open action modal; actions are unavailable without a kingdom
        }
    } catch (err) {
        console.error('Error checking kingdom:', err);
    }
}

function renderKingdomList() {
    const list = document.getElementById('available-kingdoms');
    list.innerHTML = '';
    const available = kingdoms.filter(k => !k.owner_id);
    available.forEach(kingdom => {
        const div = document.createElement('div');
        div.className = 'kingdom-item';
        div.dataset.kingdomId = kingdom.id;
        div.innerHTML = `<div class="kingdom-color" style="background: ${kingdom.color}"></div><span>${kingdom.name}</span>`;
        div.onclick = () => selectKingdom(kingdom.id, div);
        list.appendChild(div);
    });
    // Re-apply the selection highlight if a broadcast-triggered re-render
    // wiped it while the player's choice is still pending.
    if (selectedKingdomId) {
        const selected = list.querySelector(`.kingdom-item[data-kingdom-id="${selectedKingdomId}"]`);
        if (selected) selected.classList.add('selected');
    }
}

function selectKingdom(id, listItem) {
    selectedKingdomId = id;
    document.querySelectorAll('.kingdom-item').forEach(el => el.classList.remove('selected'));
    if (listItem) listItem.classList.add('selected');
    document.getElementById('claim-btn').disabled = false;
}

async function claimKingdom() {
    if (!selectedKingdomId) {
        showToast('Select a kingdom first', 'error');
        return;
    }
    try {
        const res = await fetch(`${API_URL}/assign-country?country_id=${selectedKingdomId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Could not claim kingdom'));
        logMessage('Kingdom claimed successfully!');
        showToast('Kingdom claimed!', 'success');
        checkMyKingdom();
        loadKingdoms();
    } catch (err) {
        const msg = err.message || 'Could not claim kingdom';
        logMessage('Error claiming kingdom: ' + msg);
        showToast(msg, 'error');
    }
}

function connectWebSocket() {
    loggedOut = false;
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        document.getElementById('connection-status').classList.remove('disconnected');
        logMessage('Connected to game server');
        sendHeartbeat();
        if (!heartbeatTimer) heartbeatTimer = setInterval(sendHeartbeat, 30000);
    };
    ws.onclose = () => {
        document.getElementById('connection-status').classList.add('disconnected');
        if (loggedOut) return; // do not reconnect after logout
        logMessage('Disconnected from server');
        setTimeout(connectWebSocket, 5000);
    };
    ws.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return; // ignore malformed frames
        }
        // init envelope: {type: 'init', state: GameState}; broadcasts are raw GameState
        const state = msg && msg.type === 'init' ? msg.state : msg;
        if (!state || !Array.isArray(state.countries)) return;
        currentTick = state.tick || 0;
        const rulers = Array.isArray(state.players) ? state.players.length : 0;
        document.getElementById('tick-display').textContent = `Turn ${currentTick} · ${rulers} ruler${rulers === 1 ? '' : 's'}`;
        kingdoms = state.countries;
        renderMap();
        renderKingdomList();
        refreshMyKingdomStats();
        if (Array.isArray(state.actions) && state.actions.length) {
            // Only surface an action when it is genuinely new; every 90s tick
            // and every other player's action re-broadcasts the same list.
            const latest = state.actions[0];
            const actionKey = JSON.stringify(latest);
            if (actionKey !== lastLoggedActionKey) {
                lastLoggedActionKey = actionKey;
                logMessage(`${latest.action_type}: ${latest.description}`);
            }
        }
    };
}

// refreshMyKingdomStats syncs the sidebar numbers from the broadcast state.
function refreshMyKingdomStats() {
    if (!myKingdom || !myKingdom.country_id) return;
    const country = kingdoms.find(k => k.id === myKingdom.country_id);
    if (!country) return;
    const popEl = document.getElementById('my-kingdom-pop');
    const resEl = document.getElementById('my-kingdom-res');
    if (popEl) popEl.textContent = country.population.toLocaleString();
    if (resEl) resEl.textContent = country.resources.toLocaleString();
}

function sendHeartbeat() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        fetch(`${API_URL}/heartbeat`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
    }
}

function logMessage(msg) {
    const log = document.getElementById('log-entries');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.insertBefore(entry, log.firstChild);
    while (log.children.length > 50) log.removeChild(log.lastChild);
}

canvas.addEventListener('click', (e) => {
    const kingdom = getKingdomAtPosition(e.clientX, e.clientY);
    if (kingdom) {
        const info = document.getElementById('kingdom-info');
        document.getElementById('kingdom-name').textContent = kingdom.name;
        document.getElementById('kingdom-population').textContent = kingdom.population.toLocaleString();
        document.getElementById('kingdom-resources').textContent = kingdom.resources.toLocaleString();
        const ownerLabel = kingdom.owner_name
            ? 'Owner: ' + kingdom.owner_name
            : (kingdom.owner_id ? 'Owned' : 'Unclaimed');
        document.getElementById('kingdom-owner').textContent = ownerLabel;
        info.classList.remove('hidden');
        shownKingdomId = kingdom.id;
        // Selecting an unclaimed kingdom on the map arms the Claim button,
        // matching what clicking it in the sidebar list does.
        if (!kingdom.owner_id) {
            const listItem = document.querySelector(`.kingdom-item[data-kingdom-id="${kingdom.id}"]`);
            selectKingdom(kingdom.id, listItem);
        }
    }
});

const ACTION_SETS = {
    diplomacy: { title: 'Diplomacy Actions', options: ['Send Envoy', 'Propose Alliance', 'Declare War', 'Request Trade'] },
    economy: { title: 'Economic Actions', options: ['Collect Taxes', 'Build Market', 'Trade Resources', 'Invest in Infrastructure'] },
    military: { title: 'Military Actions', options: ['Recruit Troops', 'Move Army', 'Fortify Borders', 'Scout Enemy'] }
};

// showToast displays a transient notification above all overlays so action
// results are always visible regardless of modal state or sidebar scroll.
function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type === 'error' ? 'error' : 'success');
    toast.textContent = message;
    container.appendChild(toast);
    while (container.children.length > 3) container.firstChild.remove();
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 400);
    }, 3600);
}

function showAction(type) {
    // Actions require a server-confirmed kingdom; never open the modal for
    // an unconfirmed client state.
    if (!myKingdom) {
        showToast('Claim a kingdom first', 'error');
        return;
    }
    const modal = document.getElementById('action-modal');
    const title = document.getElementById('action-title');
    const options = document.getElementById('action-options');
    const feedback = document.getElementById('action-feedback');
    const action = ACTION_SETS[type];
    title.textContent = action.title;
    if (feedback) {
        feedback.textContent = '';
        feedback.classList.add('hidden');
    }
    options.innerHTML = action.options.map(opt =>
        `<button class="action-option" style="display:block;width:100%;text-align:left;margin:4px 0" ` +
        `onclick='performAction(${JSON.stringify(type)}, ${JSON.stringify(opt)})'>${opt}</button>`
    ).join('');
    modal.classList.remove('hidden');
}

// performAction sends a real-time action to the server; the engine then
// broadcasts the new world state to every connected client (including us).
// Failures keep the modal open and surface the server message inside it;
// successes close the modal and confirm with a toast.
async function performAction(type, description) {
    // Actions require a server-confirmed kingdom. Reject outright if the
    // client does not currently own one — actions on unowned territories
    // must be unavailable, not merely rejected by the server.
    if (!myKingdom) {
        showToast('You must own a kingdom to perform actions', 'error');
        closeModal();
        return;
    }
    const options = document.getElementById('action-options');
    const feedback = document.getElementById('action-feedback');
    if (actionBusy) return;
    actionBusy = true;
    const buttons = options.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; });
    try {
        const res = await fetch(`${API_URL}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action_type: type, description })
        });
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Action failed'));
        const data = await res.json();
        logMessage(`Action sent: ${description}`);
        applyActionResult(data);
        closeModal();
        showToast(`Action complete: ${description}`, 'success');
    } catch (err) {
        const msg = err.message || 'Action failed';
        logMessage(`Action failed: ${msg}`);
        if (msg.indexOf('no country assigned') !== -1) {
            // The server disagrees with our client state: resync so the UI
            // collapses back to the claim panel instead of staying wrong.
            checkMyKingdom();
        }
        if (feedback) {
            feedback.textContent = msg;
            feedback.classList.remove('hidden');
        }
    } finally {
        actionBusy = false;
        buttons.forEach(b => { b.disabled = false; });
    }
}

// applyActionResult merges the server's post-action kingdom snapshot into the
// live UI so resources/population/tick update immediately (AJAX-style)
// without a page refresh or waiting for the WebSocket broadcast.
function applyActionResult(data) {
    if (!data) return;
    if (typeof data.tick === 'number' && data.tick > 0) {
        currentTick = data.tick;
        const tickEl = document.getElementById('tick-display');
        const match = tickEl ? tickEl.textContent.match(/\d+ ruler/) : null;
        const rulerCount = match ? match[0].replace(/\D/g, '') : 0;
        if (tickEl) tickEl.textContent = `Turn ${data.tick} · ${rulerCount} ruler${rulerCount === 1 ? '' : 's'}`;
    }
    if (!data.country_id) return;
    const kingdom = kingdoms.find(k => k.id === data.country_id);
    if (kingdom) {
        if (typeof data.population === 'number') kingdom.population = data.population;
        if (typeof data.resources === 'number') kingdom.resources = data.resources;
        if (typeof data.country_name === 'string') kingdom.name = data.country_name;
    } else {
        kingdoms.push({
            id: data.country_id,
            name: data.country_name || 'Kingdom',
            population: typeof data.population === 'number' ? data.population : 0,
            resources: typeof data.resources === 'number' ? data.resources : 0
        });
    }
    if (myKingdom && myKingdom.country_id === data.country_id) {
        if (typeof data.population === 'number') myKingdom.population = data.population;
        if (typeof data.resources === 'number') myKingdom.resources = data.resources;
    }
    renderMap();
    renderKingdomList();
    refreshMyKingdomStats();
    // Keep the info popup honest if it is showing this kingdom.
    const info = document.getElementById('kingdom-info');
    if (info && !info.classList.contains('hidden') && shownKingdomId === data.country_id) {
        document.getElementById('kingdom-population').textContent = (typeof data.population === 'number' ? data.population : 0).toLocaleString();
        document.getElementById('kingdom-resources').textContent = (typeof data.resources === 'number' ? data.resources : 0).toLocaleString();
    }
}

function closeModal() {
    document.getElementById('action-modal').classList.add('hidden');
}

window.addEventListener('resize', resizeCanvas);
if (token && currentUser) showGameScreen();