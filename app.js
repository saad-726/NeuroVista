// --- CONFIGURATION ---
const API_URL = "http://localhost:8000/api";

// --- STATE MANAGEMENT ---
let currentRating = 0;
let uploadedFile = null;
let currentUser = null;
let scansHistory = []; // Global variable to store active user's scan records

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
    } else {
        // Safe access check: Redirect guest users on the dashboard to the login page immediately
        const currentPath = window.location.pathname;
        if (currentPath.includes('dashboard.html')) {
            window.location.href = "login.html";
        }
    }
    
    checkRememberMe();
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

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            showToast("Registration successful! Please sign in.");
            setTimeout(() => {
                showPage('page-login');
            }, 1500);
        } else {
            showToast(data.detail || "Registration failed");
        }
    } catch (error) {
        console.error("Registration Error:", error);
        showToast("Cannot connect to server. Ensure FastAPI is running.");
    }
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
        welcome.innerText = `Good morning, ${userData.full_name.split(' ')[0]} 👋`;
    }
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    scansHistory = [];
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

    heatmapImg.src = `${rootUrl}${scan.heatmap_path}`;
    heatmapImg.style.display = 'block';
    heatmapPlaceholder.style.display = 'none';

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
    document.getElementById('res-meta-date').innerText = scan.scan_date;
    document.getElementById('res-meta-time').innerText = "1.72 seconds";

    const insightBlock = document.querySelector('.insight-summary p');
    if (insightBlock) {
        insightBlock.innerHTML = `Your latest scan indicates <strong>${scan.prediction}</strong> with <strong>${pct}%</strong> confidence. Clinical notes: <em>"${scan.notes}"</em>`;
    }
}

// Display historical scan details dynamically
function viewHistoricalScan(index) {
    if (scansHistory[index]) {
        displayPredictionResult(scansHistory[index]);
        showSection('sec-results', document.querySelector('[onclick*="sec-results"]'));
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
                        <td>${s.scan_date}</td>
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
                                <span class="scan-date">${s.scan_date}</span>
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

function sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    addChatMessage('user', text);
    input.value = '';

    const typing = document.getElementById('typingIndicator');
    typing.style.display = 'flex';
    
    const chatMsgs = document.getElementById('chatMessages');
    chatMsgs.scrollTop = chatMsgs.scrollHeight;

    setTimeout(() => {
        typing.style.display = 'none';
        const response = getBotResponse(text);
        addChatMessage('bot', response);
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }, 1500);
}

function addChatMessage(role, text) {
    const chatMsgs = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role}`;
    
    msgDiv.innerHTML = `
        ${role === 'bot' ? '<div class="msg-avatar">N</div>' : ''}
        <div class="msg-bubble">${text}</div>
    `;
    
    chatMsgs.appendChild(msgDiv);
}

function setChat(text) {
    document.getElementById('chatInput').value = text;
    sendChat();
}

function getBotResponse(input) {
    const low = input.toLowerCase();
    if (low.includes('stage')) return "Alzheimer's is often classified into 4 stages in clinical datasets: Non-Demented, Very Mild Demented, Mild Demented, and Moderate Demented. Our model is trained specifically on these categories.";
    if (low.includes('accuracy')) return "The current CNN+BiLSTM model achieves 95.71% validation accuracy, leveraging deep neural sequence feature extraction.";
    if (low.includes('medication') || low.includes('treatment')) return "Common wellness approaches for early-stage Alzheimer's include cognitive exercises and specialized nutrition. However, you should always consult a medical professional for a formal treatment plan.";
    return "That's a great question about neurological health. I can provide general info, but please speak with your doctor for specific advice. Would you like to see your health guide?";
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
    const heatmapSrc = document.getElementById('result-heatmap-img').src;
    
    let notes = "No additional observations.";
    const insightBlock = document.querySelector('.insight-summary p');
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
                <div class="img-container">
                    <img src="${heatmapSrc}" />
                    <div class="img-title">Grad-CAM Neural Activation Overlap</div>
                </div>
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
            
            if (mriImg) mriImg.style.display = 'none';
            if (mriPlaceholder) mriPlaceholder.style.display = 'block';
            if (heatmapImg) heatmapImg.style.display = 'none';
            if (heatmapPlaceholder) heatmapPlaceholder.style.display = 'block';
            
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


