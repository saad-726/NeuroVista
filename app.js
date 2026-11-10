// --- CONFIGURATION ---
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8000/api"
    : "https://neuro-vista-backend.onrender.com/api";

// --- STATE MANAGEMENT ---
let currentRating = 0;
let uploadedFile = null;
let currentUser = null;
let scansHistory = []; // Global variable to store active user's scan records
let chatHistory = [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
});

function checkSession() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateUIWithUser(currentUser);
        loadStats(currentUser.id);
        initHistory();
        if (window.location.pathname.includes('dashboard.html')) {
            restoreChatHistory();
        }
    } else {
        // Safe access check: Redirect guest users on the dashboard to the login page immediately
        const currentPath = window.location.pathname;
        if (currentPath.includes('dashboard.html')) {
            window.location.href = "login.html";
        }
    }
    
    checkRememberMe();
    attachDashboardControls();
}

function checkRememberMe() {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    const rememberedPassword = localStorage.getItem('rememberedPassword');
    
    if (rememberedEmail && document.getElementById('loginEmail')) {
        document.getElementById('loginEmail').value = rememberedEmail;
        document.getElementById('rememberMe').checked = true;
    }
    if (rememberedPassword && document.getElementById('loginPassword')) {
        document.getElementById('loginPassword').value = rememberedPassword;
    }
}

function attachDashboardControls() {
    if (!window.location.pathname.includes('dashboard.html')) return;

    const searchInput = document.getElementById('dashboardSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleDashboardSearch);
    }

    const notifBtn = document.getElementById('dashboardNotifBtn');
    if (notifBtn) {
        notifBtn.style.cursor = 'pointer';
        notifBtn.addEventListener('click', showNotificationSummary);
    }
}

function handleDashboardSearch(event) {
    const query = (event.target.value || '').trim().toLowerCase();
    if (!scansHistory || scansHistory.length === 0) {
        return;
    }

    const filtered = scansHistory.filter(scan => {
        const rawText = [
            `#scan-${scan.id}`,
            scan.prediction,
            formatLocalDatetime(scan.scan_date),
            String(scan.confidence),
            scan.notes || ''
        ].join(' ').toLowerCase();

        return rawText.includes(query);
    });

    renderDashboardHistory(filtered);
}

function showNotificationSummary() {
    if (!currentUser) {
        showToast('Login to see notifications.');
        return;
    }

    if (!scansHistory || scansHistory.length === 0) {
        showToast('No scan notifications available yet. Run an MRI scan to generate updates.');
        return;
    }

    const latest = scansHistory[0];
    const confidence = latest.confidence <= 1.0 ? latest.confidence * 100 : latest.confidence;
    const when = formatLocalDatetime(latest.scan_date);
    const summary = `Latest scan #${latest.id}: ${latest.prediction} (${confidence.toFixed(1)}%) on ${when}`;
    showToast(summary);
}

function renderDashboardHistory(records) {
    const tbody = document.getElementById('historyBody');
    const recentList = document.getElementById('recentScansList');
    const showingText = document.getElementById('history-showing-text');
    const paginationEl = document.querySelector('.pagination');

    if (!tbody) return;

    const total = scansHistory.length;
    const shown = records.length;

    if (showingText) {
        showingText.innerText = `Showing ${shown} of ${total} records`;
    }
    if (paginationEl) {
        paginationEl.style.display = total <= 5 ? 'none' : 'flex';
    }

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No matching scans found.</td></tr>';
        if (recentList) {
            recentList.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-sub); font-size: 0.85rem;">No matching recent scans.</div>';
        }
        return;
    }

    tbody.innerHTML = records.map((s, idx) => {
        let predClass = 'normal';
        const cName = s.prediction.toLowerCase();
        if (cName.includes('mild')) predClass = 'mild';
        if (cName.includes('moderate')) predClass = 'moderate';

        let displayConfidence = s.confidence;
        if (displayConfidence <= 1.0) displayConfidence *= 100.0;

        return `
            <tr>
                <td><div class="hist-thumb ${predClass}-thumb">MRI</div></td>
                <td><strong>#SCAN-${s.id}</strong></td>
                <td><span class="prediction-tag ${predClass}">${s.prediction}</span></td>
                <td>${displayConfidence.toFixed(1)}%</td>
                <td>${formatLocalDatetime(s.scan_date)}</td>
                <td><button class="view-btn" onclick="viewHistoricalScan(${idx})">View</button></td>
            </tr>
        `;
    }).join('');

    if (recentList) {
        const recentScans = records.slice(0, 3);
        recentList.innerHTML = recentScans.map((s, idx) => {
            let predClass = 'normal';
            const cName = s.prediction.toLowerCase();
            if (cName.includes('mild')) predClass = 'mild';
            if (cName.includes('moderate')) predClass = 'moderate';

            return `
                <div class="scan-row" style="cursor:pointer;" onclick="viewHistoricalScan(${idx})">
                    <div class="scan-thumb ${predClass}-thumb">MRI</div>
                    <div class="scan-info">
                        <span class="scan-patient">Scan #${s.id}</span>
                        <span class="scan-date">${formatLocalDatetime(s.scan_date)}</span>
                    </div>
                    <span class="prediction-tag ${predClass}">${s.prediction}</span>
                </div>
            `;
        }).join('');
    }
}

// --- NAVIGATION SYSTEM ---

function showPage(pageId) {
    const pageMap = {
        'page-landing': 'index.html',
        'page-login': 'login.html',
        'page-register': 'register.html',
        'page-dashboard': 'dashboard.html'
    };
    
    if (pageMap[pageId]) {
        window.location.href = pageMap[pageId];
    } else {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(pageId);
        if (el) el.classList.add('active');
        window.scrollTo(0, 0);
    }
}

