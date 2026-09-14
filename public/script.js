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

// ========== WHATSAPP CONNECT ==========
async function connectWhatsApp() {
    const countryCode = document.getElementById('wa-country').value
    const phoneNumber = document.getElementById('wa-phone').value.trim()
    const statusDiv = document.getElementById('wa-status')

    if (!phoneNumber) {
        statusDiv.innerHTML = '<p style="color:#ef4444">Phone number daalo!</p>'
        return
    }

    statusDiv.innerHTML = '<p style="color:#94a3b8">⏳ Connecting... (10-15 second lag sakte hain)</p>'

    try {
        const res = await fetch('/api/whatsapp/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryCode, phoneNumber })
        })

        const data = await res.json()

        if (data.success && data.code) {
            statusDiv.innerHTML = `
                <div style="background:#065f46; padding:20px; border-radius:8px; margin-top:16px;">
                    <h3 style="color:#6ee7b7; margin:0 0 12px 0;">📱 Pairing Code</h3>
                    <p style="font-size:36px; font-weight:bold; color:#fff; letter-spacing:6px; margin:12px 0; font-family:monospace;">${data.code}</p>
                    <p style="color:#cbd5e1; font-size:14px; margin-top:12px;">
                        1. WhatsApp kholo<br>
                        2. Settings → Linked Devices<br>
                        3. Link a Device → Link with phone number<br>
                        4. Ye code daalo
                    </p>
                </div>
            `
        } else {
            statusDiv.innerHTML = `<p style="color:#ef4444">❌ ${data.error || 'Connect nahi ho pa raha'}</p>`
        }
    } catch (err) {
        statusDiv.innerHTML = `<p style="color:#ef4444">❌ Error: ${err.message}</p>`
    }
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
