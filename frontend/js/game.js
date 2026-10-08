// Kingdom Conquest - Game Client
const API_URL = window.location.origin + '/api';
const WS_URL = `ws://${window.location.host}/ws`;

let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let kingdoms = [];
let myKingdom = null;
let selectedKingdomId = null;
let ws = null;
let currentTick = 0;

// Canvas setup
const canvas = document.getElementById('world-map');
const ctx = canvas.getContext('2d');
let canvasWidth, canvasHeight;

// Map projection data (simplified medieval Europe)
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
    'CAS': [[0.30, 0.62], [0.42, 0.62], [0.40, 0.75], [0.28, 0.72]]
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
        
        // Draw border
        ctx.strokeStyle = kingdom.owner_id ? '#fff' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = kingdom.owner_id ? 3 : 1;
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
function showRegister() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
}

async function register() {
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    
    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        if (!res.ok) {
            throw new Error(await res.text());
        }
        
        showLogin();
        logMessage('Registration successful! Please login.');
    } catch (err) {
        document.getElementById('auth-error').textContent = err.message;
    }
}

async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (!res.ok) {
            throw new Error('Invalid username or password');
        }
        
        const data = await res.json();
        token = data.token;
        currentUser = { id: data.user_id, username: data.username };
        
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        showGameScreen();
    } catch (err) {
        document.getElementById('auth-error').textContent = err.message;
    }
}

function logout() {
    fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
    
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('game-screen').classList.remove('active');
}

function showGameScreen() {
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
        div.innerHTML = `<div class="kingdom-color" style="background: ${kingdom.color}"></div><span>${kingdom.name}</span>`;
        div.onclick = () => selectKingdom(kingdom.id);
        list.appendChild(div);
    });
}

function selectKingdom(id) {
    selectedKingdomId = id;
    document.querySelectorAll('.kingdom-item').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    document.getElementById('claim-btn').disabled = false;
}

async function claimKingdom() {
    if (!selectedKingdomId) return;
    try {
        const res = await fetch(`${API_URL}/assign-country?country_id=${selectedKingdomId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        logMessage('Kingdom claimed successfully!');
        checkMyKingdom();
        loadKingdoms();
    } catch (err) {
        logMessage('Error claiming kingdom: ' + err.message);
    }
}

function connectWebSocket() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        document.getElementById('connection-status').classList.remove('disconnected');
        logMessage('Connected to game server');
        sendHeartbeat();
    };
    ws.onclose = () => {
        document.getElementById('connection-status').classList.add('disconnected');
        logMessage('Disconnected from server');
        setTimeout(connectWebSocket, 5000);
    };
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.tick) {
            currentTick = data.tick;
            document.getElementById('tick-display').textContent = `Tick: ${currentTick}`;
        }
        if (data.countries) {
            kingdoms = data.countries;
            renderMap();
            renderKingdomList();
        }
    };
    setInterval(sendHeartbeat, 30000);
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
        document.getElementById('kingdom-owner').textContent = kingdom.owner_id ? 'Owned' : 'Unclaimed';
        info.classList.remove('hidden');
    }
});

function showAction(type) {
    const modal = document.getElementById('action-modal');
    const title = document.getElementById('action-title');
    const options = document.getElementById('action-options');
    const actions = {
        diplomacy: { title: 'Diplomacy Actions', options: ['Send Envoy', 'Propose Alliance', 'Declare War', 'Request Trade'] },
        economy: { title: 'Economic Actions', options: ['Collect Taxes', 'Build Market', 'Trade Resources', 'Invest in Infrastructure'] },
        military: { title: 'Military Actions', options: ['Recruit Troops', 'Move Army', 'Fortify Borders', 'Scout Enemy'] }
    };
    const action = actions[type];
    title.textContent = action.title;
    options.innerHTML = action.options.map(opt => `<div class="action-option">${opt} <span style="color:#aaa">(Coming Soon)</span></div>`).join('');
    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('action-modal').classList.add('hidden');
}

window.addEventListener('resize', resizeCanvas);
if (token && currentUser) showGameScreen();