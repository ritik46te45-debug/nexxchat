# NexChat 💬

[![Build Android APK](https://github.com/ritik46te45-debug/nexxchat/actions/workflows/build-apk.yml/badge.svg)](https://github.com/ritik46te45-debug/nexxchat/actions/workflows/build-apk.yml)
[![Build Windows Desktop EXE](https://github.com/ritik46te45-debug/nexxchat/actions/workflows/build-exe.yml/badge.svg)](https://github.com/ritik46te45-debug/nexxchat/actions/workflows/build-exe.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Android%20%7C%20Windows-green.svg)](https://github.com/ritik46te45-debug/nexxchat)

**NexChat** is a production-grade, real-time messaging and VoIP calling platform inspired by WhatsApp. Built with a modern, high-performance architecture supporting **Web**, **Android (Native APK)**, and **Windows (Desktop .exe)**.

---

## 🌟 Key Highlights

- **Multi-Platform Support**: Single unified codebase powering Web, Android (Capacitor 8), and Windows (Electron).
- **Background Keepalive & System Tray**: Runs silently in the background on Windows and Android with persistent tray support and instant notification delivery.
- **Automated CI/CD Builds**: Pre-configured GitHub Actions automatically build signed/debug Android APKs and Windows Setup/Portable `.exe` installers on every release.
- **WhatsApp-Parity Chat Features**: Read receipts, voice notes, message reactions, group chats, status/stories, and end-to-end security options.

---

## 🚀 Platform Support

| Platform | Technology | Distribution / Artifact |
| :--- | :--- | :--- |
| **🌐 Web App** | React 18, Vite, Tailwind CSS 3 | Hosted on Vercel / Cloudflare |
| **📱 Android APK** | Capacitor 8, Android SDK 35, MediaStore API | GitHub Actions: `nexchat-apks` (`app-debug.apk`) |
| **💻 Windows Desktop** | Electron, NSIS, Windows Action Center API | GitHub Actions: `nexchat-windows-exe` (Setup + Portable `.exe`) |

---

## ⚡ Core Features

### 💬 Real-Time Messaging
- **Instant Messaging**: Low-latency message delivery powered by Socket.IO.
- **Message Status Indicators**: Real-time delivery ticks (🕒 Pending, ✓ Sent, ✓✓ Delivered, 🔵 Read).
- **Rich Interactive Messages**: Message reactions, quoted replies, forward messages, inline editing, and deletion.
- **Typing & Recording Indicators**: Real-time indicator when contacts are typing or recording voice notes.
- **Presence Tracking**: Live online/offline status with accurate last-seen timestamps.

### 📞 Voice & Video Calls (VoIP)
- **1-on-1 Calls**: Peer-to-peer audio and video calling powered by WebRTC.
- **In-Call Controls**: Camera flip, audio mute, video toggle, speaker selection, and screen sharing.
- **Call Notifications**: Real-time incoming call alerts with ringing sound effects and accept/reject actions.
- **Call Logs**: Complete historical call records with duration, timestamps, and status (missed, rejected, completed).

### 📁 Media & Attachments
- **Cloudinary CDN Storage**: High-speed image, video, audio, and document uploads.
- **Voice Notes**: In-app audio recorder with live waveform visualization and playback controls.
- **Native Gallery Saving (Android)**: Native `MediaStore` and `DownloadManager` support to save photos, videos, and PDFs directly to phone gallery and Downloads folder.
- **In-App Document Viewer**: Built-in PDF reader (`pdfjs-dist`) and media lightbox.

### 👥 Groups, Channels & Stories
- **Group Chats**: Create group conversations with custom avatars, group descriptions, and admin privileges.
- **Status & Stories**: 24-hour disappearing photo and video stories with captions and viewer tracking.
- **Friend Requests & Contacts**: Send, accept, or decline friend invitations and manage private contact lists.

### 🛡️ Privacy, Security & Account Management
- **Dual Authentication**: Secure JWT (access + refresh tokens) rotation and Google OAuth single sign-on across all platforms.
- **Two-Factor Authentication (2FA)**: Time-based One-Time Password (TOTP) support compatible with Google Authenticator, Authy, etc.
- **App Lock**: Passcode PIN lock with auto-lock timeout.
- **Session Management**: View active sessions with device names, IP addresses, browser info, and one-click remote logout.

### 🔔 Notifications & Background Mode
- **Android Notifications**: Native local notification channel (`nexchat_messages_v2`) with custom alert sounds and vibration patterns.
- **Windows Action Center Toasts**: Native Windows 10/11 toast notifications attributed with the NexChat application icon.
- **System Tray Minimization**: Closing the desktop app window (`✕`) minimizes to the system tray so background WebSockets remain active.
- **Auto-Start on Boot**: Optional auto-launch at system startup on Windows.

---

## 🛠️ Tech Stack

### Client (Web, Android & Desktop)
- **Framework**: [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 3](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/)
- **State Management**: [Zustand 5](https://github.com/pmndrs/zustand)
- **Real-Time Client**: [Socket.IO Client](https://socket.io/)
- **Mobile Engine**: [Capacitor 8](https://capacitorjs.com/) (Android)
- **Desktop Engine**: [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/)

### Server (Backend API & Sockets)
- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Web Framework**: [Express.js](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) via [Mongoose ODM](https://mongoosejs.com/)
- **WebSockets**: [Socket.IO](https://socket.io/)
- **Cloud Storage**: [Cloudinary](https://cloudinary.com/)
- **Security & Headers**: [Helmet](https://helmetjs.github.io/), CORS, express-rate-limit, sanitize-html
- **Push & Email**: Firebase Admin SDK, Web Push (VAPID), Nodemailer

---

## 📁 Directory Structure

```
nexchat/
├── .github/
│   └── workflows/
│       ├── build-apk.yml       # GitHub Actions: Android APK build pipeline
│       └── build-exe.yml       # GitHub Actions: Windows Desktop EXE build pipeline
│
├── client/                     # Frontend Application (React + Vite)
│   ├── android/                # Native Android Studio project (Capacitor)
│   ├── public/                 # Static public assets (favicons, sounds)
│   ├── src/
│   │   ├── components/         # Shared UI components (Avatar, Modal, etc.)
│   │   ├── features/           # Feature modules
│   │   │   ├── auth/           # Login, Register, Google OAuth
│   │   │   ├── calls/          # WebRTC audio/video call UI & logic
│   │   │   ├── chat/           # Chat window, messages, input, attachments
│   │   │   ├── notifications/  # Notification center & toasts
│   │   │   ├── settings/       # Account, privacy, 2FA, desktop preferences
│   │   │   └── status/         # Stories / Status feed
│   │   ├── lib/                # API client, WebRTC, Socket.IO, Push services
│   │   └── stores/             # Zustand global state (auth, chat, call)
│   ├── capacitor.config.json   # Capacitor mobile configuration
│   └── package.json
│
├── electron/                   # Desktop Application Shell
│   ├── main.cjs                # Electron main process (tray, toasts, window lifecycle)
│   ├── preload.cjs             # IPC bridge between web app and Electron
│   ├── app-icon.png            # Desktop application icon
│   └── icon.png
│
├── server/                     # Backend API & WebSocket Server
│   ├── src/
│   │   ├── config/             # DB, Cloudinary, Firebase, and Mailer setup
│   │   ├── controllers/        # Route controllers (auth, messages, calls, users)
│   │   ├── middleware/         # Auth verification, file upload, error handling
│   │   ├── models/             # Mongoose schemas (User, Message, Conversation, Call)
│   │   ├── routes/             # REST API endpoint definitions
│   │   ├── services/           # Push notification & cloud services
│   │   ├── socket/             # Socket.IO connection & event handlers
│   │   └── index.js            # Express & HTTP server entry point
│   └── package.json
│
├── package.json                # Root package configuration & Electron build scripts
└── README.md
```

---

## ⚙️ Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **MongoDB**: Local MongoDB server or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster
- **Cloudinary Account**: Free account for media storage
- **Java JDK & Android SDK** *(Optional)*: Only needed if building Android APK locally

---

### 2. Backend Setup

```bash
# Navigate to server directory
cd server

# Create and populate environment file
cp .env.example .env

# Install dependencies
npm install

# Start development server
npm run dev
```

The backend server runs on `http://localhost:5000` by default.

---

### 3. Frontend Setup

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

### 4. Running Desktop App (Electron)

```bash
# From the project root
npm run electron:dev
```

To build production Windows installer and portable `.exe` locally:
```bash
npm run electron:build
```
Output files will be generated in `release/`.

---

### 5. Running & Building Android App

```bash
# Build web assets and sync to Android
cd client
npm run build
npx cap sync android

# Open project in Android Studio
npx cap open android
```

---

## 🔑 Environment Variables

Create a `.env` file in the `server/` directory:

```env
# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# MongoDB
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/nexchat?retryWrites=true&w=majority

# JWT Authentication
JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Cloudinary (Media Uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# SMTP Email (Optional - for verification & reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Firebase Admin (Optional - for Push Notifications)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
```

---

## 📦 CI/CD Workflows

This repository includes automated GitHub Actions for zero-setup binary releases:

1. **Android APK Workflow** (`.github/workflows/build-apk.yml`):
   - Automatically triggered on push to `main` modifying client files.
   - Sets up JDK 21, Android SDK 35, Node.js 20, builds web assets, and compiles signed/debug APKs.
   - Uploads artifact: **`nexchat-apks`**.

2. **Windows Desktop EXE Workflow** (`.github/workflows/build-exe.yml`):
   - Automatically triggered on push to `main` modifying Electron or client files.
   - Sets up Windows runner, builds web bundle, and packages NSIS Setup and Portable `.exe` with `electron-builder`.
   - Uploads artifact: **`nexchat-windows-exe`**.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
