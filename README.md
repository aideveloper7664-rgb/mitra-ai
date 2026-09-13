# Mitra AI 🤖

WhatsApp AI Agent with multi-provider key rotation, Firebase chat history, ImgBB media upload, and web control panel.

## Features

- ✅ WhatsApp connect via QR scan (Baileys)
- ✅ AI multi-provider rotation (Gemini, Groq, OpenRouter, OpenAI, Mistral)
- ✅ 20+ API keys support — auto switch on rate limit
- ✅ Firebase Firestore chat history (har message save)
- ✅ ImgBB multi-key upload (images, videos, documents)
- ✅ Deleted messages bhi save rehte hain
- ✅ Typing indicator + human-like delay
- ✅ Web control panel (bot ON/OFF, keys, instructions, knowledge)
- ✅ Friendly Hinglish/Hindi/English personality
- ✅ Render deploy ready

## Setup

### 1. GitHub pe upload
Saari files upar wale structure me daalo.

### 2. Firebase setup
- console.firebase.google.com → Create project
- Firestore Database → Create (test mode)
- Project Settings → Service Accounts → Generate new private key
- JSON file se `projectId`, `clientEmail`, `privateKey` lo

### 3. Render deploy
- render.com → New Web Service → GitHub repo connect
- Environment variables add karo (`.env.example` dekho)
- Deploy

### 4. Panel access
- `https://your-app.onrender.com` → password daalo
- AI keys, ImgBB keys, knowledge sab panel se set karo

### 5. QR scan
- Render logs me QR aayega
- WhatsApp → Settings → Linked Devices → Link a Device → Scan

### 6. Keep-alive (optional)
- uptimerobot.com pe `/health` endpoint ping karo har 5 min

## Panel Routes

- `/` — Dashboard
- `/login` — Login page
- `/health` — Health check (keep-alive)

## Panel Features

- **Dashboard** — Bot ON/OFF, stats
- **AI Keys** — Add/edit/delete/enable/disable
- **ImgBB Keys** — Add/edit/delete
- **Instructions** — Unlimited custom instructions
- **Knowledge** — YT/Telegram/website links
- **Chats** — Users + messages + deleted messages

## ⚠️ Warning

Baileys unofficial library hai. Spam/bulk messaging mat karo.
