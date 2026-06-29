<div align="center">

# 🧠 NeuroVista
### AI-Powered Alzheimer's Disease Detection System

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-CNN--BiLSTM-orange?logo=tensorflow)](https://tensorflow.org)
[![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-Chatbot-purple?logo=google)](https://ai.google.dev)
[![MySQL](https://img.shields.io/badge/MySQL-Database-blue?logo=mysql)](https://mysql.com)

*A Final Year Project — SZABIST Islamabad*

</div>

---

## 📌 Overview

NeuroVista is an intelligent web-based clinical support system that uses deep learning to detect and classify Alzheimer's disease from brain MRI scans. It combines a **CNN-BiLSTM hybrid model** (95.71% validation accuracy) with a full-stack web application featuring secure authentication, scan history, GradCAM heatmap visualization, PDF report generation, and a Gemini-powered AI chatbot.

> ⚠️ **Disclaimer:** NeuroVista is an academic research project and is not intended for clinical diagnostic use. All results should be reviewed by a qualified medical professional.

---

## ✨ Features

### 🔐 Authentication & Security
- User registration with **OTP-based email verification** (6-digit code, 15-minute expiry)
- Secure login with **bcrypt password hashing**
- **Forgot password** flow with OTP email verification
- Session-based user management

### 🧪 MRI Analysis & Prediction
- Upload brain MRI scans through the web interface
- Full preprocessing pipeline: **CLAHE** (clipLimit=2.0, tile=8×8) + **Unsharp Masking** (σ=2, w=1.5)
- CNN-BiLSTM model classifies into 4 categories:
  - `Non Demented`
  - `Very Mild Demented`
  - `Mild Demented`
  - `Moderate Demented`
- Per-class probability breakdown displayed with each result
- **GradCAM heatmap overlay** generated for every scan (highlights affected brain regions)

### 📊 Dashboard
- Total scans performed
- Alzheimer's-positive detection count
- Average model confidence score
- Processing time per scan

### 📁 Scan History
- Full history of all previous MRI scans per user
- View original scan image alongside GradCAM heatmap
- Stored with timestamps (PKT timezone)

### 📄 PDF Report Generation
- Generate and download a detailed PDF report for any scan
- Includes prediction, confidence scores, probability breakdown, and heatmap

### 🤖 AI Chatbot — NeuroBot (Gemini 2.5 Flash)
- Domain-restricted to Alzheimer's, dementia, brain health, and NeuroVista topics
- **Intent classification** — detects personal scan queries vs. general questions
- Injects latest scan context only when user asks about their own result
- Adds medical disclaimer automatically for personal/medical advice queries
- Per-user conversation history (up to 8 turns)

---

## 🔜 Upcoming Features (Phase 2)

| Feature | Description |
|---|---|
| 🌡️ GradCAM Heatmap UI | Display heatmap directly in the analysis results view |
| 📈 Progress Tracker | Monitor disease progression across multiple scans over time |
| 💬 Feedback System | Users can submit star ratings and written feedback on results |

---

## 🧠 Model Architecture

```
Input (96×96×3 MRI)
        │
   ┌────▼─────────────────────┐
   │  Conv2D(32) + BN + Pool  │
   │  Conv2D(64) + BN + Pool  │
   │  Conv2D(128) + BN + Pool │
   │  Conv2D(256) + BN + Pool │
   │  Dropout                 │
   └────────────┬─────────────┘
                │  Reshape → (36, 256)
   ┌────────────▼─────────────┐
   │    BiLSTM(128)           │
   │    BiLSTM(64)            │
   └────────────┬─────────────┘
                │
   ┌────────────▼─────────────┐
   │  Dense(128) → Dense(64)  │
   │  Softmax (4 classes)     │
   └──────────────────────────┘
```

| Metric | Value |
|---|---|
| Val Accuracy | **95.71%** |
| Val Loss | 0.4070 |
| Macro F1 Score | **95.75%** |
| Best Epoch | 49 |
| Image Size | 96×96 |
| Label Smoothing | 0.05 |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Python 3.12, FastAPI |
| Database | MySQL (SQLAlchemy ORM) |
| Deep Learning | TensorFlow / Keras (CNN-BiLSTM) |
| MRI Preprocessing | OpenCV — CLAHE + Unsharp Masking |
| Heatmap | GradCAM via TensorFlow GradientTape |
| AI Chatbot | Google Gemini 2.5 Flash API |
| Email / OTP | Python smtplib + Gmail SMTP |
| PDF Reports | Integrated report generation |
| Auth Security | bcrypt (passlib) |

---

## 🗄️ Database Schema

```sql
users               → id, full_name, email, hashed_password, created_at
scans               → id, user_id, prediction, confidence, prob_*, scan_date, image_path, heatmap_path, notes
password_resets     → email, code, expires_at
registration_requests → email, full_name, hashed_password, code, expires_at
feedback            → id, user_id, rating (1–5), message, submitted_at
```

---

## 📁 Project Structure

```
NeuroVista/
├── main.py                  # FastAPI app — all endpoints
├── prediction.py            # BrainMRIPredictor — preprocessing, inference, GradCAM
├── chatbot.py               # NeuroBot — Gemini 2.5 Flash integration
├── setup.sql                # MySQL database schema
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variable template
├── app.js                   # Frontend JavaScript
├── styles.css               # Global stylesheet
├── index.html               # Landing page
├── login.html               # Login page
├── register.html            # Registration + OTP verification
├── forgot-password.html     # Password reset flow
├── dashboard.html           # Main dashboard
├── privacy.html             # Privacy policy
├── model/
│   ├── cnn_lstm_brain_mri_v1.h5   # Trained model weights
│   ├── class_names.npy            # Class label array
│   └── model_info.txt             # Architecture & training summary
└── static/
    └── uploads/
        ├── scans/           # Uploaded MRI images
        └── heatmaps/        # Generated GradCAM overlays
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Python 3.12+
- MySQL Server
- Gmail account (for SMTP OTP emails)
- Google Gemini API key

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/saadahmed9/neurovista.git
cd neurovista

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Set up the database
# Open MySQL and run:
mysql -u root -p < setup.sql

# 4. Configure environment variables
cp .env.example .env
# Edit .env with your credentials (see below)

# 5. Run the backend
uvicorn main:app --reload
```

### `.env` Configuration

```env
GEMINI_API_KEY=your_gemini_api_key_here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
EMAIL_FROM=your_email@gmail.com
```

> 💡 For Gmail, use an **App Password** (not your regular password). Enable 2FA on your Google account first, then generate one at myaccount.google.com → Security → App Passwords.

Then open `index.html` in a browser or serve the frontend via a local server.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/api/register-request` | Send OTP for registration |
| `POST` | `/api/register-confirm` | Verify OTP and create account |
| `POST` | `/api/login` | User login |
| `POST` | `/api/forgot-password` | Send password reset OTP |
| `POST` | `/api/reset-password` | Reset password with OTP |
| `POST` | `/api/predict` | Upload MRI and run inference |
| `GET` | `/api/scans/{user_id}` | Get scan history |
| `DELETE` | `/api/scans/clear/{user_id}` | Clear all scans |
| `GET` | `/api/stats/{user_id}` | Get dashboard statistics |
| `POST` | `/api/chat` | NeuroBot chatbot |

---

## 👥 Team

| Name | Role |
|---|---|
| **Saad Ahmed** | Lead Developer — Full-stack development, CNN-BiLSTM model integration, GradCAM pipeline, OTP auth system, API design |
| **Shahmir Hassan** | Research & Junior Developer — Dataset research, model training support, testing and validation |
| **Ayesha Zaheer** | Documentation & Development — Project documentation, UI/UX feedback, quality assurance, Gemini chatbot |
| **Mr Ahsan Abbass** | Supervision of complete project.|

---

## 📌 Project Status

| Phase | Status |
|---|---|
| P1 Mid |  Completed |
| P1 Final |  Completed |
| P2 Mid |  In Progress |
| P2 Final |  Upcoming |

---

<div align="center">
Made with ❤️ by Team NeuroVista — SZABIST Islamabad
</div>