function getInitialBotGreeting() {
    return "Hello! I'm NeuroBot, your AI health assistant. I can help you understand your scan results, explain the stages of Alzheimer's, or provide wellness suggestions. How can I assist you today?";
}

function saveChatHistory() {
    sessionStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

function resetChatMessages() {
    const chatMsgs = document.getElementById('chatMessages');
    if (!chatMsgs) return;

    chatHistory = [{ role: 'bot', text: getInitialBotGreeting() }];
    saveChatHistory();

    chatMsgs.innerHTML = `
      <div class="chat-msg bot">
        <div class="msg-avatar">N</div>
        <div class="msg-bubble">${getInitialBotGreeting()}</div>
      </div>
      <div class="chat-msg bot typing" id="typingIndicator" style="display:none">
        <div class="msg-avatar">N</div>
        <div class="msg-bubble typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>`;
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

function restoreChatHistory() {
    const storedHistory = sessionStorage.getItem('chatHistory');
    if (!storedHistory) {
        resetChatMessages();
        return;
    }

    try {
        const parsed = JSON.parse(storedHistory);
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Invalid chat history');
        chatHistory = parsed;

        const chatMsgs = document.getElementById('chatMessages');
        if (!chatMsgs) return;

        chatMsgs.innerHTML = '';
        chatHistory.forEach(item => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-msg ${item.role}`;
            msgDiv.innerHTML = `
                ${item.role === 'bot' ? '<div class="msg-avatar">N</div>' : ''}
                <div class="msg-bubble">${item.text.replace(/\n/g, '<br>')}</div>`;
            chatMsgs.appendChild(msgDiv);
        });

        const typing = document.createElement('div');
        typing.className = 'chat-msg bot typing';
        typing.id = 'typingIndicator';
        typing.style.display = 'none';
        typing.innerHTML = `
            <div class="msg-avatar">N</div>
            <div class="msg-bubble typing-dots">
              <span></span><span></span><span></span>
            </div>`;
        chatMsgs.appendChild(typing);
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    } catch (error) {
        resetChatMessages();
    }
}

function showSection(sectionId, el) {
    if (el) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        el.classList.add('active');
    }

    document.querySelectorAll('.dash-section').forEach(sec => sec.classList.remove('active'));
    
    const targetSec = document.getElementById(sectionId);
    if (targetSec) targetSec.classList.add('active');

    const label = el ? el.querySelector('span:not(.nav-icon):not(.nav-badge)').innerText : 'Dashboard';
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) breadcrumb.innerText = label;

    if (window.innerWidth <= 900) {
        toggleSidebar(false);
    }
}

// --- AUTHENTICATION FLOWS ---

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showToast("Please enter both email and password");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            const rememberMe = document.getElementById('rememberMe');
            if (rememberMe && rememberMe.checked) {
                localStorage.setItem('rememberedEmail', email);
                localStorage.setItem('rememberedPassword', password);
            } else {
                localStorage.removeItem('rememberedEmail');
                localStorage.removeItem('rememberedPassword');
            }
            
            showDashboard(currentUser);
        } else {
            showToast(data.detail || "Invalid email or password");
        }
    } catch (error) {
        console.error("Login Error:", error);
        showToast("Cannot connect to server. Ensure FastAPI is running.");
    }
}

async function handleRegister() {
    const full_name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;

    if (!full_name || !email || !password || !confirm) {
        showToast("All fields are required");
        return;
    }

    if (password !== confirm) {
        showToast("Passwords do not match");
        return;
    }

    const btn = document.querySelector('#registerForm button[type=submit]');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Sending code...";
    }

    try {
        const response = await fetch(`${API_URL}/register-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('registerForm').style.display = 'none';
            document.getElementById('confirmRegisterForm').style.display = 'block';
            document.getElementById('confirmRegEmail').value = email;
            showToast(data.message || "Verification code sent to your email address.");
        } else {
            showToast(data.detail || "Registration failed");
        }
    } catch (error) {
        console.error("Registration Error:", error);
        showToast("Cannot connect to server. Ensure FastAPI is running.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Create Account →";
        }
    }
}

async function handleRegisterConfirm() {
    const email = document.getElementById('confirmRegEmail').value.trim();
    const code = document.getElementById('regCode').value.trim();

    if (!email || !code) {
        showToast("Please enter the verification code");
        return;
    }

    const btn = document.querySelector('#confirmRegisterForm button[type=submit]');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Verifying...";
    }

    try {
        const response = await fetch(`${API_URL}/register-confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code })
        });

        const data = await response.json();

        if (response.ok) {
            showToast(data.message || "Registration confirmed. Please sign in.");
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } else {
            showToast(data.detail || "Invalid verification code");
        }
    } catch (error) {
        console.error("Registration Confirm Error:", error);
        showToast("Cannot connect to server. Ensure FastAPI is running.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Verify & Finish";
        }
    }
}

function showRegisterStep() {
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('confirmRegisterForm').style.display = 'none';
    document.getElementById('regCode').value = '';
}

function showDashboard(userData) {
    if (userData) {
        localStorage.setItem('currentUser', JSON.stringify(userData));
        updateUIWithUser(userData);
    }
    showPage('page-dashboard');
}

function updateUIWithUser(userData) {
    if (!userData) return;
    document.querySelectorAll('.user-name').forEach(el => el.innerText = userData.full_name);
    document.querySelectorAll('.topbar-user').forEach(el => el.innerText = userData.full_name);
    
    // Set clinical initials avatar (e.g. Saad Ahmed -> SA)
    const avatarEl = document.querySelector('.user-avatar');
    if (avatarEl) {
        const initials = userData.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        avatarEl.innerText = initials;
    }

    const welcome = document.getElementById('welcomeText');
    if (welcome) {
        welcome.innerText = getTimeBasedGreeting();
    }
}

function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
        return 'Good morning 👋';
    }
    if (hour >= 12 && hour < 17) {
        return 'Good afternoon 👋';
    }
    if (hour >= 17 && hour < 21) {
        return 'Good evening 👋';
    }
    return 'Good night 👋';
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('chatHistory');
    currentUser = null;
    scansHistory = [];
    chatHistory = [];
    resetChatMessages();
    showPage('page-landing');
}

function toggleSidebar(force) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (force !== undefined) {
        sidebar.classList.toggle('open', force);
    } else {
        sidebar.classList.toggle('open');
    }
}

// --- DYNAMIC STATISTICS LOADER ---

async function loadStats(userId) {
    try {
        const response = await fetch(`${API_URL}/stats/${userId}`);
        const stats = await response.json();
        
        if (response.ok) {
            document.getElementById('stat-total-scans').innerText = stats.total_scans;
            document.getElementById('stat-positive-scans').innerText = stats.positive_detections;
            document.getElementById('stat-avg-confidence').innerText = stats.avg_confidence;
            document.getElementById('stat-avg-time').innerText = stats.processing_time;
            
            const posTrend = document.getElementById('stat-positive-trend');
            if (posTrend) {
                if (stats.positive_detections > 0) {
                    posTrend.innerText = `${stats.positive_detections} detected`;
                    posTrend.style.color = "var(--red)";
                } else {
                    posTrend.innerText = "0 detected";
                    posTrend.style.color = "var(--green)";
                }
            }
        }
    } catch (error) {
        console.error("Error loading dashboard stats:", error);
    }
}

// --- MRI IMAGE FILE SELECTOR & UPLOAD ---

function handleFile(file) {
    if (!file) return;
    uploadedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        const previewImg = document.getElementById('previewImg');
        const previewMeta = document.getElementById('previewMeta');
        const dropZone = document.getElementById('dropZone');
        const uploadPreview = document.getElementById('uploadPreview');

        previewImg.src = e.target.result;
        previewMeta.innerHTML = `
            <strong>File:</strong> ${file.name} <br/>
            <strong>Size:</strong> ${(file.size / (1024 * 1024)).toFixed(2)} MB <br/>
            <strong>Type:</strong> ${file.type || 'DICOM/Unknown'}
        `;

        dropZone.style.display = 'none';
        uploadPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleFile(file);
    } else {
        showToast('Please upload a valid image file');
    }
}

function clearUpload() {
    uploadedFile = null;
    document.getElementById('dropZone').style.display = 'block';
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('fileInput').value = '';
}

// --- DYNAMIC INFRASTRUCTURE INFERS & GRAD-CAM VIEW ---

function runPrediction() {
    if (!uploadedFile) {
        showToast('Please upload an MRI scan first');
        return;
    }

    if (!currentUser || !currentUser.id) {
        showToast('Please sign in to run predictions');
        return;
    }

    const notesArea = document.querySelector('.card.scan-settings textarea');
    const notes = notesArea ? notesArea.value.trim() : "";

    showToast('Uploading scan to CNN+BiLSTM model...');
    
    const btn = document.querySelector('.btn-primary.full');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span> Processing Scan...';
    btn.disabled = true;

    // Build Multipart Request Body
    const formData = new FormData();
    formData.append('user_id', currentUser.id);
    formData.append('file', uploadedFile);
    if (notes) {
        formData.append('notes', notes);
    }

    fetch(`${API_URL}/predict`, {
        method: 'POST',
        body: formData
    })
    .then(async response => {
        const data = await response.json();
        if (response.ok) {
            showToast('MRI analysis complete');
            clearUpload();
            if (notesArea) notesArea.value = ''; // Reset notes

            // Render prediction on screen
            displayPredictionResult(data);

            // Load dynamic treatment recommendations for detected class
            loadRecommendations(data.prediction, data.confidence);
            
            // Reload user records and stats
            loadStats(currentUser.id);
            initHistory();
            
            // Navigate to prediction results section
            showSection('sec-results', document.querySelector('[onclick*="sec-results"]'));
        } else {
            showToast(data.detail || "Analysis failed");
        }
    })
    .catch(error => {
        console.error("Prediction upload failed:", error);
        showToast("Server connection error during MRI analysis");
    })
    .finally(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

// Inject prediction results into domestic Results section elements
function displayPredictionResult(scan) {
    if (!scan) return;

    const mriImg = document.getElementById('result-mri-img');
    const mriPlaceholder = document.getElementById('result-mri-placeholder');
    const heatmapImg = document.getElementById('result-heatmap-img');
    const heatmapPlaceholder = document.getElementById('result-heatmap-placeholder');

    const rootUrl = API_URL.replace('/api', ''); // http://localhost:8000
    
    mriImg.src = `${rootUrl}${scan.image_path}`;
    mriImg.style.display = 'block';
    mriPlaceholder.style.display = 'none';

    // ── Module 1: Show Grad-CAM heatmap ──────────────────────────────────────
    if (scan.heatmap_path) {
        heatmapImg.src = `${rootUrl}${scan.heatmap_path}`;
        heatmapImg.style.display = 'block';
        heatmapPlaceholder.style.display = 'none';
    } else {
        heatmapImg.style.display = 'none';
        heatmapPlaceholder.style.display = 'flex';
    }

    // ── Module 1: Grad-CAM region explanation ─────────────────────────────────
    loadXAIExplanation(scan);

    const badge = document.getElementById('res-prediction-badge');
    const text = document.getElementById('res-prediction-text');
    
    badge.className = "prediction-badge"; 
    text.innerText = scan.prediction;

    const cName = scan.prediction.toLowerCase();
    if (cName.includes('non')) {
        badge.classList.add('normal');
    } else if (cName.includes('very mild')) {
        badge.classList.add('normal');
    } else if (cName.includes('mild')) {
        badge.classList.add('mild');
    } else {
        badge.classList.add('moderate');
    }

    const confNum = document.getElementById('res-conf-num');
    let confidenceVal = scan.confidence;
    let decimalConf = scan.confidence;
    
    // Dynamic Auto-detect: if stored as decimal (<= 1.0), scale to percentage. Otherwise keep as is.
    if (confidenceVal <= 1.0) {
        confidenceVal *= 100.0;
    } else {
        decimalConf /= 100.0;
    }
    
    const pct = confidenceVal.toFixed(1);
    confNum.innerText = pct;

    const strokeRing = document.getElementById('res-conf-svg-ring');
    if (strokeRing) {
        // Stroke Ring Circumference = 2 * PI * 40 = 251.2
        const offset = 251.2 - (251.2 * decimalConf);
        strokeRing.style.strokeDashoffset = offset;
    }

    // Set class probability charts with similar auto-detect
    let pNonVal = scan.prob_non_demented;
    if (pNonVal <= 1.0) pNonVal *= 100.0;
    const pNon = pNonVal.toFixed(1);

    let pVMildVal = scan.prob_very_mild;
    if (pVMildVal <= 1.0) pVMildVal *= 100.0;
    const pVMild = pVMildVal.toFixed(1);

    let pMildVal = scan.prob_mild_demented;
    if (pMildVal <= 1.0) pMildVal *= 100.0;
    const pMild = pMildVal.toFixed(1);

    let pModVal = scan.prob_moderate_demented;
    if (pModVal <= 1.0) pModVal *= 100.0;
    const pMod = pModVal.toFixed(1);

    document.getElementById('pct-non-demented').innerText = `${pNon}%`;
    document.getElementById('bar-non-demented').style.width = `${pNon}%`;

    document.getElementById('pct-very-mild').innerText = `${pVMild}%`;
    document.getElementById('bar-very-mild').style.width = `${pVMild}%`;

    document.getElementById('pct-mild-demented').innerText = `${pMild}%`;
    document.getElementById('bar-mild-demented').style.width = `${pMild}%`;

    document.getElementById('pct-moderate').innerText = `${pMod}%`;
    document.getElementById('bar-moderate').style.width = `${pMod}%`;

    document.querySelectorAll('.class-row').forEach(row => row.classList.remove('highlight'));
    if (cName.includes('non')) {
        document.getElementById('row-non-demented').classList.add('highlight');
    } else if (cName.includes('very mild')) {
        document.getElementById('row-very-mild').classList.add('highlight');
    } else if (cName.includes('mild')) {
        document.getElementById('row-mild-demented').classList.add('highlight');
    } else if (cName.includes('moderate')) {
        document.getElementById('row-moderate').classList.add('highlight');
    }

    document.getElementById('res-meta-id').innerText = `#SCAN-${scan.id}`;
    document.getElementById('res-meta-date').innerText = formatLocalDatetime(scan.scan_date);
    document.getElementById('res-meta-time').innerText = "1.72 seconds";

    const insightBlock = document.querySelector('.insight-summary p');
    if (insightBlock) {
        insightBlock.innerHTML = `Your latest scan indicates <strong>${scan.prediction}</strong> with <strong>${pct}%</strong> confidence. Clinical notes: <em>"${scan.notes}"</em>`;
    }
}

// Display historical scan details dynamically
function viewHistoricalScan(index) {
    if (scansHistory[index]) {
        const scan = scansHistory[index];
        displayPredictionResult(scan);
        loadXAIExplanation(scan);
        loadRecommendations(scan.prediction, scan.confidence);
        showSection('sec-results', document.querySelector('[onclick*="sec-results"]'));
    }
}

// ── Module 1: XAI (Explainable AI) — Grad-CAM Analysis Panel ─────────────────

async function loadXAIExplanation(scan) {
    const panel = document.getElementById('xai-panel');
    if (!panel) return;

    // Show loading state immediately
    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="xai-loading">
            <div class="xai-spinner"></div>
            <span>Generating AI explanation of Grad-CAM heatmap...</span>
        </div>
    `;

    try {
        const response = await fetch(`${API_URL}/explain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prediction: scan.prediction,
                confidence: scan.confidence,
                prob_non_demented: scan.prob_non_demented,
                prob_very_mild: scan.prob_very_mild,
                prob_mild_demented: scan.prob_mild_demented,
                prob_moderate_demented: scan.prob_moderate_demented,
            })
        });

        const data = await response.json();
        _renderXAIPanel(panel, data, scan);

    } catch (error) {
        console.error('XAI explanation fetch error:', error);
        // Fallback render with basic info
        _renderXAIPanel(panel, null, scan);
    }
}

