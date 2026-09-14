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
    container.innerHTML = '<p style="color:#94a
