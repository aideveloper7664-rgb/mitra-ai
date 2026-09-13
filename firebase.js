import admin from 'firebase-admin'
import dotenv from 'dotenv'
dotenv.config()

// ========== PRIVATE KEY FIX (Option 2) ==========
function getPrivateKey() {
    let key = process.env.FIREBASE_PRIVATE_KEY || ''
    
    // 1. Shuru aur aakhir ke quotes hatao (agar hain)
    key = key.replace(/^"|"$/g, '')
    
    // 2. \n ko actual newline me badlo
    key = key.replace(/\\n/g, '\n')
    
    // 3. Extra spaces hatao (shuru/aakhir se)
    key = key.trim()
    
    return key
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: getPrivateKey()
        })
    })
}

const db = admin.firestore()

// ========== CHAT MESSAGES ==========
export async function saveMessage(userId, messageId, data) {
    try {
        await db.collection('chats').doc(userId)
            .collection('messages').doc(messageId)
            .set({ ...data, savedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
        return true
    } catch (err) {
        console.error('❌ saveMessage:', err.message)
        return false
    }
}

export async function getChatHistory(userId, limit = 20) {
    try {
        const snap = await db.collection('chats').doc(userId)
            .collection('messages').orderBy('timestamp', 'desc').limit(limit).get()
        const messages = []
        snap.forEach(doc => {
            const d = doc.data()
            messages.push({
                role: d.sender === 'bot' ? 'assistant' : 'user',
                content: d.content || '[media]',
                type: d.type,
                mediaUrl: d.mediaUrl || null
            })
        })
        return messages.reverse()
    } catch (err) {
        console.error('❌ getChatHistory:', err.message)
        return []
    }
}

export async function markMessageDeleted(userId, messageId) {
    try {
        await db.collection('chats').doc(userId)
            .collection('messages').doc(messageId)
            .update({ deleted: true, deletedAt: admin.firestore.FieldValue.serverTimestamp() })
        return true
    } catch (err) {
        console.error('❌ markDeleted:', err.message)
        return false
    }
}

export async function findMessageByWhatsappId(whatsappId) {
    try {
        const snap = await db.collectionGroup('messages')
            .where('whatsappId', '==', whatsappId).limit(1).get()
        if (snap.empty) return null
        const doc = snap.docs[0]
        return { userId: doc.ref.parent.parent.id, messageId: doc.id, data: doc.data() }
    } catch (err) {
        return null
    }
}

export async function saveUser(userId, data) {
    try {
        await db.collection('users').doc(userId).set({
            ...data,
            lastSeen: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
    } catch (err) {
        console.error('❌ saveUser:', err.message)
    }
}

export async function getAIKeys() {
    try {
        const snap = await db.collection('config').doc('ai_keys').get()
        return snap.exists ? snap.data().keys || [] : []
    } catch (err) { return [] }
}

export async function saveAIKeys(keys) {
    await db.collection('config').doc('ai_keys').set({ keys })
}

export async function getImgBBKeys() {
    try {
        const snap = await db.collection('config').doc('imgbb_keys').get()
        return snap.exists ? snap.data().keys || [] : []
    } catch (err) { return [] }
}

export async function saveImgBBKeys(keys) {
    await db.collection('config').doc('imgbb_keys').set({ keys })
}

export async function getInstructions() {
    try {
        const snap = await db.collection('config').doc('instructions').get()
        return snap.exists ? snap.data().list || [] : []
    } catch (err) { return [] }
}

export async function saveInstructions(list) {
    await db.collection('config').doc('instructions').set({ list })
}

export async function getKnowledge() {
    try {
        const snap = await db.collection('config').doc('knowledge').get()
        return snap.exists ? snap.data() : {}
    } catch (err) { return {} }
}

export async function saveKnowledge(data) {
    await db.collection('config').doc('knowledge').set(data, { merge: true })
}

export async function getSettings() {
    try {
        const snap = await db.collection('config').doc('settings').get()
        return snap.exists ? snap.data() : { botEnabled: true }
    } catch (err) { return { botEnabled: true } }
}

export async function saveSettings(data) {
    await db.collection('config').doc('settings').set(data, { merge: true })
}

export async function getAllUsers() {
    try {
        const snap = await db.collection('users').orderBy('lastSeen', 'desc').limit(100).get()
        const users = []
        snap.forEach(doc => users.push({ id: doc.id, ...doc.data() }))
        return users
    } catch (err) { return [] }
}

export async function getUserMessages(userId, limit = 100) {
    try {
        const snap = await db.collection('chats').doc(userId)
            .collection('messages').orderBy('timestamp', 'desc').limit(limit).get()
        const msgs = []
        snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }))
        return msgs.reverse()
    } catch (err) { return [] }
}

export { db, admin }
