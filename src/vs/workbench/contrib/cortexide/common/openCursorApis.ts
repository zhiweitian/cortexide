/*--------------------------------------------------------------------------------------
 *  OpenCursor API keys. One key can list several model names.
 *--------------------------------------------------------------------------------------*/

import { OpenCursorApiEntry } from './cortexideSettingsTypes.js';

export function newOpenCursorApiId(): string {
	return `api-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function sanitizeOpenCursorApis(apis: OpenCursorApiEntry[] | undefined): OpenCursorApiEntry[] {
	if (!Array.isArray(apis)) return [];
	const seen = new Set<string>();
	const out: OpenCursorApiEntry[] = [];
	for (const api of apis) {
		const id = (api?.id || '').trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const models: string[] = [];
		for (const name of api.models || []) {
			const model = String(name || '').trim();
			if (model && !models.includes(model)) models.push(model);
		}
		out.push({
			id,
			baseUrl: (api.baseUrl || '').trim().replace(/\/$/, ''),
			apiKey: (api.apiKey || '').trim(),
			models,
		});
	}
	return out;
}

export function pickOpenCursorSelection(apis: OpenCursorApiEntry[], apiId: string, model: string): { id: string; model: string; baseUrl: string; apiKey: string } | undefined {
	const entry = apis.find(api => api.id === apiId && api.models.includes(model))
		|| apis.find(api => api.id === apiId && api.models.length > 0)
		|| apis.find(api => api.models.length > 0);
	if (!entry) return undefined;
	const modelName = entry.models.includes(model) ? model : entry.models[0];
	return { id: entry.id, model: modelName, baseUrl: entry.baseUrl, apiKey: entry.apiKey };
}

export function openCursorModelChoices(apis: OpenCursorApiEntry[]): { id: string; model: string; baseUrl: string }[] {
	const choices: { id: string; model: string; baseUrl: string }[] = [];
	for (const api of apis) {
		for (const model of api.models) {
			choices.push({ id: api.id, model, baseUrl: api.baseUrl });
		}
	}
	return choices;
}

export function openCursorHost(baseUrl: string): string {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
}

/** OpenAI-compatible GET /models. Tries /v1/models and /models. */
export async function fetchOpenCursorModelIds(baseUrl: string, apiKey: string): Promise<string[]> {
	const root = baseUrl.trim().replace(/\/$/, '');
	const urls = root.endsWith('/v1') ? [`${root}/models`] : [`${root}/v1/models`, `${root}/models`];
	let detail = 'Could not load models';
	for (const url of urls) {
		try {
			const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
			if (!res.ok) {
				detail = `${res.status}`;
				continue;
			}
			const json = await res.json() as { data?: { id?: string }[] };
			const ids = (json.data ?? []).map(item => item.id).filter((id): id is string => !!id);
			if (ids.length) return [...new Set(ids)];
			detail = 'No models in the response';
		} catch (err) {
			detail = err instanceof Error ? err.message : 'Request failed';
		}
	}
	throw new Error(detail);
}
