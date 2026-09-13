import axios from 'axios'
import FormData from 'form-data'
import { getImgBBKeys, saveImgBBKeys } from './firebase.js'

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

export async function uploadToImgBB(buffer, fileName = 'image.jpg') {
    const keys = await getImgBBKeys()
    if (!keys.length) { console.log('⚠️ ImgBB keys nahi'); return null }

    const available = keys.filter(k => k.active !== false && !isOnCooldown(k.id))
    if (!available.length) { console.log('⚠️ Saari ImgBB keys cooldown'); return null }

    available.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0))

    for (const key of available) {
        try {
            const form = new FormData()
            form.append('image', buffer.toString('base64'))
            form.append('name', fileName)

            const res = await axios.post(
                `https://api.imgbb.com/1/upload?key=${key.key}`,
                form, { headers: form.getHeaders(), timeout: 30000 }
            )

            if (res.data?.data?.url) {
                key.usageCount = (key.usageCount || 0) + 1
                key.lastUsed = Date.now()
                await saveImgBBKeys(keys)
                console.log(`✅ ImgBB: ${res.data.data.url}`)
                return res.data.data.url
            }
        } catch (err) {
            console.log(`❌ ImgBB key ${key.id}:`, err.response?.data?.error?.message || err.message)
            if (err.response?.status === 429 || err.response?.status === 400) {
                setCooldown(key.id, 60 * 60 * 1000)
            }
        }
    }
    return null
}
