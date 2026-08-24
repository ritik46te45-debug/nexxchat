# NexChat

A production-grade, real-time messaging platform built with the MERN stack.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS 3, Zustand |
| Backend | Node.js, Express.js, Socket.IO |
| Database | MongoDB (Mongoose ODM) |
| Media Storage | Cloudinary |
| Real-time | Socket.IO, WebRTC |
| Auth | JWT (access + refresh tokens), Google OAuth |

## Project Structure

```
trial/
├── client/           # React (Vite) Frontend
│   └── src/
│       ├── features/ # Feature-based modules (auth, chat, calls, etc.)
│       ├── stores/   # Zustand state management
│       ├── lib/      # API client, Socket.IO, WebRTC utils
│       └── components/ # Shared UI components
│
├── server/           # Node.js/Express Backend
│   └── src/
│       ├── models/      # Mongoose schemas
│       ├── controllers/ # Route handlers
│       ├── routes/      # Express routes
│       ├── middleware/  # Auth, validation, rate limiting
│       ├── socket/      # Socket.IO event handlers
│       └── config/      # DB, Cloudinary configs
```

## Setup

### 1. Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Cloudinary account

### 2. Server Setup
```bash
cd server
cp .env.example .env
# Edit .env with your credentials
npm install
npm run dev
```

### 3. Client Setup
```bash
cd client
npm install
npm run dev
```

### 4. Open
Navigate to `http://localhost:5173` in your browser.

## Environment Variables

Copy `server/.env.example` to `server/.env` and fill in:

- `MONGODB_URI` — Your MongoDB connection string
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — Cloudinary credentials
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — Random secure strings

## Features

- ✅ User authentication (email + Google OAuth)
- ✅ Real-time messaging via Socket.IO
- ✅ File/image/video/document uploads via Cloudinary
- ✅ Voice messages with recording
- ✅ Typing & recording indicators
- ✅ Read receipts (✓ ✓✓)
- ✅ Online/offline presence
- ✅ Message reactions, replies, forwards
- ✅ Message editing & deletion
- ✅ Friend request system
- ✅ Chat search
- ✅ Responsive design (mobile → desktop)
- ✅ Dark mode UI
- 🔄 WebRTC video/voice calls (in progress)
- 🔄 Group chats (in progress)
- 🔄 Status/stories (in progress)
- 🔄 Admin panel (in progress)