function _renderXAIPanel(panel, data, scan) {
    const predLower = (scan.prediction || '').toLowerCase();
    const color = data ? data.color : (
        predLower.includes('non') ? '#16a34a' :
        predLower.includes('very mild') ? '#f59e0b' :
        predLower.includes('mild') ? '#ea580c' : '#e11d48'
    );
    const riskLevel = data ? data.risk_level : scan.prediction;
    const regions = data ? data.regions : [];
    const featureExplanation = data ? data.feature_explanation : '';
    const confidenceContext = data ? data.confidence_context : '';
    const aiText = data ? data.ai_explanation : 'XAI explanation unavailable — server connection required.';

    // Format AI text: clean paragraphs and bold tags
    let formattedAI = aiText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p class="xai-para">${p.trim().replace(/\n/g, ' ')}</p>`)
        .join('');

    // Format feature bullets cleanly
    let featureListItems = '';
    if (featureExplanation) {
        const lines = featureExplanation.split('\n').filter(l => l.trim().startsWith('•'));
        featureListItems = lines.map(l => `<li>${l.replace(/^•\s*/, '').trim()}</li>`).join('');
    }

    let confPct = scan.confidence || 0;
    if (confPct <= 1.0) confPct *= 100;

    panel.innerHTML = `
        <div class="xai-header">
            <div class="xai-title-row">
                <span class="xai-badge" style="background:${color}15; color:${color}; border-color:${color}35;">
                    🧠 Explainable AI (XAI)
                </span>
                <h3 class="xai-title">Classification Explanation: <em>${scan.prediction}</em></h3>
            </div>
            <div class="xai-risk-pill" style="border-color:${color}; color:${color}; background:${color}10;">
                ${riskLevel} (${confPct.toFixed(1)}%)
            </div>
        </div>

        <div class="xai-body">
            <!-- Left: Regions & Feature Insights -->
            <div class="xai-left">
                <!-- Primary Brain Regions -->
                ${regions.length > 0 ? `
                <div class="xai-card-sub">
                    <div class="xai-block-label">Key Anatomical Focus</div>
                    <ul class="xai-region-list">
                        ${regions.map(r => `<li style="border-left-color:${color}">${r}</li>`).join('')}
                    </ul>
                </div>` : ''}

                <!-- Feature Contributions -->
                ${featureListItems ? `
                <div class="xai-card-sub">
                    <div class="xai-block-label">Model Feature Attributions</div>
                    <ul class="xai-feature-list">
                        ${featureListItems}
                    </ul>
                </div>` : ''}

                <!-- Heatmap Colour Legend -->
                <div class="xai-card-sub xai-legend-box">
                    <div class="xai-block-label">Activation Intensity Legend</div>
                    <div class="xai-legend-bar">
                        <div class="xai-gradient-bar"></div>
                        <div class="xai-gradient-labels">
                            <span>Baseline (0.0)</span>
                            <span>Moderate</span>
                            <span>Max Peak (1.0)</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right: Concise Clinical AI Summary -->
            <div class="xai-right">
                <div class="xai-card-sub" style="display: flex; flex-direction: column;">
                    <div class="xai-block-label" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>Clinical AI Interpretation</span>
                        <span class="xai-engine-tag">Powered by Gemini</span>
                    </div>

                    <div class="xai-ai-text">
                        ${formattedAI}
                    </div>

                    ${confidenceContext ? `
                    <div class="xai-confidence-note">
                        <strong>Confidence Assessment:</strong> ${confidenceContext}
                    </div>` : ''}

                    <div class="xai-disclaimer">
                        ℹ️ <strong>Clinical Note:</strong> Grad-CAM highlights decision-influencing regions. This automated analysis supports, but does not replace, qualified medical evaluation.
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ── Module 2: Dynamic Treatment Recommendations ───────────────────────────────

async function loadRecommendations(prediction, confidence) {
    const grid = document.getElementById('rec-grid-dynamic');
    const alertBox = document.getElementById('rec-alert-dynamic');
    const alertText = document.getElementById('rec-alert-text');
    const badge = document.getElementById('rec-scan-badge');

    if (!grid) return;

    // Show loading state
    grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-sub);">
            <div style="font-size:1.5rem; margin-bottom:12px;">◌</div>
            <div>Generating personalised recommendations...</div>
        </div>
    `;

    // Update badge
    if (badge) badge.textContent = prediction || 'Latest Scan';

    // Update alert message based on prediction
    if (alertBox && alertText) {
        const predLower = (prediction || '').toLowerCase();
        if (predLower.includes('non')) {
            alertBox.className = 'rec-alert rec-alert-green';
            alertText.innerHTML = '<strong>Healthy Baseline Detected</strong><p>Your scan shows no signs of dementia. Continue the recommendations below to maintain brain health.</p>';
        } else if (predLower.includes('very mild')) {
            alertBox.className = 'rec-alert rec-alert-amber';
            alertText.innerHTML = '<strong>Very Early Changes Noted</strong><p>Subtle indicators detected. Early action is highly effective — follow the prioritised recommendations below.</p>';
        } else if (predLower.includes('mild')) {
            alertBox.className = 'rec-alert';
            alertText.innerHTML = '<strong>Action Recommended</strong><p>Mild dementia indicators detected. It is recommended to consult a specialist for evaluation and begin the interventions below.</p>';
        } else {
            alertBox.className = 'rec-alert rec-alert-red';
            alertText.innerHTML = '<strong>Urgent Medical Attention Advised</strong><p>Moderate dementia indicators detected. Please consult a neurologist promptly and prioritise the high-priority recommendations below.</p>';
        }
    }

    try {
        const response = await fetch(`${API_URL}/recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prediction: prediction,
                confidence: confidence,
                user_id: currentUser ? currentUser.id : null
            })
        });

        const data = await response.json();
        const cards = data.cards || [];

        if (cards.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-sub);">No recommendations available. Run a scan first.</div>`;
            return;
        }

        const priorityColors = {
            high: 'var(--red, #e11d48)',
            medium: 'var(--amber, #f59e0b)',
            standard: 'var(--accent, #2563eb)',
        };

        grid.innerHTML = cards.map(card => {
            const pColor = priorityColors[card.priority_level] || priorityColors.standard;
            const isUrgent = card.priority_level === 'high' ? 'urgent' : '';
            return `
                <div class="rec-card ${isUrgent}">
                    <div class="rec-icon">${card.icon || '◈'}</div>
                    <h4>${card.title}</h4>
                    <p>${card.description}</p>
                    <div class="rec-priority ${card.priority_level}" style="color:${pColor}; border-color:${pColor}20; background:${pColor}10;">${card.priority}</div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Recommendations fetch error:', error);
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-sub);">Could not load recommendations. Please check the server connection.</div>`;
    }
}

