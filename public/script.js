// ========== TABS ==========
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
        tab.classList.add('active')
        document.getElementById(tab.dataset.tab).classList.add('active')
        loadTab(tab.dataset.tab)
    })
})

function loadTab(name) {
    if (name === 'dashboard') loadStatus()
    if (name === 'whatsapp') loadWhatsAppStatus()
    if (name === 'ai-keys') loadAIKeys()
    if (name === 'imgbb-keys') loadImgBBKeys()
    if (name === 'instructions') loadInstructions()
    if (name === 'knowledge') loadKnowledge()
    if (name === 'chats') loadUsers()
}

// ========== STATUS ==========
async function loadStatus() {
    const res = await fetch('/api/status')
    const d = await res.json()
    const badge = document.getElementById('bot-status')
    badge.textContent = d.botEnabled ? 'ON' : 'OFF'
    badge.className = 'status-badge ' + (d.botEnabled ? 'on' : 'off')
    document.getElementById('ai-count').textContent = d.aiKeysCount
    document.getElementById('ai-active').textContent = d.aiKeysActive
    document.getElementById('imgbb-count').textContent = d.imgbbKeysCount
    document.getElementById('imgbb-active').textContent = d.imgbbKeysActive
}

document.getElementById('toggle-bot')?.addEventListener('click', async () => {
    await fetch('/api/bot/toggle', { method: 'POST' })
    loadStatus()
})

// ========== WHATSAPP ==========
async function loadWhatsAppStatus() {
    try {
        const res = await fetch('/api/whatsapp/status')
        const data = await res.json()

        const connectedDiv = document.getElementById('wa-connected')
        const notConnectedDiv = document.getElementById('wa-not-connected')

        if (data.connected) {
            connectedDiv.style.display = 'block'
            notConnectedDiv.style.display = 'none'
            document.getElementById('wa-connected-number').textContent =
                data.phoneNumber ? `Number: +${data.phoneNumber}` : ''
        } else {
            connectedDiv.style.display = 'none'
            notConnectedDiv.style.display = 'block'
        }
    } catch (err) {
        console.error('WhatsApp status error:', err)
    }
}

