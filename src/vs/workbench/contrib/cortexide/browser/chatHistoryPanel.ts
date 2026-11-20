type Listener = (open: boolean) => void

type PanelState = { open: boolean; listeners: Set<Listener> }

const key = '__opencursorChatHistory'

const panelState = (): PanelState => {
	const g = globalThis as typeof globalThis & { [key]?: PanelState }
	if (!g[key]) g[key] = { open: false, listeners: new Set() }
	return g[key]
}

export const isChatHistoryOpen = () => panelState().open

export const toggleChatHistory = () => {
	const state = panelState()
	state.open = !state.open
	for (const listener of state.listeners) listener(state.open)
	return state.open
}

export const onDidChangeChatHistory = (listener: Listener) => {
	const { listeners } = panelState()
	listeners.add(listener)
	return () => { listeners.delete(listener) }
}