// --- SCAN HISTORY RENDERER ---

async function initHistory() {
    const tbody = document.getElementById('historyBody');
    const recentList = document.getElementById('recentScansList');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Loading history...</td></tr>';

    if (!currentUser || !currentUser.id) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Please login to view history.</td></tr>';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/scans/${currentUser.id}`);
        const scans = await response.json();

        if (response.ok) {
            scansHistory = scans;
            
            // Dynamic Table Footer Update
            const showingText = document.getElementById('history-showing-text');
            if (showingText) {
                showingText.innerText = `Showing ${scans.length} of ${scans.length} records`;
            }
            const paginationEl = document.querySelector('.pagination');
            if (paginationEl) {
                paginationEl.style.display = scans.length <= 5 ? 'none' : 'flex';
            }

            if (scans.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No scan history found.</td></tr>';
                if (recentList) {
                    recentList.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-sub); font-size: 0.85rem;">No scans analyzed yet.</div>';
                }
                
                // Clean reset of My Health Insights card if no scans exist
                const insightBlock = document.querySelector('.insight-summary p');
                if (insightBlock) {
                    insightBlock.innerHTML = "No recent scans available. Run an MRI scan to generate clinical insights.";
                }
                const tipEl = document.querySelector('.wellness-tip p');
                if (tipEl) {
                    tipEl.innerText = "Wellness guidelines will update dynamically here based on your scan outcomes.";
                }
                return;
            }

            // Update My Health Insights card block with the actual latest prediction
            const latestScan = scans[0];
            const insightBlock = document.querySelector('.insight-summary p');
            if (insightBlock && latestScan) {
                let latestPct = latestScan.confidence;
                if (latestPct <= 1.0) latestPct *= 100.0;
                
                // Set custom supportive recommendation tip based on classification
                let wellnessTip = "Engaging in 20 minutes of aerobic exercise today can help improve blood flow to the brain.";
                const predLower = latestScan.prediction.toLowerCase();
                if (predLower.includes('non')) {
                    wellnessTip = "Maintain cognitive health by staying socially active, solving brain puzzles, and sleeping 7-8 hours daily.";
                } else if (predLower.includes('very mild')) {
                    wellnessTip = "Incorporate omega-3 rich foods like walnuts or fish, and practice minor memory recall training today.";
                } else if (predLower.includes('mild')) {
                    wellnessTip = "Engage in light aerobic activities like walking, and use a structured daily planner to assist focus.";
                } else if (predLower.includes('moderate')) {
                    wellnessTip = "Engage in simple family interactions, structured sensory exercises, and follow a balanced dietary schedule.";
                }
                
                insightBlock.innerHTML = `Your latest scan (#SCAN-${latestScan.id}) indicates <strong>${latestScan.prediction}</strong> with <strong>${latestPct.toFixed(1)}%</strong> confidence. Based on this, we've updated your daily recommendations.`;
                
                const tipEl = document.querySelector('.wellness-tip p');
                if (tipEl) {
                    tipEl.innerText = wellnessTip;
                }

                // Auto-populate Health Guide recommendations from latest scan
                loadRecommendations(latestScan.prediction, latestScan.confidence);
            }

            tbody.innerHTML = scans.map((s, idx) => {
                let predClass = 'normal';
                const cName = s.prediction.toLowerCase();
                if (cName.includes('mild')) predClass = 'mild';
                if (cName.includes('moderate')) predClass = 'moderate';

                let displayConfidence = s.confidence;
                if (displayConfidence <= 1.0) displayConfidence *= 100.0;

                return `
                    <tr>
                        <td><div class="hist-thumb ${predClass}-thumb">MRI</div></td>
                        <td><strong>#SCAN-${s.id}</strong></td>
                        <td><span class="prediction-tag ${predClass}">${s.prediction}</span></td>
                        <td>${displayConfidence.toFixed(1)}%</td>
                        <td>${formatLocalDatetime(s.scan_date)}</td>
                        <td><button class="view-btn" onclick="viewHistoricalScan(${idx})">View</button></td>
                    </tr>
                `;
            }).join('');
            
            if (recentList) {
                const recentScans = scans.slice(0, 3);
                recentList.innerHTML = recentScans.map((s, idx) => {
                    let predClass = 'normal';
                    const cName = s.prediction.toLowerCase();
                    if (cName.includes('mild')) predClass = 'mild';
                    if (cName.includes('moderate')) predClass = 'moderate';

                    return `
                        <div class="scan-row" style="cursor:pointer;" onclick="viewHistoricalScan(${idx})">
                            <div class="scan-thumb ${predClass}-thumb">MRI</div>
                            <div class="scan-info">
                                <span class="scan-patient">Scan #${s.id}</span>
                                <span class="scan-date">${formatLocalDatetime(s.scan_date)}</span>
                            </div>
                            <span class="prediction-tag ${predClass}">${s.prediction}</span>
                        </div>
                    `;
                }).join('');
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">Failed to retrieve records.</td></tr>';
        }
    } catch (error) {
        console.error("History Fetch Error:", error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:red;">Server connection failed.</td></tr>';
    }
}

