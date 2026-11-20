/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See License.txt for more information.
 *
 *  First launch: API base URL, API key, and model. No account login, no Ollama install.
 *--------------------------------------------------------------------------------------*/

import { useState } from 'react';
import { useAccessor } from '../util/services.js';
import { newOpenCursorApiId } from '../../../../common/openCursorApis.js';

interface ExpressOnboardingFlowProps {
	onCustomize: () => void;
	onDismiss: () => void;
}

export const ExpressOnboardingFlow = ({ onDismiss }: ExpressOnboardingFlowProps) => {
	const accessor = useAccessor();
	const settingsService = accessor.get('ICortexideSettingsService');
	const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState('deepseek-flash');
	const [error, setError] = useState('');

	const save = async () => {
		const url = baseUrl.trim().replace(/\/$/, '');
		const key = apiKey.trim();
		const modelName = model.trim();
		if (!url || !key || !modelName) {
			setError('Fill in the API URL, key, and model.');
			return;
		}
		setError('');
		await settingsService.saveOpenCursorApis([{
			id: newOpenCursorApiId(),
			baseUrl: url,
			apiKey: key,
			models: [modelName],
		}], '', modelName);
		settingsService.setGlobalSetting('isOnboardingComplete', true);
		onDismiss();
	};

	return (
		<div className="mx-auto w-full max-w-md rounded-xl border border-void-border-3 bg-void-bg-2 px-6 py-5 text-void-fg-1">
			<h1 className="text-lg font-semibold">OpenCursor</h1>
			<p className="mt-1 text-sm text-void-fg-3">API URL, key, and a model. Add more keys and models later in Settings.</p>
			<label className="mt-4 block text-xs text-void-fg-3">API URL</label>
			<input className="mt-1 w-full rounded border border-void-border-3 bg-void-bg-1 px-3 py-2 text-sm" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
			<label className="mt-3 block text-xs text-void-fg-3">API key</label>
			<input className="mt-1 w-full rounded border border-void-border-3 bg-void-bg-1 px-3 py-2 text-sm" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
			<label className="mt-3 block text-xs text-void-fg-3">Model</label>
			<input className="mt-1 w-full rounded border border-void-border-3 bg-void-bg-1 px-3 py-2 text-sm" value={model} onChange={(e) => setModel(e.target.value)} />
			{error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
			<div className="mt-5 flex gap-3">
				<button className="rounded bg-white px-3 py-2 text-sm font-medium text-black" onClick={() => { void save(); }}>Continue</button>
				<button className="rounded px-3 py-2 text-sm text-void-fg-3" onClick={onDismiss}>Skip for now</button>
			</div>
		</div>
	);
};