async function showQR() {
    const container = document.getElementById('wa-qr-container')
    container.innerHTML = '<p style="color:#94a3b8">⏳ QR load ho raha hai...</p>'

    try {
        const res = await fetch('/api/whatsapp/qr')
        const data = await res.json()

        if (data.connected) {
            container.innerHTML = '<p style="color:#6ee7b7">✅ Already connected!</p>'
            loadWhatsAppStatus()
            return
        }

        if (!data.qr) {
            container.innerHTML = '<p style="color:#f59e0b">⏳ QR ready nahi hai. 5 second baad phir try karo.</p>'
            setTimeout(showQR, 5000)
            return
        }

        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.qr)}`

        container.innerHTML = `
            <div class="wa-qr-box">
                <img src="${qrImageUrl}" alt="QR Code" style="width:250px; height:250px;">
                <p style="color:#64748b; font-size:12px; margin-top:8px;">
                    WhatsApp → Linked Devices → Link a Device
                </p>
                <button onclick="showQR()" class="btn btn-sm" style="margin-top:8px;">🔄 Refresh QR</button>
            </div>
        `
    } catch (err) {
        container.innerHTML = `<p style="color:#ef4444">❌ Error: ${err.message}</p>`
    }
}

async function requestPairingCode() {
    const countryCode = document.getElementById('wa-country').value
    const phoneNumber = document.getElementById('wa-phone').value.trim()
    const container = document.getElementById('wa-pairing-container')

    if (!phoneNumber) {
        container.innerHTML = '<p style="color:#ef4444">Phone number daalo!</p>'
        return
    }

    container.innerHTML = '<p style="color:#94a3b8">⏳ Code generate ho raha hai...</p>'

    try {
        const res = await fetch('/api/whatsapp/pairing-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryCode, phoneNumber })
        })

        const data = await res.json()

        if (data.success && data.code) {
            container.innerHTML = `
                <div class="wa-pairing-code">
                    <p style="color:#6ee7b7; margin:0 0 8px 0;">📱 Pairing Code</p>
                    <p class="code">${data.code}</p>
                    <p style="color:#cbd5e1; font-size:12px; margin-top:12px;">
                        WhatsApp → Settings → Linked Devices →<br>
                        Link a Device → Link with phone number
                    </p>
                </div>
            `
        } else {
            container.innerHTML = `<p style="color:#ef4444">❌ ${data.error || 'Code generate nahi hua'}</p>`
        }
    } catch (err) {
        container.innerHTML = `<p style="color:#ef4444">❌ Error: ${err.message}</p>`
    }
}

async function disconnectWhatsApp() {
    if (!confirm('WhatsApp disconnect karna hai?')) return
    await fetch('/api/whatsapp/disconnect', { method: 'POST' })
    loadWhatsAppStatus()
}

// ========== AI KEYS ==========
async function loadAIKeys() {
    const res = await fetch('/api/ai-keys')
    const keys = await res.json()
    const list = document.getElementById('ai-keys-list')
    list.innerHTML = keys.length ? '' : '<p style="color:#64748b">Koi key nahi. Add karo.</p>'
    keys.forEach(k => {
        const div = document.createElement('div')
        div.className = 'item'
        div.innerHTML = `
            <div class="item-info">
                <strong>${k.provider.toUpperCase()} - ${k.label}</strong>
                <small>${k.key.substring(0, 12)}...${k.key.slice(-4)} | Uses: ${k.usageCount || 0} | ${k.active ? '✅ Active' : '❌ Disabled'}</small>
            </div>
            <div class="item-actions">
                <button class="btn btn-sm" onclick="toggleAIKey('${k.id}', ${k.active})">${k.active ? 'Disable' : 'Enable'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteAIKey('${k.id}')">Delete</button>
            </div>
        `
        list.appendChild(div)
    })
}

async function addAIKey() {
    const provider = document.getElementById('ai-provider').value
    const label = document.getElementById('ai-label').value
    const key = document.getElementById('ai-key').value
    const model = document.getElementById('ai-model').value
    if (!label || !key) return alert('Label aur key bharo')
    await fetch('/api/ai-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, label, key, model })
    })
    document.getElementById('ai-label').value = ''
    document.getElementById('ai-key').value = ''
    document.getElementById('ai-model').value = ''
    loadAIKeys()
}

async function toggleAIKey(id, currentActive) {
    await fetch(`/api/ai-keys/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
    })
    loadAIKeys()
}

async function deleteAIKey(id) {
    if (!confirm('Delete karna hai?')) return
    await fetch(`/api/ai-keys/${id}`, { method: 'DELETE' })
    loadAIKeys()
}

// ========== IMGBB KEYS ==========
async function loadImgBBKeys() {
    const res = await fetch('/api/imgbb-keys')
    const keys = await res.json()
    const list = document.getElementById('imgbb-keys-list')
    list.innerHTML = keys.length ? '' : '<p style="color:#64748b">Koi key nahi.</p>'
    keys.forEach(k => {
        const div = document.createElement('div')
        div.className = 'item'
        div.innerHTML = `
            <div class="item-info">
                <strong>${k.label}</strong>
                <small>${k.key.substring(0, 8)}... | Uses: ${k.usageCount || 0} | ${k.active ? '✅' : '❌'}</small>
            </div>
            <div class="item-actions">
                <button class="btn btn-sm" onclick="toggleImgBBKey('${k.id}', ${k.active})">${k.active ? 'Disable' : 'Enable'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteImgBBKey('${k.id}')">Delete</button>
            </div>
        `
        list.appendChild(div)
    })
}

async function addImgBBKey() {
    const label = document.getElementById('imgbb-label').value
    const key = document.getElementById('imgbb-key').value
    if (!label || !key) return alert('Label aur key bharo')
    await fetch('/api/imgbb-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, key })
    })
    document.getElementById('imgbb-label').value = ''
    document.getElementById('imgbb-key').value = ''
    loadImgBBKeys()
}

