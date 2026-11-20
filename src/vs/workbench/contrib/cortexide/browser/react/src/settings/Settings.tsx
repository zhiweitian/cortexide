/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useState } from 'react';
import { OpenCursorApiEntry } from '../../../../common/cortexideSettingsTypes.js'
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js'
import { VoidSwitch } from '../util/inputs.js'
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'
import { WarningBox } from './WarningBox.js'
import { ToolApprovalType } from '../../../../common/toolsServiceTypes.js'
import { MCPServer } from '../../../../common/mcpServiceTypes.js';
import { useMCPServiceState } from '../util/services.js';
import { fetchOpenCursorModelIds, newOpenCursorApiId } from '../../../../common/openCursorApis.js'
import { useTranslation } from '../util/useTranslation.js'
import { VSBuffer } from '../../../../../../../base/common/buffer.js'

type Tab = 'api' | 'rules' | 'skills' | 'hooks' | 'mcp';

type ListedFile = { label: string; path: string }

const OpenCursorFileList = ({ kind }: { kind: 'rules' | 'skills' }) => {
	const accessor = useAccessor()
	const fileService = accessor.get('IFileService')
	const workspaceService = accessor.get('IWorkspaceContextService')
	const commandService = accessor.get('ICommandService')
	const notificationService = accessor.get('INotificationService')
	const patches = accessor.get('IOpenCursorPatchService')
	const [files, setFiles] = useState<ListedFile[]>([])
	const [off, setOff] = useState<string[]>([])
	const [tick, setTick] = useState(0)

	const rootUri = () => workspaceService.getWorkspace().folders[0]?.uri

	const at = (rel: string) => {
		const root = rootUri()
		if (!root) return undefined
		return root.with({ path: `${root.path}/${rel}` })
	}

	useEffect(() => {
		let stop = false
		const load = async () => {
			const root = rootUri()
			if (!root) {
				if (!stop) setFiles([])
				return
			}
			const next: ListedFile[] = []
			if (kind === 'rules') {
				const agents = at('AGENTS.md')
				if (agents && await fileService.exists(agents)) next.push({ label: 'AGENTS.md', path: 'AGENTS.md' })
				try {
					const dir = await fileService.resolve(at('.cursor/rules')!)
					for (const file of dir.children || []) {
						if (file.isDirectory) continue
						if (!file.name.endsWith('.md') && !file.name.endsWith('.mdc')) continue
						next.push({ label: file.name, path: `.cursor/rules/${file.name}` })
					}
				} catch { /* no rules dir */ }
			} else {
				for (const dirName of ['.cursor/skills', 'skills']) {
					try {
						const dir = await fileService.resolve(at(dirName)!)
						for (const ent of dir.children || []) {
							if (!ent.isDirectory) continue
							const rel = `${dirName}/${ent.name}/SKILL.md`
							if (await fileService.exists(at(rel)!)) next.push({ label: ent.name, path: rel })
						}
					} catch { /* no skills dir */ }
				}
			}
			if (!stop) setFiles(next)
			const rootPath = root.fsPath
			const listed = await patches.patch({ workspaceRoot: rootPath, op: 'context' })
			if (!stop && listed.ok) setOff(listed.off || [])
		}
		void load()
		return () => { stop = true }
	}, [kind, tick])

	const openRel = (rel: string) => {
		const uri = at(rel)
		if (!uri) {
			notificationService.warn('Open a folder first.')
			return
		}
		void commandService.executeCommand('vscode.open', uri)
	}

	const createFile = async () => {
		const root = rootUri()
		if (!root) {
			notificationService.warn('Open a folder first.')
			return
		}
		const rel = kind === 'rules'
			? `.cursor/rules/rule-${Date.now()}.md`
			: `.cursor/skills/new-skill/SKILL.md`
		const uri = at(rel)!
		const parentPath = uri.path.slice(0, uri.path.lastIndexOf('/'))
		try { await fileService.createFolder(uri.with({ path: parentPath })) } catch { /* already exists */ }
		const body = kind === 'rules'
			? '# Rule\n\nDescribe the rule here.\n'
			: '---\nname: new-skill\ndescription: What this skill is for\n---\n\n# New skill\n'
		try {
			await fileService.writeFile(uri, VSBuffer.fromString(body))
		} catch (err) {
			notificationService.error(String(err))
			return
		}
		setTick(n => n + 1)
		void commandService.executeCommand('vscode.open', uri)
	}

	const toggle = async (rel: string) => {
		const root = rootUri()
		if (!root) return
		const enabled = off.includes(rel)
		const listed = await patches.patch({ workspaceRoot: root.fsPath, op: 'context-set', path: rel, enabled })
		if (listed.ok) setOff(listed.off || [])
	}

	const title = kind === 'rules' ? 'Rules' : 'Skills'
	const blurb = kind === 'rules'
		? 'The agent reads AGENTS.md and .cursor/rules. Turn a row off to leave it out of the prompt.'
		: 'The agent reads SKILL.md under .cursor/skills and skills. Turn a row off to leave it out of the prompt.'

	return (
		<div>
			<h2 className='text-3xl mb-2'>{title}</h2>
			<h4 className='text-void-fg-3 mb-4 text-sm'>{blurb}</h4>
			<button type='button' className='btn btn-secondary btn-sm px-4 py-1 mb-4' onClick={() => { void createFile() }}>
				{kind === 'rules' ? 'New rule' : 'New skill'}
			</button>
			{files.length === 0 ? (
				<p className='text-void-fg-3 text-sm'>None yet.</p>
			) : (
				<div className='flex flex-col gap-2'>
					{files.map(file => (
						<div key={file.path} className='p-3 rounded border border-void-border-2 bg-void-bg-2 flex items-center gap-3'>
							<button type='button' className='min-w-0 flex-1 text-left' onClick={() => openRel(file.path)}>
								<div className='text-void-fg-1 text-sm font-medium'>{file.label}</div>
								<div className='text-void-fg-3 text-xs mt-1'>{file.path}</div>
							</button>
							<button type='button' className='shrink-0 text-xs px-2 py-1 rounded border border-void-border-3' onClick={() => { void toggle(file.path) }}>
								{off.includes(file.path) ? 'Off' : 'On'}
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	)
}



const HOOK_FILES = ['data/hooks.json', '.cursor/hooks.json']

const HooksSettings = () => {
	const accessor = useAccessor()
	const fileService = accessor.get('IFileService')
	const workspaceService = accessor.get('IWorkspaceContextService')
	const commandService = accessor.get('ICommandService')
	const notificationService = accessor.get('INotificationService')
	const [present, setPresent] = useState<string[]>([])
	const [tick, setTick] = useState(0)

	const rootUri = () => workspaceService.getWorkspace().folders[0]?.uri
	const at = (rel: string) => {
		const root = rootUri()
		if (!root) return undefined
		return root.with({ path: `${root.path}/${rel}` })
	}

	useEffect(() => {
		let stop = false
		const load = async () => {
			const found: string[] = []
			for (const rel of HOOK_FILES) {
				const uri = at(rel)
				if (uri && await fileService.exists(uri)) found.push(rel)
			}
			if (!stop) setPresent(found)
		}
		void load()
		return () => { stop = true }
	}, [tick])

	const openRel = (rel: string) => {
		const uri = at(rel)
		if (!uri) {
			notificationService.warn('Open a folder first.')
			return
		}
		void commandService.executeCommand('vscode.open', uri)
	}

	const createFile = async () => {
		const uri = at('data/hooks.json')
		if (!uri) {
			notificationService.warn('Open a folder first.')
			return
		}
		const parentPath = uri.path.slice(0, uri.path.lastIndexOf('/'))
		try { await fileService.createFolder(uri.with({ path: parentPath })) } catch { /* already exists */ }
		const body = '{\n  "hooks": [\n    { "event": "preTool", "command": "echo \\"$OPENCURSOR_HOOK_TOOL\\"" }\n  ]\n}\n'
		try {
			await fileService.writeFile(uri, VSBuffer.fromString(body))
		} catch (err) {
			notificationService.error(String(err))
			return
		}
		setTick(n => n + 1)
		void commandService.executeCommand('vscode.open', uri)
	}

	const used = present.includes('data/hooks.json') ? 'data/hooks.json' : present.includes('.cursor/hooks.json') ? '.cursor/hooks.json' : ''

	return <div>
		<h2 className='text-3xl mb-2'>Hooks</h2>
		<h4 className='text-void-fg-3 mb-4 text-sm'>The agent runs a shell command before a tool, after a tool, and when a turn stops. Events are preTool, postTool, and agentStop. If both files exist, only data/hooks.json is used.</h4>
		<button type='button' className='btn btn-secondary btn-sm px-4 py-1 mb-4' onClick={() => { void createFile() }}>New hook file</button>
		{present.length === 0 ? (
			<p className='text-void-fg-3 text-sm'>None yet.</p>
		) : (
			<div className='flex flex-col gap-2'>
				{present.map(rel => (
					<button key={rel} type='button' className='p-3 rounded border border-void-border-2 bg-void-bg-2 text-left' onClick={() => openRel(rel)}>
						<div className='text-void-fg-1 text-sm font-medium'>{rel}</div>
						<div className='text-void-fg-3 text-xs mt-1'>{rel === used ? 'Used by the agent' : 'Ignored while data/hooks.json exists'}</div>
					</button>
				))}
			</div>
		)}
	</div>
}

const RedoOnboardingButton = ({ className }: { className?: string }) => {
	const accessor = useAccessor()
	const cortexideSettingsService = accessor.get('ICortexideSettingsService')
	return <div
		className={`text-void-fg-4 flex flex-nowrap text-nowrap items-center hover:brightness-110 cursor-pointer ${className}`}
		onClick={() => { cortexideSettingsService.setGlobalSetting('isOnboardingComplete', false) }}
	>
		See onboarding screen?
	</div>

}







export const ToolApprovalTypeSwitch = ({ approvalType, size, desc }: { approvalType: ToolApprovalType, size: "xxs" | "xs" | "sm" | "sm+" | "md", desc: string }) => {
	const accessor = useAccessor()
	const cortexideSettingsService = accessor.get('ICortexideSettingsService')
	const voidSettingsState = useSettingsState()
	const metricsService = accessor.get('IMetricsService')

	const onToggleAutoApprove = useCallback((approvalType: ToolApprovalType, newValue: boolean) => {
		cortexideSettingsService.setGlobalSetting('autoApprove', {
			...cortexideSettingsService.state.globalSettings.autoApprove,
			[approvalType]: newValue
		})
		metricsService.capture('Tool Auto-Accept Toggle', { enabled: newValue })
	}, [cortexideSettingsService, metricsService])

	return <>
		<VoidSwitch
			size={size}
			value={voidSettingsState.globalSettings.autoApprove[approvalType] ?? false}
			onChange={(newVal) => onToggleAutoApprove(approvalType, newVal)}
		/>
		<span className="text-void-fg-3 text-xs">{desc}</span>
	</>
}




// MCP Server component
const MCPServerComponent = ({ name, server }: { name: string, server: MCPServer }) => {
	const accessor = useAccessor();
	const mcpService = accessor.get('IMCPService');

	const voidSettings = useSettingsState()
	const isOn = voidSettings.mcpUserStateOfName[name]?.isOn

	const removeUniquePrefix = (name: string) => name.split('_').slice(1).join('_')

	return (
		<div className="border border-void-border-2 bg-void-bg-1 py-3 px-4 rounded-sm my-2">
			<div className="flex items-center justify-between">
				{/* Left side - status and name */}
				<div className="flex items-center gap-2">
					{/* Status indicator */}
					<div className={`w-2 h-2 rounded-full
						${server.status === 'success' ? 'bg-green-500'
							: server.status === 'error' ? 'bg-red-500'
								: server.status === 'loading' ? 'bg-yellow-500'
									: server.status === 'offline' ? 'bg-void-fg-3'
										: ''}
					`}></div>

					{/* Server name */}
					<div className="text-sm font-medium text-void-fg-1">{name}</div>
				</div>

				{/* Right side - power toggle switch */}
				<VoidSwitch
					value={isOn ?? false}
					size='xs'
					disabled={server.status === 'error'}
					onChange={() => mcpService.toggleServerIsOn(name, !isOn)}
				/>
			</div>

			{/* Tools section */}
			{isOn && (
				<div className="mt-3">
					<div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
						{(server.tools ?? []).length > 0 ? (
							(server.tools ?? []).map((tool: { name: string; description?: string }) => (
								<span
									key={tool.name}
									className="px-2 py-0.5 bg-void-bg-2 text-void-fg-3 rounded-sm text-xs"

									data-tooltip-id='cortex-tooltip'
									data-tooltip-content={tool.description || ''}
									data-tooltip-class-name='void-max-w-[300px]'
								>
									{removeUniquePrefix(tool.name)}
								</span>
							))
						) : (
							<span className="text-xs text-void-fg-3">No tools available</span>
						)}
					</div>
				</div>
			)}

			{/* Command badge */}
			{isOn && server.command && (
				<div className="mt-3">
					<div className="text-xs text-void-fg-3 mb-1">Command:</div>
					<div className="px-2 py-1 bg-void-bg-2 text-xs font-mono overflow-x-auto whitespace-nowrap text-void-fg-2 rounded-sm">
						{server.command}
					</div>
				</div>
			)}

			{/* Error message if present */}
			{server.error && (
				<div className="mt-3">
					<WarningBox text={server.error} />
				</div>
			)}
		</div>
	);
};

// Main component that renders the list of servers
const MCPServersList = () => {
	const mcpServiceState = useMCPServiceState()

	let content: React.ReactNode
	if (mcpServiceState.error) {
		content = <div className="text-void-fg-3 text-sm mt-2">
			{mcpServiceState.error}
		</div>
	}
	else {
		const entries = Object.entries(mcpServiceState.mcpServerOfName)
		if (entries.length === 0) {
			content = <div className="text-void-fg-3 text-sm mt-2">
				No servers found
			</div>
		}
		else {
			content = entries.map(([name, server]) => (
				<MCPServerComponent key={name} name={name} server={server} />
			))
		}
	}

	return <div className="my-2">{content}</div>
};

const ApiSettings = () => {
	const accessor = useAccessor()
	const settingsService = accessor.get('ICortexideSettingsService')
	const state = useSettingsState()
	const apis = state.globalSettings.openCursorApis ?? []
	const selectedId = state.globalSettings.openCursorApiId || ''
	const selectedModel = state.globalSettings.openCursorModel || ''
	const [drafts, setDrafts] = useState<Record<string, { baseUrl: string; apiKey: string; pending: string }>>({})
	const [note, setNote] = useState('')
	const [loadingId, setLoadingId] = useState('')

	const draftOf = (api: OpenCursorApiEntry) => drafts[api.id] ?? { baseUrl: api.baseUrl, apiKey: api.apiKey, pending: '' }
	const setDraft = (id: string, patch: Partial<{ baseUrl: string; apiKey: string; pending: string }>, api: OpenCursorApiEntry) => {
		setDrafts(prev => ({
			...prev,
			[id]: { baseUrl: api.baseUrl, apiKey: api.apiKey, pending: '', ...prev[id], ...patch },
		}))
	}

	const write = async (next: OpenCursorApiEntry[], apiId: string, model: string) => {
		await settingsService.saveOpenCursorApis(next, apiId, model)
	}

	const commitDraft = (api: OpenCursorApiEntry) => {
		const draft = draftOf(api)
		const next = apis.map(item => item.id === api.id ? { ...item, baseUrl: draft.baseUrl.trim().replace(/\/$/, ''), apiKey: draft.apiKey.trim() } : item)
		void write(next, selectedId, selectedModel)
	}

	const addModelName = (api: OpenCursorApiEntry) => {
		const name = draftOf(api).pending.trim()
		if (!name) return
		const models = api.models.includes(name) ? api.models : [...api.models, name]
		const next = apis.map(item => item.id === api.id ? { ...item, baseUrl: draftOf(api).baseUrl.trim().replace(/\/$/, ''), apiKey: draftOf(api).apiKey.trim(), models } : item)
		setDraft(api.id, { pending: '' }, api)
		void write(next, api.id, name)
	}

	const removeModel = (api: OpenCursorApiEntry, model: string) => {
		const models = api.models.filter(item => item !== model)
		const next = apis.map(item => item.id === api.id ? { ...item, models } : item)
		const still = selectedId === api.id && selectedModel === model
		void write(next, still ? '' : selectedId, still ? '' : selectedModel)
	}

	const loadModels = async (api: OpenCursorApiEntry) => {
		const draft = draftOf(api)
		const url = draft.baseUrl.trim()
		const key = draft.apiKey.trim()
		if (!url || !key) {
			setNote('Fill in the API URL and key first.')
			return
		}
		setLoadingId(api.id)
		setNote('')
		try {
			const ids = await fetchOpenCursorModelIds(url, key)
			const models = [...api.models]
			for (const id of ids) {
				if (!models.includes(id)) models.push(id)
			}
			const next = apis.map(item => item.id === api.id ? { ...item, baseUrl: url.replace(/\/$/, ''), apiKey: key, models } : item)
			await write(next, selectedId, selectedModel || ids[0] || '')
			setNote(`Loaded ${ids.length} models.`)
		} catch (err) {
			setNote(err instanceof Error ? err.message : 'Could not load models.')
		} finally {
			setLoadingId('')
		}
	}

	return <div>
		<h2 className='text-3xl mb-2'>API</h2>
		<p className='text-sm text-void-fg-3 mb-3'>Add one or more keys. Each key can have several models. The filled model is the one Chat uses.</p>
		{apis.map(api => {
			const draft = draftOf(api)
			return <div key={api.id} className='mb-4 max-w-lg rounded border border-void-border-3 p-3'>
				<label className='block text-xs text-void-fg-3'>API URL</label>
				<input className='mt-1 w-full rounded border border-void-border-3 bg-void-bg-1 px-3 py-2 text-sm' value={draft.baseUrl} onChange={e => setDraft(api.id, { baseUrl: e.target.value }, api)} onBlur={() => commitDraft(api)} />
				<label className='mt-3 block text-xs text-void-fg-3'>API key</label>
				<input className='mt-1 w-full rounded border border-void-border-3 bg-void-bg-1 px-3 py-2 text-sm' type='password' value={draft.apiKey} onChange={e => setDraft(api.id, { apiKey: e.target.value }, api)} onBlur={() => commitDraft(api)} />
				<div className='mt-3 text-xs text-void-fg-3'>Models</div>
				<div className='mt-1 flex flex-wrap gap-1'>
					{api.models.map(model => {
						const on = api.id === selectedId && model === selectedModel
						return <button key={model} type='button' className={`rounded border px-2 py-0.5 text-xs ${on ? 'border-white text-void-fg-1' : 'border-void-border-3 text-void-fg-3'}`} onClick={() => { void write(apis, api.id, model) }}>
							{model}
							<span className='ml-1 text-void-fg-3' onClick={e => { e.stopPropagation(); removeModel(api, model) }}>×</span>
						</button>
					})}
				</div>
				<div className='mt-2 flex gap-2'>
					<input className='min-w-0 flex-1 rounded border border-void-border-3 bg-void-bg-1 px-3 py-1.5 text-sm' placeholder='model name' value={draft.pending} onChange={e => setDraft(api.id, { pending: e.target.value }, api)} onKeyDown={e => { if (e.key === 'Enter') addModelName(api) }} />
					<button type='button' className='btn btn-secondary btn-sm' onClick={() => addModelName(api)}>Add</button>
					<button type='button' className='btn btn-secondary btn-sm' disabled={loadingId === api.id} onClick={() => { void loadModels(api) }}>{loadingId === api.id ? 'Loading…' : 'Load models'}</button>
				</div>
				<button type='button' className='mt-2 text-xs text-void-fg-3' onClick={() => { void write(apis.filter(item => item.id !== api.id), selectedId === api.id ? '' : selectedId, selectedId === api.id ? '' : selectedModel) }}>Remove key</button>
			</div>
		})}
		<div className='flex items-center gap-3'>
			<button type='button' className='btn btn-primary btn-sm' onClick={() => { void write([...apis, { id: newOpenCursorApiId(), baseUrl: 'https://api.deepseek.com', apiKey: '', models: [] }], selectedId, selectedModel) }}>Add a key</button>
			{note ? <span className='text-xs text-void-fg-3'>{note}</span> : null}
		</div>
		<div className='mt-8 max-w-lg'>
			<h3 className='text-base mb-1'>Tab completion</h3>
			<p className='text-xs text-void-fg-3 mb-2'>Leave the URL empty to keep the local prefix. A URL is a small completion endpoint, separate from Chat.</p>
			<label className='block text-xs text-void-fg-3'>Completion URL</label>
			<input className='mt-1 w-full rounded border border-void-border-3 bg-void-bg-1 px-3 py-2 text-sm' value={state.globalSettings.openCursorCompleteUrl || ''} onChange={e => { void settingsService.setGlobalSetting('openCursorCompleteUrl', e.target.value) }} />
			<label className='mt-3 block text-xs text-void-fg-3'>Completion model</label>
			<input className='mt-1 w-full rounded border border-void-border-3 bg-void-bg-1 px-3 py-2 text-sm' placeholder='complete' value={state.globalSettings.openCursorCompleteModel || ''} onChange={e => { void settingsService.setGlobalSetting('openCursorCompleteModel', e.target.value) }} />
		</div>
	</div>
}

export const Settings = () => {
	const isDark = useIsDark()
	const { t } = useTranslation()
	// --- sidebar nav ---
	const [selectedSection, setSelectedSection] =
		useState<Tab>('api');

	const navItems: { tab: Tab; label: string }[] = [
		{ tab: 'api', label: 'API' },
		{ tab: 'rules', label: 'Rules' },
		{ tab: 'skills', label: 'Skills' },
		{ tab: 'hooks', label: 'Hooks' },
		{ tab: 'mcp', label: t('settings.mcpShort') },
	];
	const shouldShowTab = (tab: Tab) => selectedSection === tab;
	const accessor = useAccessor()
	const mcpService = accessor.get('IMCPService')

	return (
		<div
			className={`@@void-scope ${isDark ? 'dark' : ''}`}
			style={{
				height: '100%',
				width: '100%',
				overflow: 'auto',
				backgroundColor: 'var(--vscode-editor-background)',
			}}
		>
			<div className="flex flex-col md:flex-row w-full gap-6 max-w-[900px] mx-auto mb-32" style={{ minHeight: '80vh' }}>
				{/* --- SIDEBAR --- */}

				<aside className="md:w-1/4 w-full p-6 shrink-0">
					{/* vertical tab list */}
					<div className="flex flex-col gap-2 mt-12">
						{navItems.map(({ tab, label }) => (
							<button
								key={tab}
								type="button"
								onClick={() => setSelectedSection(tab)}
								className={`btn btn-sm w-full justify-start text-left py-2 px-4 ${
									selectedSection === tab ? 'btn-primary' : 'btn-secondary'
								}`}
							>
								{label}
							</button>
						))}
					</div>
				</aside>

				{/* --- MAIN PANE --- */}
				<main className="flex-1 p-6 select-none">



					<div className='max-w-3xl'>

						<h1 className='text-2xl w-full'>{`OpenCursor Settings`}</h1>

						<div className='w-full h-[1px] my-2' />

						{/* Models section (formerly FeaturesTab) */}
						<ErrorBoundary>
							<RedoOnboardingButton />
						</ErrorBoundary>

						<div className='w-full h-[1px] my-4' />

						{/* All sections in flex container with gap-12 */}
						<div className='flex flex-col gap-12'>
							<div className={shouldShowTab('api') ? `` : 'hidden'}>
								<ApiSettings />
							</div>
							<div className={shouldShowTab('rules') ? `` : 'hidden'}>
								<OpenCursorFileList kind='rules' />
							</div>
							<div className={shouldShowTab('skills') ? `` : 'hidden'}>
								<OpenCursorFileList kind='skills' />
							</div>
							<div className={shouldShowTab('hooks') ? `` : 'hidden'}>
								<HooksSettings />
							</div>

							{/* MCP section */}
							<div className={shouldShowTab('mcp') ? `` : 'hidden'}>
								<ErrorBoundary>
									<h2 className='text-3xl mb-2'>MCP</h2>
									<h4 className={`text-void-fg-3 mb-4`}>
										<ChatMarkdownRender inPTag={true} string={`
Use Model Context Protocol to provide Agent mode with more tools.
							`} chatMessageLocation={undefined} />
									</h4>
									<div className='my-2 flex flex-wrap gap-2'>
										<button type="button" className="btn btn-secondary btn-sm px-4 py-1 max-w-48" onClick={async () => { await mcpService.revealMCPConfigFile() }}>
											Add MCP Server
										</button>
										<button
											type="button"
											className="btn btn-secondary btn-sm px-4 py-1 max-w-64"
											onClick={async () => {
												try {
													const result = await mcpService.addRecommendedMCPServer('playwright')
													accessor.get('INotificationService').info(
														result === 'added'
															? 'Added the Playwright MCP server (browser automation) to mcp.json. It connects via npx on first use.'
															: 'A "playwright" MCP server is already in your mcp.json.'
													)
												} catch (e) {
													accessor.get('INotificationService').error(`Could not add Playwright MCP: ${e}`)
												}
											}}
										>
											+ Playwright (browser automation)
										</button>
									</div>

									<ErrorBoundary>
										<MCPServersList />
									</ErrorBoundary>
								</ErrorBoundary>
							</div>





						</div>

					</div>
				</main>
			</div>
		</div>
	);
}
