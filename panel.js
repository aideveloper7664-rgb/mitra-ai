import express from 'express'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
dotenv.config()

import {
    getAIKeys, saveAIKeys, getImgBBKeys, saveImgBBKeys,
    getInstructions, saveInstructions, getKnowledge,
    saveKnowledge, getSettings, saveSettings,
    getAllUsers, getUserMessages
} from './firebase.js'

const app = express()

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret123',
    resave: false, saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}))
app.use(express.static('public'))
app.set('view engine', 'ejs')
app.set('views', './views')

function auth(req, res, next) {
    if (req.session.loggedIn) return next()
    res.redirect('/login')
}

// ========== ROUTES ==========
app.get('/', auth, (req, res) => res.render('panel', { page: 'dashboard' }))
app.get('/login', (req, res) => res.render('login', { error: null }))
app.post('/login', (req, res) => {
    if (req.body.password === (process.env.PANEL_PASSWORD || 'mitra123')) {
        req.session.loggedIn = true
        res.redirect('/')
    } else {
        res.render('login', { error: 'Galat password!' })
    }
})
app.get('/logout', (req, res) => {
    req.session.destroy()
    res.redirect('/login')
})

// ========== API: STATUS ==========
app.get('/api/status', auth, async (req, res) => {
    try {
        const settings = await getSettings()
        const aiKeys = await getAIKeys()
        const imgbbKeys = await getImgBBKeys()
        res.json({
            botEnabled: settings.botEnabled !== false,
            aiKeysCount: aiKeys.length,
            aiKeysActive: aiKeys.filter(k => k.active !== false).length,
            imgbbKeysCount: imgbbKeys.length,
            imgbbKeysActive: imgbbKeys.filter(k => k.active !== false).length
        })
    } catch (err) {
        console.error('❌ /api/status error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/bot/toggle', auth, async (req, res) => {
    try {
        const settings = await getSettings()
        settings.botEnabled = !settings.botEnabled
        await saveSettings(settings)
        res.json({ botEnabled: settings.botEnabled })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// ========== API: WHATSAPP ==========
app.get('/api/whatsapp/status', auth, (req, res) => {
    try {
        const state = global.WA_STATE || {}
        res.json({
            connected: state.connected || false,
            hasQR: !!state.qr,
            hasPairingCode: !!state.pairingCode,
            phoneNumber: state.phoneNumber || null
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.get('/api/whatsapp/qr', auth, (req, res) => {
    try {
        const state = global.WA_STATE || {}
        if (state.connected) {
            return res.json({ connected: true })
        }
        if (!state.qr) {
            return res.json({ qr: null, message: 'QR abhi ready nahi hai. 5 second baad try karo.' })
        }
        res.json({ qr: state.qr })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/whatsapp/pairing-code', auth, async (req, res) => {
    try {
        console.log('📥 Pairing code request body:', JSON.stringify(req.body))

        const { countryCode, phoneNumber } = req.body

        if (!countryCode || !phoneNumber) {
            console.log('❌ Missing countryCode or phoneNumber')
            return res.status(400).json({
                error: 'Country code aur phone number zaroori hai',
                received: req.body
            })
        }

        const cc = String(countryCode).replace(/\D/g, '')
        const pn = String(phoneNumber).replace(/\D/g, '')
        const fullNumber = cc + pn

        console.log('📱 Full number:', fullNumber)

        if (fullNumber.length < 10 || fullNumber.length > 15) {
            console.log('❌ Invalid length:', fullNumber.length)
            return res.status(400).json({ error: 'Invalid phone number (10-15 digits)' })
        }

        if (!global.requestPairingCode) {
            console.log('❌ global.requestPairingCode not available')
            return res.status(503).json({ error: 'Bot abhi ready nahi hai. 10 second baad try karo.' })
        }

        console.log('🔄 Requesting pairing code...')
        const code = await global.requestPairingCode(fullNumber)
        console.log('✅ Pairing code generated:', code)

        res.json({
            success: true,
            code: code,
            message: 'Pairing code generate ho gaya'
        })
    } catch (err) {
        console.log('❌ Pairing code error:', err.message)
        console.log('   Stack:', err.stack)
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/whatsapp/disconnect', auth, async (req, res) => {
    try {
        if (global.WA_STATE?.sock) {
            await global.WA_STATE.sock.logout()
            global.WA_STATE.connected = false
            global.WA_STATE.qr = null
            global.WA_STATE.pairingCode = null
        }
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// ========== API: AI KEYS ==========
app.get('/api/ai-keys', auth, async (req, res) => {
    try {
        res.json(await getAIKeys())
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/ai-keys', auth, async (req, res) => {
    try {
        const { provider, label, key, model } = req.body
        if (!provider || !label || !key) {
            return res.status(400).json({ error: 'Provider, label aur key zaroori hai' })
        }
        const keys = await getAIKeys()
        keys.push({
            id: Date.now().toString(), provider, label, key,
            model: model || null, active: true, usageCount: 0, lastUsed: null
        })
        await saveAIKeys(keys)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.put('/api/ai-keys/:id', auth, async (req, res) => {
    try {
        const keys = await getAIKeys()
        const idx = keys.findIndex(k => k.id === req.params.id)
        if (idx === -1) return res.status(404).json({ error: 'Not found' })
        keys[idx] = { ...keys[idx], ...req.body }
        await saveAIKeys(keys)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.delete('/api/ai-keys/:id', auth, async (req, res) => {
    try {
        const keys = (await getAIKeys()).filter(k => k.id !== req.params.id)
        await saveAIKeys(keys)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// ========== API: IMGBB KEYS ==========
app.get('/api/imgbb-keys', auth, async (req, res) => {
    try {
        res.json(await getImgBBKeys())
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/imgbb-keys', auth, async (req, res) => {
    try {
        const { label, key } = req.body
        if (!label || !key) {
            return res.status(400).json({ error: 'Label aur key zaroori hai' })
        }
        const keys = await getImgBBKeys()
        keys.push({
            id: Date.now().toString(), label, key,
            active: true, usageCount: 0, lastUsed: null
        })
        await saveImgBBKeys(keys)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.put('/api/imgbb-keys/:id', auth, async (req, res) => {
    try {
        const keys = await getImgBBKeys()
        const idx = keys.findIndex(k => k.id === req.params.id)
        if (idx === -1) return res.status(404).json({ error: 'Not found' })
        keys[idx] = { ...keys[idx], ...req.body }
        await saveImgBBKeys(keys)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.delete('/api/imgbb-keys/:id', auth, async (req, res) => {
    try {
        const keys = (await getImgBBKeys()).filter(k => k.id !== req.params.id)
        await saveImgBBKeys(keys)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// ========== API: INSTRUCTIONS ==========
app.get('/api/instructions', auth, async (req, res) => {
    try {
        res.json(await getInstructions())
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.post('/api/instructions', auth, async (req, res) => {
    try {
        const { text } = req.body
        if (!text) return res.status(400).json({ error: 'Text zaroori hai' })
        const list = await getInstructions()
        list.push({ id: Date.now().toString(), text, active: true })
        await saveInstructions(list)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.put('/api/instructions/:id', auth, async (req, res) => {
    try {
        const list = await getInstructions()
        const idx = list.findIndex(i => i.id === req.params.id)
        if (idx === -1) return res.status(404).json({ error: 'Not found' })
        list[idx] = { ...list[idx], ...req.body }
        await saveInstructions(list)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.delete('/api/instructions/:id', auth, async (req, res) => {
    try {
        const list = (await getInstructions()).filter(i => i.id !== req.params.id)
        await saveInstructions(list)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// ========== API: KNOWLEDGE ==========
app.get('/api/knowledge', auth, async (req, res) => {
    try {
        res.json(await getKnowledge())
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.put('/api/knowledge', auth, async (req, res) => {
    try {
        await saveKnowledge(req.body)
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// ========== API: CHATS ==========
app.get('/api/users', auth, async (req, res) => {
    try {
        res.json(await getAllUsers())
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

app.get('/api/users/:id/messages', auth, async (req, res) => {
    try {
        res.json(await getUserMessages(req.params.id))
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// ========== HEALTH ==========
app.get('/health', (req, res) => res.json({ status: 'ok', time: Date.now() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🌐 Panel: http://localhost:${PORT}`))
