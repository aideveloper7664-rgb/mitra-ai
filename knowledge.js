import { getKnowledge, saveKnowledge } from './firebase.js'

export async function getKnowledgeBase() {
    return await getKnowledge()
}

export async function updateKnowledge(data) {
    await saveKnowledge(data)
    return true
}

export function getDefaultKnowledge() {
    return {
        assistantName: 'Mitra AI',
        sirName: 'Tech Bhai',
        sirIntro: 'Content creator hain, tech videos banate hain',
        youtube: '',
        telegram: '',
        website: '',
        app: '',
        busyMessage: 'Sir abhi busy hain, main unki taraf se baat kar raha hun',
        note: ''
    }
}
