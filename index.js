import makeWASocket, {
    useMultiFileAuthState, DisconnectReason,
    fetchLatestBaileysVersion, downloadMediaMessage
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import dotenv from 'dotenv'
dotenv.config()

// Panel (web server) import karo
import './panel.js'

import { getAIReply } from './ai.js'
import { uploadToImgBB } from './imgbb.js'
import {
    saveMessage, getChatHistory, markMessageDeleted,
    findMessageByWhatsappId, saveUser, getSettings
} from './firebase.js'

const logger = pino({ level: 'silent' })
let sock = null
let botEnabled = true

// Global state — panel isse access karega
global.WA_STATE = {
    sock: null,
    qr: null,
    pairingCode: null,
    connected: false,
    phoneNumber: null
}

// Settings refresh
setInterval(async () => {
    try {
        const s = await getSettings()
        botEnabled = s.botEnabled !== false
    } catch (e) {}
}, 30000)

function humanDelay() {
    return 2000 + Math.floor(Math.random() * 6000)
}

async function processMessage(msg) {
    const m = msg.message
    if (!m) return null

    let type = 'text', content = '', mediaBuffer = null, mediaType = null

    if (m.conversation) { content = m.conversation }
    else if (m.extendedTextMessage) { content = m.extendedTextMessage.text }
    else if (m.imageMessage) {
        type = 'image'; content = m.imageMessage.caption || ''
        mediaType = 'image'
    } else if (m.videoMessage) {
        type = 'video'; content = m.videoMessage.caption || ''
        mediaType = 'video'
    } else if (m.audioMessage) {
        type = 'audio'; mediaType = 'audio'
    } else if (m.documentMessage) {
        type = 'document'; content = m.documentMessage.fileName || ''
        mediaType = 'document'
    } else if (m.stickerMessage) {
        type = 'sticker'; mediaType = 'sticker'
    } else if (m.locationMessage) {
        type = 'location'
        content = `${m.locationMessage.degreesLatitude},${m.locationMessage.degreesLongitude}`
    } else if (m.contactMessage) {
        type = 'contact'; content = m.contactMessage.displayName || ''
    } else if (m.reactionMessage) {
        type = 'reaction'; content = m.reactionMessage.text || ''
    }

    if (mediaType && mediaType !== 'audio') {
        try {
            mediaBuffer = await downloadMediaMessage(msg, 'buffer', {}, {
                logger, reuploadRequest: sock.updateMediaMessage
            })
        } catch (err) { console.log('❌ Media download:', err.message) }
    }

    return { type, content, mediaBuffer, mediaType }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['Chrome', 'Chrome', '20.0.04']
    })

    global.WA_STATE.sock = sock

    // ========== QR + CONNECTION HANDLER ==========
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            global.WA_STATE.qr = qr
            global.WA_STATE.connected = false
        }

        if (connection === 'open') {
            global.WA_STATE.connected = true
            global.WA_STATE.qr = null
            global.WA_STATE.pairingCode = null
            console.log('✅ WhatsApp connected')
        }

        if (connection === 'close') {
            global.WA_STATE.connected = false
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode
            if (code !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...')
                startBot()
            } else {
                console.log('🚪 Logged out')
            }
        }
    })

    sock.ev.on('creds.update', saveCreds)

    // ========== MESSAGE HANDLER ==========
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const userId = msg.key.remoteJid
        const whatsappId = msg.key.id
        const name = msg.pushName || 'User'

        const processed = await processMessage(msg)
        if (!processed) return

        console.log(`📩 [${name}] ${processed.type}: ${processed.content}`)

        await saveUser(userId, { name, number: userId.split('@')[0] })

        let mediaUrl = null
        if (processed.mediaBuffer) {
            const ext = processed.mediaType === 'image' ? 'jpg'
                : processed.mediaType === 'video' ? 'mp4'
                : processed.mediaType === 'sticker' ? 'webp' : 'bin'
            mediaUrl = await uploadToImgBB(processed.mediaBuffer, `${whatsappId}.${ext}`)
        }

        await saveMessage(userId, whatsappId, {
            whatsappId,
            type: processed.type,
            content: processed.content,
            mediaUrl,
            sender: 'user',
            senderName: name,
            timestamp: Date.now(),
            deleted: false,
            deletedAt: null
        })

        if (!botEnabled) return

        const history = await getChatHistory(userId, 20)
        let reply = 'Bhai abhi AI reply nahi de pa raha.'
        try {
            reply = await getAIReply(userId, processed.content || '[media]', history)
        } catch (err) {
            console.log('❌ AI call error:', err.message)
        }

        try { await sock.sendPresenceUpdate('composing', userId) } catch {}
        await new Promise(r => setTimeout(r, humanDelay()))

        try {
            await sock.sendMessage(userId, { text: reply }, { quoted: msg })
            try { await sock.sendPresenceUpdate('paused', userId) } catch {}

            await saveMessage(userId, `bot_${Date.now()}`, {
                type: 'text',
                content: reply,
                sender: 'bot',
                senderName: process.env.BOT_NAME || 'Mitra AI',
                timestamp: Date.now(),
                deleted: false,
                deletedAt: null
            })
        } catch (err) { console.log('❌ Send:', err.message) }
    })

    // ========== DELETED MESSAGE HANDLER ==========
    sock.ev.on('messages.update', async (updates) => {
        for (const u of updates) {
            if (u.update?.messageStubType === 0 || u.update?.message === null) {
                const original = await findMessageByWhatsappId(u.key.id)
                if (original) {
                    await markMessageDeleted(original.userId, original.messageId)
                }
            }
        }
    })
}

// ========== GLOBAL PAIRING CODE FUNCTION ==========
global.requestPairingCode = async (phoneNumber) => {
    if (!global.WA_STATE.sock) throw new Error('Socket ready nahi hai')
    if (global.WA_STATE.connected) throw new Error('Already connected')
    const code = await global.WA_STATE.sock.requestPairingCode(phoneNumber)
    global.WA_STATE.pairingCode = code
    global.WA_STATE.phoneNumber = phoneNumber
    return code
}

startBot().catch(err => console.error('❌ Bot error:', err.message))