async function toggleImgBBKey(id, currentActive) {
    await fetch(`/api/imgbb-keys/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
    })
    loadImgBBKeys()
}

async function deleteImgBBKey(id) {
    if (!confirm('Delete?')) return
    await fetch(`/api/imgbb-keys/${id}`, { method: 'DELETE' })
    loadImgBBKeys()
}

// ========== INSTRUCTIONS ==========
async function loadInstructions() {
    const res = await fetch('/api/instructions')
    const list = await res.json()
    const el = document.getElementById('instructions-list')
    el.innerHTML = list.length ? '' : '<p style="color:#64748b">Koi instruction nahi.</p>'
    list.forEach(i => {
        const div = document.createElement('div')
        div.className = 'item'
        div.innerHTML = `
            <div class="item-info"><strong>${i.text}</strong></div>
            <div class="item-actions">
                <button class="btn btn-sm" onclick="editInstruction('${i.id}', '${i.text.replace(/'/g, "\\'")}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteInstruction('${i.id}')">Delete</button>
            </div>
        `
        el.appendChild(div)
    })
}

async function addInstruction() {
    const text = document.getElementById('instr-text').value
    if (!text) return
    await fetch('/api/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    })
    document.getElementById('instr-text').value = ''
    loadInstructions()
}

async function editInstruction(id, oldText) {
    const text = prompt('Edit instruction:', oldText)
    if (!text) return
    await fetch(`/api/instructions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    })
    loadInstructions()
}

async function deleteInstruction(id) {
    if (!confirm('Delete?')) return
    await fetch(`/api/instructions/${id}`, { method: 'DELETE' })
    loadInstructions()
}

// ========== KNOWLEDGE ==========
async function loadKnowledge() {
    const res = await fetch('/api/knowledge')
    const k = await res.json()
    ;['assistantName','sirName','sirIntro','youtube','telegram','website','app','busyMessage','note'].forEach(f => {
        const el = document.getElementById('k-' + f)
        if (el) el.value = k[f] || ''
    })
}

async function saveKnowledge() {
    const data = {}
    ;['assistantName','sirName','sirIntro','youtube','telegram','website','app','busyMessage','note'].forEach(f => {
        const el = document.getElementById('k-' + f)
        if (el) data[f] = el.value
    })
    await fetch('/api/knowledge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    alert('Saved!')
}

// ========== CHATS ==========
async function loadUsers() {
    const res = await fetch('/api/users')
    const users = await res.json()
    const el = document.getElementById('users-list')
    el.innerHTML = users.length ? '' : '<p style="color:#64748b">Koi user nahi.</p>'
    users.forEach(u => {
        const div = document.createElement('div')
        div.className = 'item'
        div.innerHTML = `
            <div class="item-info">
                <strong>${u.name || 'Unknown'}</strong>
                <small>${u.id.split('@')[0]}</small>
            </div>
            <div class="item-actions">
                <button class="btn btn-sm" onclick="loadMessages('${u.id}')">View</button>
            </div>
        `
        el.appendChild(div)
    })
}

async function loadMessages(userId) {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}/messages`)
    const msgs = await res.json()
    const el = document.getElementById('user-messages')
    el.innerHTML = ''
    msgs.forEach(m => {
        const div = document.createElement('div')
        div.className = `msg ${m.sender === 'bot' ? 'bot' : 'user'} ${m.deleted ? 'deleted' : ''}`
        let content = m.content || `[${m.type}]`
        if (m.mediaUrl) content += ` <a href="${m.mediaUrl}" target="_blank">🔗 media</a>`
        if (m.deleted) content += ' 🗑️'
        div.innerHTML = `${content}<small>${new Date(m.timestamp).toLocaleString()} ${m.sender === 'bot' ? '(bot)' : '(user)'}</small>`
        el.appendChild(div)
    })
}

// Initial
loadStatus()
