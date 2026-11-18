/*--------------------------------------------------------------------------------------
 *  OpenCursor agent-core tool step (compact) + patch accept/reject.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { ChevronRight, Check, X, FileText, Columns2 } from 'lucide-react';
import type { OpenCursorToolMessage } from '../../../../../common/chatThreadServiceTypes.js';
import { useAccessor } from '../../util/services.js';
import { voidOpenFileFn } from '../shared/pathUtils.js';
import { URI } from '../../../../../../../base/common/uri.js';

type Props = {
	message: OpenCursorToolMessage;
	isCheckpointGhost: boolean;
	threadId: string;
	messageIdx: number;
};

export const OpenCursorToolBubble = ({ message, isCheckpointGhost, threadId, messageIdx }: Props) => {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState(message.patchStatus);
	const [patchDiff, setPatchDiff] = useState<string | null>(null);
	const accessor = useAccessor();

	useEffect(() => {
		if (!open || !message.runId || !message.patchId) {
			return;
		}
		let cancelled = false;
		(async () => {
			const folder = accessor.get('IWorkspaceContextService').getWorkspace().folders[0];
			if (!folder) return;
			const result = await accessor.get('IOpenCursorPatchService').patch({
				workspaceRoot: folder.uri.fsPath,
				op: 'get',
				runId: message.runId,
			});
			if (!result.ok || !result.run || cancelled) return;
			const patches = (result.run as { patches?: { id: string; diff?: string }[] }).patches ?? [];
			const p = patches.find((x) => x.id === message.patchId);
			if (p?.diff) setPatchDiff(p.diff);
		})();
		return () => { cancelled = true; };
	}, [open, message.runId, message.patchId, accessor]);

	const argPreview = Object.entries(message.args || {})
		.slice(0, 3)
		.map(([k, v]) => `${k}=${String(v).slice(0, 80)}`)
		.join(', ');

	const canReview = message.patchId && message.runId && status === 'pending';
	const patchPath = message.patchPath || message.args?.path;

	const openPatchFile = () => {
		if (!patchPath) return;
		const folder = accessor.get('IWorkspaceContextService').getWorkspace().folders[0];
		if (!folder) return;
		voidOpenFileFn(URI.joinPath(folder.uri, patchPath), accessor);
	};

	const onPreviewDiff = async () => {
		if (!message.runId || !message.patchId) return;
		const err = await accessor.get('IChatThreadService').previewOpenCursorPatch(message.runId, message.patchId);
		if (err) {
			accessor.get('INotificationService').warn(err);
		}
	};

	const onPatch = async (op: 'accept' | 'reject') => {
		if (!message.runId || !message.patchId) return;
		setBusy(true);
		try {
			const workspace = accessor.get('IWorkspaceContextService');
			const folder = workspace.getWorkspace().folders[0];
			if (!folder) return;
			const patchService = accessor.get('IOpenCursorPatchService');
			const result = await patchService.patch({
				workspaceRoot: folder.uri.fsPath,
				op,
				runId: message.runId,
				patchId: message.patchId,
			});
			if (!result.ok) {
				accessor.get('INotificationService').error(result.error ?? `${op} failed`);
				return;
			}
			const next = op === 'accept' ? 'accepted' : 'rejected';
			setStatus(next);
			accessor.get('IChatThreadService').syncOpenCursorPatchStatus(message.runId, message.patchId, next);
			if (op === 'accept' && patchPath && folder) {
				await accessor.get('IFileService').readFile(URI.joinPath(folder.uri, patchPath)).then(async (disk) => {
					const uri = URI.joinPath(folder.uri, patchPath);
					const model = accessor.get('IModelService').getModel(uri);
					if (model) {
						model.setValue(disk.value.toString());
					} else {
						openPatchFile();
					}
				}).catch(() => openPatchFile());
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className={`my-1 mx-2 text-xs ${isCheckpointGhost ? 'opacity-50' : ''}`}>
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="flex items-center gap-1 text-void-fg-3 hover:text-void-fg-2 flex-1 text-left min-w-0"
					onClick={() => setOpen(o => !o)}
				>
					<ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
					<span className="font-medium text-void-fg-2">OpenCursor</span>
					<span className="truncate">{message.tool}</span>
					{patchPath ? <span className="truncate text-void-fg-4 max-w-[8rem]">{patchPath}</span> : null}
					{status === 'pending' && message.patchId ? <span className="text-void-warning shrink-0">patch</span> : null}
					{status === 'accepted' ? <span className="text-green-500 shrink-0">accepted</span> : null}
					{status === 'rejected' ? <span className="text-void-fg-4 shrink-0">rejected</span> : null}
				</button>
				{message.runId && message.patchId ? (
					<button type="button" className="p-0.5 shrink-0 hover:text-void-fg-2" title="Diff editor" onClick={() => void onPreviewDiff()}>
						<Columns2 className="w-3.5 h-3.5" />
					</button>
				) : null}
				{patchPath ? (
					<button type="button" className="p-0.5 shrink-0 hover:text-void-fg-2" title="Open file" onClick={openPatchFile}>
						<FileText className="w-3.5 h-3.5" />
					</button>
				) : null}
				{canReview && !busy ? (
					<span className="flex gap-1 shrink-0">
						<button type="button" className="p-0.5 hover:text-green-500" title="Accept patch" onClick={() => onPatch('accept')}>
							<Check className="w-3.5 h-3.5" />
						</button>
						<button type="button" className="p-0.5 hover:text-red-400" title="Reject patch" onClick={() => onPatch('reject')}>
							<X className="w-3.5 h-3.5" />
						</button>
					</span>
				) : null}
			</div>
			{open ? (
				<div className="ml-4 mt-1 p-2 rounded bg-void-bg-2 text-void-fg-3 whitespace-pre-wrap break-all max-h-64 overflow-auto">
					{patchDiff ? (
						<pre className="text-[10px] leading-snug mb-2 p-1 rounded bg-void-bg-1 overflow-x-auto">{patchDiff.slice(0, 8000)}</pre>
					) : null}
					{argPreview ? <div className="mb-1 opacity-80">{argPreview}</div> : null}
					{message.output.slice(0, 4000)}
				</div>
			) : null}
		</div>
	);
};