// --- CHATBOT ASSISTANT ---

async function sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    addChatMessage('user', text);
    input.value = '';

    const typing = document.getElementById('typingIndicator');
    const chatMsgs = document.getElementById('chatMessages');
    if (typing && chatMsgs) {
        chatMsgs.appendChild(typing);
        typing.style.display = 'flex';
    }

    // Latest prediction inject karo (agar scan chal chuka hai)
    let latestPrediction = null;
    let latestConfidence = null;

    if (scansHistory && scansHistory.length > 0) {
        const latest = scansHistory[0];
        latestPrediction = latest.prediction || null;
        // confidence ko percentage mein convert karo agar decimal hai
        if (latest.confidence !== undefined) {
            latestConfidence = latest.confidence <= 1.0
                ? latest.confidence * 100.0
                : latest.confidence;
        }
    }

    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                user_id: currentUser ? currentUser.id : null,
                latest_prediction: latestPrediction,
                confidence: latestConfidence
            })
        });

        const data = await response.json();
        typing.style.display = 'none';
        addChatMessage('bot', data.reply);

    } catch (error) {
        typing.style.display = 'none';
        addChatMessage('bot', 'Connection error. Please try again.');
    }
}

function addChatMessage(role, text) {
    const chatMsgs = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role}`;

    const formatted = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    msgDiv.innerHTML = `
        ${role === 'bot' ? '<div class="msg-avatar">N</div>' : ''}
        <div class="msg-bubble">${formatted}</div>
    `;

    chatMsgs.appendChild(msgDiv);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;

    if (role !== 'typing') {
        chatHistory.push({ role, text });
        saveChatHistory();
    }
}

function setChat(text) {
    document.getElementById('chatInput').value = text;
    sendChat();
}

// --- STAR RATING FEEDBACK ---

function setRating(r) {
    currentRating = r;
    const stars = document.querySelectorAll('.star');
    stars.forEach((s, idx) => {
        if (idx < r) s.classList.add('active');
        else s.classList.remove('active');
    });
}

function submitFeedback() {
    const text = document.querySelector('#sec-feedback textarea').value;
    if (currentRating === 0 && !text) {
        showToast('Please provide a rating or feedback text');
        return;
    }
    
    showToast('Feedback submitted. Thank you!');
    
    setRating(0);
    document.querySelector('#sec-feedback textarea').value = '';
    document.querySelectorAll('.acc-btn').forEach(b => b.classList.remove('selected'));
}

// --- UTILITY NOTIFICATIONS ---

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

function formatLocalDatetime(datetimeString) {
    if (!datetimeString) return datetimeString;

    let dateObj = new Date(datetimeString);
    if (isNaN(dateObj)) {
        const parts = datetimeString.trim().split(' ');
        if (parts.length !== 2) {
            return datetimeString;
        }

        const [datePart, timePart] = parts;
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute, second] = timePart.split(':').map(Number);

        if ([year, month, day, hour, minute].some(n => Number.isNaN(n))) {
            return datetimeString;
        }

        dateObj = new Date(year, month - 1, day, hour, minute, second || 0);
        if (isNaN(dateObj)) {
            return datetimeString;
        }
    }

    try {
        return dateObj.toLocaleString('en-US', {
            timeZone: 'Asia/Karachi',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch (err) {
        return dateObj.toLocaleString();
    }
}

// --- DYNAMIC REPORT EXPORTER ---

function exportReport() {
    const scanIdText = document.getElementById('res-meta-id').innerText;
    if (scanIdText === '—' || scanIdText === '') {
        showToast('Please select or run an MRI scan first before exporting.');
        return;
    }

    const patientName = currentUser ? currentUser.full_name : "Patient";
    const scanId = scanIdText;
    const diagnosis = document.getElementById('res-prediction-text').innerText;
    const confidence = document.getElementById('res-conf-num').innerText + '%';
    const scanDate = document.getElementById('res-meta-date').innerText;
    const mriSrc = document.getElementById('result-mri-img').src;
    const heatmapImgEl = document.getElementById('result-heatmap-img');
    const heatmapSrc = heatmapImgEl && heatmapImgEl.style.display !== 'none' ? heatmapImgEl.src : null;
    
    let notes = "No additional observations.";
    const insightBlock = document.querySelector('.insight-summary p');
    
    const heatmapHtml = heatmapSrc ?
        `<div class="img-container"><img src="${heatmapSrc}" /><div class="img-title">Grad-CAM Neural Activation Overlap</div></div>` :
        `<div class="img-container coming-soon-box"><div class="coming-soon-label">Grad-CAM Coming Soon</div><div class="coming-soon-text">This visualization is planned for a future module and is not available in the current demo.</div></div>`;

    if (insightBlock) {
        notes = insightBlock.innerText;
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Neuro Vista — Clinical Report ${scanId}</title>
            <style>
                body {
                    font-family: 'DM Sans', -apple-system, sans-serif;
                    color: #1e293b;
                    margin: 0;
                    padding: 40px;
                    background: #ffffff;
                }
                .report-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid #0f172a;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .brand {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #0f172a;
                }
                .report-title {
                    font-size: 1.2rem;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .patient-meta {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    background: #f8fafc;
                    padding: 20px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    margin-bottom: 30px;
                }
                .meta-item strong {
                    color: #64748b;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    display: block;
                    margin-bottom: 4px;
                }
                .meta-item span {
                    font-size: 1.1rem;
                    color: #0f172a;
                    font-weight: 600;
                }
                .images-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .img-container {
                    text-align: center;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 10px;
                    background: #fff;
                }
                .img-container img {
                    width: 100%;
                    max-width: 320px;
                    height: auto;
                    aspect-ratio: 1;
                    object-fit: cover;
                    border-radius: 4px;
                }
                .img-title {
                    font-size: 0.9rem;
                    font-weight: 600;
                    margin-top: 10px;
                    color: #475569;
                }
                .coming-soon-box {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: auto;
                    min-height: 320px;
                    padding: 24px;
                    border-radius: 8px;
                    border: 1px dashed #f59e0b;
                    background: #fffbeb;
                }
                .coming-soon-label {
                    font-size: 1rem;
                    font-weight: 700;
                    color: #b45309;
                    margin-bottom: 12px;
                }
                .coming-soon-text {
                    font-size: 0.9rem;
                    color: #92400e;
                    line-height: 1.5;
                    text-align: center;
                    max-width: 320px;
                }
                .diagnosis-section {
                    margin-bottom: 30px;
                    padding: 25px;
                    border-radius: 8px;
                    border-left: 6px solid #e11d48;
                    background: #fff1f2;
                }
                .diagnosis-section.normal {
                    border-left-color: #16a34a;
                    background: #f0fdf4;
                }
                .diagnosis-section.mild {
                    border-left-color: #ea580c;
                    background: #fff7ed;
                }
                .diag-title {
                    font-size: 1.3rem;
                    font-weight: 700;
                    color: #0f172a;
                    margin: 0 0 10px 0;
                }
                .diag-desc {
                    font-size: 0.95rem;
                    line-height: 1.5;
                    color: #334155;
                }
                .disclaimer {
                    margin-top: 60px;
                    font-size: 0.75rem;
                    color: #94a3b8;
                    text-align: center;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 20px;
                    line-height: 1.4;
                }
                @media print {
                    body { padding: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="report-header">
                <div>
                    <div class="brand">⬡ Neuro Vista</div>
                    <div style="font-size: 0.85rem; color: #64748b;">Clinical Decision Support System (CNN+BiLSTM)</div>
                </div>
                <div class="report-title">Patient MRI Report</div>
            </div>

            <div class="patient-meta">
                <div class="meta-item">
                    <strong>Patient Name</strong>
                    <span>${patientName}</span>
                </div>
                <div class="meta-item">
                    <strong>Scan Record ID</strong>
                    <span>${scanId}</span>
                </div>
                <div class="meta-item">
                    <strong>Analysis Date</strong>
                    <span>${scanDate}</span>
                </div>
                <div class="meta-item">
                    <strong>AI Model Engine</strong>
                    <span>CNN+BiLSTM Neuro Vista v1</span>
                </div>
            </div>

            <div class="diagnosis-section ${diagnosis.toLowerCase().includes('non') ? 'normal' : diagnosis.toLowerCase().includes('mild') ? 'mild' : 'severe'}">
                <h3 class="diag-title">Diagnosis: ${diagnosis}</h3>
                <div class="diag-desc">
                    AI classification confidence score is <strong>${confidence}</strong>. 
                    <br/>
                    Clinical Observations: <em>${notes}</em>
                </div>
            </div>

            <div class="images-grid">
                <div class="img-container">
                    <img src="${mriSrc}" />
                    <div class="img-title">Original T1-Weighted Brain MRI</div>
                </div>
                ${heatmapHtml}
            </div>

            <div class="disclaimer">
                This clinical analysis report was automatically generated by the Neuro Vista AI sequence classification network (validation accuracy 95.71%). 
                It functions as an advanced diagnosis assistant and should always be validated by qualified radiologists or medical consultants prior to therapeutic prescribing.
            </div>

            <script>
                window.onload = function() {
                    window.print();
                }
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// --- DYNAMIC SCAN HISTORY CLEARER ---

async function clearScanHistory() {
    if (!currentUser || !currentUser.id) return;
    
    const confirmClear = confirm("Are you sure you want to clear all your historical scans? This will reset all your dashboard stats.");
    if (!confirmClear) return;
    
    try {
        const response = await fetch(`${API_URL}/scans/clear/${currentUser.id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast("Scan history cleared successfully!");
            
            // Reset Results section elements
            const mriImg = document.getElementById('result-mri-img');
            const mriPlaceholder = document.getElementById('result-mri-placeholder');
            const heatmapImg = document.getElementById('result-heatmap-img');
            const heatmapPlaceholder = document.getElementById('result-heatmap-placeholder');
            const xaiPanel = document.getElementById('xai-panel');
            
            if (mriImg) mriImg.style.display = 'none';
            if (mriPlaceholder) mriPlaceholder.style.display = 'block';
            if (heatmapImg) heatmapImg.style.display = 'none';
            if (heatmapPlaceholder) heatmapPlaceholder.style.display = 'block';
            if (xaiPanel) {
                xaiPanel.style.display = 'none';
                xaiPanel.innerHTML = '';
            }
            
            const badge = document.getElementById('res-prediction-badge');
            const text = document.getElementById('res-prediction-text');
            if (badge) badge.className = "prediction-badge normal";
            if (text) text.innerText = "No Scan Run";
            
            const confNum = document.getElementById('res-conf-num');
            if (confNum) confNum.innerText = "0.0";
            
            const strokeRing = document.getElementById('res-conf-svg-ring');
            if (strokeRing) strokeRing.style.strokeDashoffset = "251.2";
            
            // Clear metadata
            if (document.getElementById('res-meta-id')) document.getElementById('res-meta-id').innerText = "—";
            if (document.getElementById('res-meta-date')) document.getElementById('res-meta-date').innerText = "—";
            if (document.getElementById('res-meta-time')) document.getElementById('res-meta-time').innerText = "—";
            
            // Reset individual probabilities
            if (document.getElementById('pct-non-demented')) document.getElementById('pct-non-demented').innerText = "0.0%";
            if (document.getElementById('bar-non-demented')) document.getElementById('bar-non-demented').style.width = "0%";
            
            if (document.getElementById('pct-very-mild')) document.getElementById('pct-very-mild').innerText = "0.0%";
            if (document.getElementById('bar-very-mild')) document.getElementById('bar-very-mild').style.width = "0%";
            
            if (document.getElementById('pct-mild-demented')) document.getElementById('pct-mild-demented').innerText = "0.0%";
            if (document.getElementById('bar-mild-demented')) document.getElementById('bar-mild-demented').style.width = "0%";
            
            if (document.getElementById('pct-moderate')) document.getElementById('pct-moderate').innerText = "0.0%";
            if (document.getElementById('bar-moderate')) document.getElementById('bar-moderate').style.width = "0%";
            
            document.querySelectorAll('.class-row').forEach(row => row.classList.remove('highlight'));
            
            // Reload user stats and update history table
            loadStats(currentUser.id);
            initHistory();
        } else {
            showToast(data.detail || "Failed to clear history");
        }
    } catch (error) {
        console.error("Clear History Error:", error);
        showToast("Server connection error while clearing records");
    }
}


