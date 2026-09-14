import axios from 'axios'
import { getAIKeys, saveAIKeys, getInstructions, getKnowledge } from './firebase.js'

const cooldowns = new Map()

function isOnCooldown(keyId) {
    const until = cooldowns.get(keyId)
    if (!until) return false
    if (Date.now() > until) { cooldowns.delete(keyId); return false }
    return true
}

function setCooldown(keyId, ms = 60 * 60 * 1000) {
    cooldowns.set(keyId, Date.now() + ms)
}

async function buildSystemPrompt() {
    const knowledge = await getKnowledge()
    const instructions = await getInstructions()

    const knowledgeText = Object.entries(knowledge)
        .filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
    const instructionsText = instructions
        .filter(i => i.active !== false).map(i => `- ${i.text}`).join('\n')

    return `Tu "${process.env.BOT_NAME || 'Mitra AI'}" hai — ek friendly, respectful assistant.

Knowledge:
${knowledgeText || 'Koi extra info nahi'}

Custom Instructions:
${instructionsText || 'Koi extra instruction nahi'}

Rules:
1. Har message pe "sir busy hain" MAT bolna
2. Har message pe YouTube/Telegram MAT mention karna
3. Normal baat me friendly reply do
4. "Sir busy hain" sirf tab jab user khud sir ke baare me puche
5. YouTube/Telegram sirf tab mention karo jab user maange ya relevant ho
6. Pehle user ki baat ka jawab do, phir suggest karo
7. Respectful raho hamesha
8. User ki language ke hisaab se reply (Hindi/English/Hinglish)
9. Natural, dost jaisa tone`
}

function getDefaultModel(provider) {
    return {
        gemini: 'gemini-1.5-flash',
        groq: 'llama-3.1-8b-instant',     // Groq ka naya model
        openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
        openai: 'gpt-4o-mini',
        mistral: 'mistral-small-latest'
    }[provider] || 'gpt-4o-mini'
}

async function callProvider(key, messages, systemPrompt) {
    const provider = (key.provider || '').toLowerCase()
    const model = key.model || getDefaultModel(provider)

    if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key.key}`
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }))
        const res = await axios.post(url, {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents
        }, { timeout: 60000 })
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text
    }

    const baseUrls = {
        groq: 'https://api.groq.com/openai/v1',
        openrouter: 'https://openrouter.ai/api/v1',
        openai: 'https://api.openai.com/v1',
        mistral: 'https://api.mistral.ai/v1'
    }
    const baseUrl = baseUrls[provider]
    if (!baseUrl) throw new Error(`Unknown provider: ${provider}`)

    const res = await axios.post(`${baseUrl}/chat/completions`, {
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.8,
        max_tokens: 1024
    }, {
        headers: { 'Authorization': `Bearer ${key.key}`, 'Content-Type': 'application/json' },
        timeout: 60000
    })
    return res.data?.choices?.[0]?.message?.content
}

export async function getAIReply(userId, userMessage, history = []) {
    const keys = await getAIKeys()
    if (!keys.length) {
        console.log('❌ Koi AI key nahi hai')
        return 'Bhai abhi AI service available nahi hai. Thodi der baad try karo.'
    }

    const available = keys.filter(k => k.active !== false && !isOnCooldown(k.id))
    if (!available.length) {
        console.log('❌ Saari AI keys cooldown me hain')
        return 'Bhai abhi saari AI keys busy hain. 1 min baad try karo.'
    }

    available.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0))

    const systemPrompt = await buildSystemPrompt()
    const messages = [...history.slice(-20), { role: 'user', content: userMessage }]

    for (const key of available) {
        try {
            console.log(`🔄 Trying ${key.provider}/${key.label}...`)
            const reply = await callProvider(key, messages, systemPrompt)
            
            if (reply && reply.trim()) {
                key.usageCount = (key.usageCount || 0) + 1
                key.lastUsed = Date.now()
                await saveAIKeys(keys)
                console.log(`✅ Reply via ${key.provider}/${key.label}`)
                return reply.trim()
            } else {
                console.log(`⚠️ ${key.provider}/${key.label} empty reply`)
            }
        } catch (err) {
            const status = err.response?.status
            const errMsg = err.response?.data?.error?.message || err.message
            console.log(`❌ ${key.provider}/${key.label} [${status}]:`, errMsg)
            
            // Rate limit ya quota exceeded → cooldown
            if (status === 429 || errMsg?.includes('quota') || errMsg?.includes('rate') || errMsg?.includes('limit')) {
                setCooldown(key.id, 60 * 60 * 1000) // 1 ghanta
                console.log(`   ⏳ ${key.label} cooldown me 1 ghante ke liye`)
            } else if (status === 401 || status === 403) {
                key.active = false
                await saveAIKeys(keys)
                console.log(`   🚫 ${key.label} disable ho gayi`)
            }
            // Next key try karega
        }
    }

    console.log('❌ Saari keys fail ho gayi')
    return 'Bhai abhi AI reply nahi de pa raha. Thodi der baad try karo.'
}
