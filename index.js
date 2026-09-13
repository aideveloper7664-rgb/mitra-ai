import makeWASocket, {
    useMultiFileAuthState, DisconnectReason,
    fetchLatestBaileysVersion, downloadMediaMessage
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import dotenv from 'dotenv'
dotenv.config()

// Panel (web server) import karo — Render ko port chahiye
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

// Settings refresh (har 30 sec)
setInterval(async () => {
    try {
        const s = await getSettings()
        botEnabled = s.botEnabled !== false
    } catch (e) {}
}, 30000)

// Human delay (2-8 sec)
function humanDelay() {
    return 2000 + Math.floor(Math.random() * 6000)
}

// Message type detect + media handle
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

    let pairingRequested = false

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr && !pairingRequested && !sock.authState.creds.registered) {
            pairingRequested = true
            const phoneNumber = process.env.PHONE_NUMBER

            if (!phoneNumber) {
                console.log('\n❌ PHONE_NUMBER env variable set nahi hai!')
                qrcode.generate(qr, { small: true })
                return
            }

            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber)
                    console.log(`\n========================================`)
                    console.log(`📱 PAIRING CODE: ${code}`)
                    console.log(`========================================`)
                    console.log(`\n📍 Phone me daalo:`)
                    console.log(`   WhatsApp > Settings > Linked Devices`)
                    console.log(`   > Link a Device > Link with phone number\n`)
                } catch (err) {
                    console.log('❌ Pairing code error:', err.message)
                    qrcode.generate(qr, { small: true })
                }
            }, 3000)
        }

        if (connection === 'open') {
            console.log('\n✅ Mitra AI connected successfully!')
            console.log('📩 Ab messages ka reply aayega...\n')
        }

        if (connection === 'close') {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode
            console.log('❌ Disconnected. Code:', code)
            if (code !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...')
                pairingRequested = false
                startBot()
            } else {
                console.log('🚪 Logged out. auth_info delete karke dobara chalao.')
            }
        }
    })

    sock.ev.on('creds.update', saveCreds)

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
        const reply = await getAIReply(userId, processed.content || '[media]', history)

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

    sock.ev.on('messages.update', async (updates) => {
        for (const u of updates) {
            if (u.update?.messageStubType === 0 || u.update?.message === null) {
                const original = await findMessageByWhatsappId(u.key.id)
                if (original) {
                    await markMessageDeleted(original.userId, original.messageId)
                    console.log(`🗑️ Deleted message marked: ${u.key.id}`)
                }
            }
        }
    })
}

startBot().catch(err => console.error('❌ Bot error:', err))
