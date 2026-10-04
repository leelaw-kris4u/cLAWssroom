# ⚖️ cLAWssroom — Advocate's Chambers & Indian Court Management Portal

An integrated, privacy-focused chamber management system built specifically for legal advocates practicing in the **Supreme Court of India, High Courts, District & Sessions Courts, and Tribunals (NCLT, DRT, CAT)**.

---

## 🚀 Live Cloud Deployment Guide

### Option A: 1-Click Deploy on Render (Recommended)
1. Push this repository to your **GitHub** account.
2. Go to **[Render.com](https://render.com/)** and sign in with your GitHub account.
3. Click **New +** > **Web Service**.
4. Select your **`cLAWssroom`** repository.
5. Configure the settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install` (or leave blank)
   - **Start Command**: `node server.js`
   - **Plan**: `Free`
6. Click **Deploy Web Service**.
7. In ~60 seconds, your legal portal will be live at `https://clawssroom.onrender.com`!

---

## 🛠️ Features

- 🇮🇳 **Indian Judicial Hierarchy Integration**: Tailored for High Courts, District Courts, Family Courts, and Special NI Act Courts.
- 📋 **eCourts CNR & Cause List Synchronization**: Track 16-digit CNR numbers, court item numbers, and daily cause list stages.
- 📁 **Pleadings & Vakalatnama Tracking**: Automated Vakalatnama compliance status, written statements, and evidence affidavits.
- 👥 **Client & Matter Management**: Integrated Bar Council of India (BCI) Rule 28 conflict checks.
- 💰 **Advocate Fee & Invoicing**: Indian GST-compliant professional billing with receipt generation.
- 🔒 **Client Portal OTP Authentication**: Secure one-time password client verification.

---

## 💻 Local Development

### Requirements
- **Node.js**: v22.5.0 or newer (leverages built-in `node:sqlite` for zero external dependencies)

### Running Locally
```bash
# Clone the repository
git clone https://github.com/<your-username>/cLAWssroom.git
cd cLAWssroom

# Start the chamber portal
node server.js
```
Then open [http://localhost:3000](http://localhost:3000) in your web browser.
