// --- CONFIGURATION ---
const API_URL = "http://localhost:8000/api";

// --- STATE MANAGEMENT ---
let currentRating = 0;
let uploadedFile = null;
let currentUser = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initHistory();
    checkSession();
});

function checkSession() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateUIWithUser(currentUser);
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

/**
 * Switch between main pages (Landing, Auth, Dashboard)
 */
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
        // Fallback for single-file systems or if IDs are passed
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(pageId);
        if (el) el.classList.add('active');
        window.scrollTo(0, 0);
    }
}

/**
 * Switch between dashboard sections
 */
function showSection(sectionId, el) {
    // Update Sidebar Active State
    if (el) {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        el.classList.add('active');
    }

    // Update Section Visibility
    document.querySelectorAll('.dash-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');

    // Update Breadcrumb
    const label = el ? el.querySelector('span:not(.nav-icon):not(.nav-badge)').innerText : 'Dashboard';
    document.getElementById('breadcrumb').innerText = label;

    // Close sidebar on mobile after selection
    if (window.innerWidth <= 900) {
        toggleSidebar(false);
    }
}

/**
 * Handle Login with Backend
 */
async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
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
            
            // Handle Remember Me
            const rememberMe = document.getElementById('rememberMe');
            if (rememberMe && rememberMe.checked) {
                localStorage.setItem('rememberedEmail', email);
                localStorage.setItem('rememberedPassword', password);
            } else {
                localStorage.removeItem('rememberedEmail');
                localStorage.removeItem('rememberedPassword');
            }
            
            showDashboard(data.user);
        } else {
            showToast(data.detail || "Login failed");
        }
    } catch (error) {
        console.error("Login Error:", error);
        showToast("Cannot connect to server. Ensure FastAPI is running.");
    }
}

/**
 * Handle Registration with Backend
 */
async function handleRegister() {
    const full_name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
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
            showPage('page-login');
        } else {
            showToast(data.detail || "Registration failed");
        }
    } catch (error) {
        console.error("Registration Error:", error);
        showToast("Cannot connect to server. Ensure FastAPI is running.");
    }
}

/**
 * Handle Login Transition
 */
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
    
    const welcome = document.getElementById('welcomeText');
    if (welcome) {
        welcome.innerText = `Good morning, ${userData.full_name.split(' ')[0]} 👋`;
    }
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    showPage('page-landing');
}

/**
 * Toggle Sidebar on Mobile
 */
function toggleSidebar(force) {
    const sidebar = document.getElementById('sidebar');
    if (force !== undefined) {
        sidebar.classList.toggle('open', force);
    } else {
        sidebar.classList.toggle('open');
    }
}

// --- MRI UPLOAD SYSTEM ---

/**
 * Handle File Selection
 */
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

/**
 * Drag & Drop Handlers
 */
function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleFile(file);
    } else {
        showToast('Please upload a valid image file');
    }
}

/**
 * Clear Upload
 */
function clearUpload() {
    uploadedFile = null;
    document.getElementById('dropZone').style.display = 'block';
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('fileInput').value = '';
}

/**
 * Run Prediction (Simulated)
 */
function runPrediction() {
    if (!uploadedFile) {
        showToast('Please upload an MRI scan first');
        return;
    }

    showToast('Analyzing scan with CNN+LSTM...');
    
    // Simulate API delay
    const btn = document.querySelector('.btn-primary.full');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span> Processing...';
    btn.disabled = true;

    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        // Navigate to results
        showSection('sec-results', document.querySelector('[onclick*="sec-results"]'));
        showToast('Analysis complete');
    }, 2000);
}

// --- CHATBOT SYSTEM ---

/**
 * Send Chat Message
 */
function sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    addChatMessage('user', text);
    input.value = '';

    // Show typing indicator
    const typing = document.getElementById('typingIndicator');
    typing.style.display = 'flex';
    
    // Scroll to bottom
    const chatMsgs = document.getElementById('chatMessages');
    chatMsgs.scrollTop = chatMsgs.scrollHeight;

    // Simulated Bot Response
    setTimeout(() => {
        typing.style.display = 'none';
        const response = getBotResponse(text);
        addChatMessage('bot', response);
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }, 1500);
}

/**
 * Add message to UI
 */
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

/**
 * Set input from chips
 */
function setChat(text) {
    document.getElementById('chatInput').value = text;
    sendChat();
}

/**
 * Simulated Bot Knowledge Base
 */
function getBotResponse(input) {
    const low = input.toLowerCase();
    if (low.includes('stage')) return "Alzheimer's is often classified into 4 stages in clinical datasets: Non-Demented, Very Mild Demented, Mild Demented, and Moderate Demented. Our model is trained specifically on these categories.";
    if (low.includes('accuracy')) return "The current CNN+LSTM model achieves 97.3% accuracy on the test set, leveraging deep neural feature extraction.";
    if (low.includes('medication') || low.includes('treatment')) return "Common wellness approaches for early-stage Alzheimer's include cognitive exercises and specialized nutrition. However, you should always consult a medical professional for a formal treatment plan.";
    return "That's a great question about neurological health. I can provide general info, but please speak with your doctor for specific advice. Would you like to see your health guide?";
}

// --- HISTORY SYSTEM ---

/**
 * Initialize Dummy History
 */
function initHistory() {
    const historyData = [
        { id: '#SCAN-1024', pred: 'Mild Demented', conf: '84.2%', date: 'Today, 10:24 AM', class: 'mild' },
        { id: '#SCAN-1023', pred: 'Non Demented', conf: '96.7%', date: 'Yesterday, 09:11 AM', class: 'normal' },
        { id: '#SCAN-1022', pred: 'Moderate', conf: '91.3%', date: '18 Apr 2026', class: 'moderate' },
        { id: '#SCAN-1021', pred: 'Non Demented', conf: '98.1%', date: '15 Apr 2026', class: 'normal' },
        { id: '#SCAN-1020', pred: 'Very Mild', conf: '74.5%', date: '10 Apr 2026', class: 'mild' },
        { id: '#SCAN-1019', pred: 'Non Demented', conf: '99.2%', date: '05 Apr 2026', class: 'normal' }
    ];

    const tbody = document.getElementById('historyBody');
    if (!tbody) return;

    tbody.innerHTML = historyData.map(item => `
        <tr>
            <td><div class="hist-thumb ${item.class}-thumb">MRI</div></td>
            <td><strong>${item.id}</strong></td>
            <td><span class="prediction-tag ${item.class}">${item.pred}</span></td>
            <td>${item.conf}</td>
            <td>${item.date}</td>
            <td><button class="view-btn" onclick="showSection('sec-results', document.querySelector('[onclick*=\\'sec-results\\']'))">View</button></td>
        </tr>
    `).join('');
}

// --- FEEDBACK SYSTEM ---

/**
 * Handle Star Rating
 */
function setRating(r) {
    currentRating = r;
    const stars = document.querySelectorAll('.star');
    stars.forEach((s, idx) => {
        if (idx < r) s.classList.add('active');
        else s.classList.remove('active');
    });
}

/**
 * Submit Feedback
 */
function submitFeedback() {
    const text = document.querySelector('#sec-feedback textarea').value;
    if (currentRating === 0 && !text) {
        showToast('Please provide a rating or feedback text');
        return;
    }
    
    showToast('Feedback submitted. Thank you!');
    
    // Reset Form
    setRating(0);
    document.querySelector('#sec-feedback textarea').value = '';
    document.querySelectorAll('.acc-btn').forEach(b => b.classList.remove('selected'));
}

// --- UTILITIES ---

/**
 * Show Toast Notification
 */
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
