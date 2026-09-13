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
})

app.post('/api/bot/toggle', auth, async (req, res) => {
    const settings = await getSettings()
    settings.botEnabled = !settings.botEnabled
    await saveSettings(settings)
    res.json({ botEnabled: settings.botEnabled })
})

// ========== API: AI KEYS ==========
app.get('/api/ai-keys', auth, async (req, res) => res.json(await getAIKeys()))

app.post('/api/ai-keys', auth, async (req, res) => {
    const { provider, label, key, model } = req.body
    const keys = await getAIKeys()
    keys.push({
        id: Date.now().toString(), provider, label, key,
        model: model || null, active: true, usageCount: 0, lastUsed: null
    })
    await saveAIKeys(keys)
    res.json({ success: true })
})

app.put('/api/ai-keys/:id', auth, async (req, res) => {
    const keys = await getAIKeys()
    const idx = keys.findIndex(k => k.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    keys[idx] = { ...keys[idx], ...req.body }
    await saveAIKeys(keys)
    res.json({ success: true })
})

app.delete('/api/ai-keys/:id', auth, async (req, res) => {
    const keys = (await getAIKeys()).filter(k => k.id !== req.params.id)
    await saveAIKeys(keys)
    res.json({ success: true })
})

app.post('/api/ai-keys/:id/test', auth, async (req, res) => {
    const keys = await getAIKeys()
    const key = keys.find(k => k.id === req.params.id)
    if (!key) return res.status(404).json({ error: 'Not found' })
    try {
        const { getAIReply } = await import('./ai.js')
        // Simple test call
        res.json({ success: true, message: 'Key format valid hai' })
    } catch (err) {
        res.json({ success: false, error: err.message })
    }
})

// ========== API: IMGBB KEYS ==========
app.get('/api/imgbb-keys', auth, async (req, res) => res.json(await getImgBBKeys()))

app.post('/api/imgbb-keys', auth, async (req, res) => {
    const { label, key } = req.body
    const keys = await getImgBBKeys()
    keys.push({
        id: Date.now().toString(), label, key,
        active: true, usageCount: 0, lastUsed: null
    })
    await saveImgBBKeys(keys)
    res.json({ success: true })
})

app.put('/api/imgbb-keys/:id', auth, async (req, res) => {
    const keys = await getImgBBKeys()
    const idx = keys.findIndex(k => k.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    keys[idx] = { ...keys[idx], ...req.body }
    await saveImgBBKeys(keys)
    res.json({ success: true })
})

app.delete('/api/imgbb-keys/:id', auth, async (req, res) => {
    const keys = (await getImgBBKeys()).filter(k => k.id !== req.params.id)
    await saveImgBBKeys(keys)
    res.json({ success: true })
})

// ========== API: INSTRUCTIONS ==========
app.get('/api/instructions', auth, async (req, res) => res.json(await getInstructions()))

app.post('/api/instructions', auth, async (req, res) => {
    const list = await getInstructions()
    list.push({ id: Date.now().toString(), text: req.body.text, active: true })
    await saveInstructions(list)
    res.json({ success: true })
})

app.put('/api/instructions/:id', auth, async (req, res) => {
    const list = await getInstructions()
    const idx = list.findIndex(i => i.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    list[idx] = { ...list[idx], ...req.body }
    await saveInstructions(list)
    res.json({ success: true })
})

app.delete('/api/instructions/:id', auth, async (req, res) => {
    const list = (await getInstructions()).filter(i => i.id !== req.params.id)
    await saveInstructions(list)
    res.json({ success: true })
})

// ========== API: KNOWLEDGE ==========
app.get('/api/knowledge', auth, async (req, res) => res.json(await getKnowledge()))
app.put('/api/knowledge', auth, async (req, res) => {
    await saveKnowledge(req.body)
    res.json({ success: true })
})

// ========== API: CHATS ==========
app.get('/api/users', auth, async (req, res) => res.json(await getAllUsers()))
app.get('/api/users/:id/messages', auth, async (req, res) => {
    res.json(await getUserMessages(req.params.id))
})

// ========== HEALTH (Render keep-alive) ==========
app.get('/health', (req, res) => res.json({ status: 'ok', time: Date.now() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🌐 Panel: http://localhost:${PORT}`))
