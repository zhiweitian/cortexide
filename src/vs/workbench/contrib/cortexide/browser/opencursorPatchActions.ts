/*--------------------------------------------------------------------------------------
 *  Command palette: review pending OpenCursor patches.
 *--------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IOpenCursorPatchService } from '../common/opencursorPatchService.js';
import { IChatThreadService } from './chatThreadService.js';
import { openOpenCursorPatchDiff, reloadOpenCursorPatchedFile } from './opencursorPatchHelpers.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IEditCodeService } from './editCodeServiceInterface.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';

type PatchPick = IQuickPickItem & { runId: string; patchId: string; path: string };

type PendingPatch = { runId: string; patchId: string; path: string; diffPreview?: string; oldContent?: string; newContent?: string };

async function listPendingPatches(
	root: string,
	patches: IOpenCursorPatchService,
): Promise<PendingPatch[]> {
	const list = await patches.patch({ workspaceRoot: root, op: 'list' });
	if (!list.ok) {
		return [];
	}
	const items: PendingPatch[] = [];
	for (const run of list.runs ?? []) {
		if (!run.pending) {
			continue;
		}
		const detail = await patches.patch({ workspaceRoot: root, op: 'get', runId: run.id });
		if (!detail.ok || !detail.run) {
			continue;
		}
		const runObj = detail.run as { patches?: { id: string; path: string; status: string; diff?: string; oldContent?: string; newContent?: string }[] };
		for (const p of runObj.patches ?? []) {
			if (p.status !== 'pending') {
				continue;
			}
			items.push({
				runId: run.id,
				patchId: p.id,
				path: p.path,
				diffPreview: p.diff?.split('\n').slice(0, 12).join('\n'),
				oldContent: p.oldContent,
				newContent: p.newContent,
			});
		}
	}
	return items;
}

async function applyPatch(
	accessor: ServicesAccessor,
	root: string,
	op: 'accept' | 'reject',
	runId: string,
	patchId: string,
): Promise<{ ok: boolean; error?: string; path?: string }> {
	const patches = accessor.get(IOpenCursorPatchService);
	const chat = accessor.get(IChatThreadService);
	const workspace = accessor.get(IWorkspaceContextService);
	const result = await patches.patch({ workspaceRoot: root, op, runId, patchId });
	if (!result.ok) {
		return { ok: false, error: result.error };
	}
	chat.syncOpenCursorPatchStatus(runId, patchId, op === 'accept' ? 'accepted' : 'rejected', result.patch?.path);
	if (op === 'accept' && result.patch?.path) {
		const folder = workspace.getWorkspace().folders[0];
		if (folder) {
			await reloadOpenCursorPatchedFile(
				folder.uri,
				result.patch.path,
				accessor.get(IFileService),
				accessor.get(IModelService),
			);
		}
	}
	return { ok: true, path: result.patch?.path };
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: 'opencursor.reviewPendingPatches',
			title: localize2('opencursorReviewPatches', 'OpenCursor: Review pending patches'),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService);
		const patches = accessor.get(IOpenCursorPatchService);
		const quickInput = accessor.get(IQuickInputService);
		const notifications = accessor.get(INotificationService);

		const folder = workspace.getWorkspace().folders[0];
		if (!folder) {
			notifications.warn('Open a workspace folder first.');
			return;
		}

		const root = folder.uri.fsPath;
		const pending = await listPendingPatches(root, patches);
		if (!pending.length) {
			notifications.info('No pending OpenCursor patches.');
			return;
		}

		const items: PatchPick[] = pending.map((p) => ({
			label: p.path,
			description: p.runId.slice(0, 8),
			detail: p.diffPreview,
			runId: p.runId,
			patchId: p.patchId,
			path: p.path,
		}));

		const pick = await quickInput.pick(items, {
			placeHolder: 'Select a patch to accept or reject',
			canPickMany: false,
		});
		if (!pick) {
			return;
		}

		const selected = pending.find((p) => p.patchId === pick.patchId && p.runId === pick.runId);

		const action = await quickInput.pick([
			{ label: 'Preview in diff editor', id: 'preview' },
			{ label: 'Accept (write to disk)', id: 'accept' },
			{ label: 'Reject', id: 'reject' },
		], { placeHolder: pick.label });
		if (!action) {
			return;
		}

		if (action.id === 'preview' && selected) {
			await openOpenCursorPatchDiff(accessor, selected.path, selected.oldContent ?? '', selected.newContent ?? '');
			return;
		}

		const op = action.id === 'accept' ? 'accept' : 'reject';
		const result = await applyPatch(accessor, root, op, pick.runId, pick.patchId);
		if (!result.ok) {
			notifications.error(result.error ?? `${op} failed`);
			return;
		}
		notifications.info(`${op === 'accept' ? 'Accepted' : 'Rejected'}: ${pick.path}`);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: 'opencursor.acceptAllPendingPatches',
			title: localize2('opencursorAcceptAllPatches', 'OpenCursor: Accept all pending patches'),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService);
		const patches = accessor.get(IOpenCursorPatchService);
		const quickInput = accessor.get(IQuickInputService);
		const notifications = accessor.get(INotificationService);

		const folder = workspace.getWorkspace().folders[0];
		if (!folder) {
			notifications.warn('Open a workspace folder first.');
			return;
		}

		const root = folder.uri.fsPath;
		const pending = await listPendingPatches(root, patches);
		if (!pending.length) {
			notifications.info('No pending OpenCursor patches.');
			return;
		}

		const confirm = await quickInput.pick([
			{ label: `Accept all ${pending.length} patch(es)`, id: 'yes' },
			{ label: 'Cancel', id: 'no' },
		], { placeHolder: 'This writes every pending patch to disk' });
		if (!confirm || confirm.id !== 'yes') {
			return;
		}

		let ok = 0;
		let failed = 0;
		for (const p of pending) {
			const result = await applyPatch(accessor, root, 'accept', p.runId, p.patchId);
			if (result.ok) {
				ok++;
			} else {
				failed++;
			}
		}
		if (failed) {
			notifications.warn(`Accepted ${ok}, failed ${failed}.`);
		} else {
			notifications.info(`Accepted ${ok} patch(es).`);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: 'opencursor.previewPendingPatchDiff',
			title: localize2('opencursorPreviewPatchDiff', 'OpenCursor: Preview pending patch (diff editor)'),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService);
		const patches = accessor.get(IOpenCursorPatchService);
		const quickInput = accessor.get(IQuickInputService);
		const notifications = accessor.get(INotificationService);

		const folder = workspace.getWorkspace().folders[0];
		if (!folder) {
			notifications.warn('Open a workspace folder first.');
			return;
		}

		const root = folder.uri.fsPath;
		const pending = await listPendingPatches(root, patches);
		if (!pending.length) {
			notifications.info('No pending OpenCursor patches.');
			return;
		}

		const pick = await quickInput.pick(
			pending.map((p) => ({
				label: p.path,
				description: p.runId.slice(0, 8),
				runId: p.runId,
				patchId: p.patchId,
			})),
			{ placeHolder: 'Open diff editor for patch' },
		);
		if (!pick) {
			return;
		}

		const selected = pending.find((p) => p.patchId === (pick as { patchId: string }).patchId);
		if (!selected) {
			return;
		}
		await openOpenCursorPatchDiff(accessor, selected.path, selected.oldContent ?? '', selected.newContent ?? '');
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: 'opencursor.rebuildFileIndex',
			title: localize2('opencursorRebuildFileIndex', 'OpenCursor: Rebuild file index'),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService);
		const patches = accessor.get(IOpenCursorPatchService);
		const notifications = accessor.get(INotificationService);
		const folder = workspace.getWorkspace().folders[0];
		if (!folder) {
			notifications.warn('Open a workspace folder first.');
			return;
		}
		const res = await patches.patch({ workspaceRoot: folder.uri.fsPath, op: 'index' });
		if (!res.ok) {
			notifications.error(res.error || 'Index failed');
			return;
		}
		notifications.info(`Indexed ${res.files ?? 0} files.`);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: 'opencursor.rebuildSemanticIndex',
			title: localize2('opencursorRebuildSemanticIndex', 'OpenCursor: Rebuild semantic index'),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService);
		const patches = accessor.get(IOpenCursorPatchService);
		const notifications = accessor.get(INotificationService);
		const folder = workspace.getWorkspace().folders[0];
		if (!folder) {
			notifications.warn('Open a workspace folder first.');
			return;
		}
		const res = await patches.patch({ workspaceRoot: folder.uri.fsPath, op: 'embed' });
		if (!res.ok) {
			notifications.error(res.error || 'Semantic index failed');
			return;
		}
		notifications.info(`Semantic index: ${res.chunks ?? 0} chunks (${res.embedder || 'hash'}).`);
	}
});

function relFromEditorUri(uri: URI, folder: URI): string | undefined {
	const path = uri.path.replace(/\\/g, '/');
	const marked = path.match(/(?:^|\/)opencursor\/(.+) \((?:before|after)\)$/);
	if (marked?.[1]) {
		return marked[1];
	}
	if (uri.scheme !== 'file' && uri.scheme !== folder.scheme) {
		return undefined;
	}
	const root = folder.path.replace(/\\/g, '/').replace(/\/$/, '');
	if (path === root || path.startsWith(root + '/')) {
		return path.slice(root.length + 1);
	}
	return undefined;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: false,
			id: 'opencursor.applyEditorPatch',
			title: localize2('opencursorApplyEditorPatch', 'OpenCursor: Apply editor patch'),
		});
	}

	async run(accessor: ServicesAccessor, op: 'accept' | 'reject', allInFile: boolean): Promise<boolean> {
		const folder = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
		if (!folder) {
			return false;
		}
		const editorService = accessor.get(IEditorService);
		const uris = [
			EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }),
			EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.SECONDARY }),
		].filter((uri): uri is URI => !!uri);
		const rels = new Set(uris.map(uri => relFromEditorUri(uri, folder.uri)).filter((rel): rel is string => !!rel));
		if (!rels.size) {
			return false;
		}
		const patches = accessor.get(IOpenCursorPatchService);
		const list = await patches.patch({ workspaceRoot: folder.uri.fsPath, op: 'list' });
		if (!list.ok) {
			return false;
		}
		const matches: { runId: string; patchId: string }[] = [];
		for (const run of list.runs ?? []) {
			if (!run.pending) {
				continue;
			}
			const detail = await patches.patch({ workspaceRoot: folder.uri.fsPath, op: 'get', runId: run.id });
			const items = (detail.run as { patches?: { id: string; path: string; status: string }[] } | undefined)?.patches ?? [];
			for (const item of items) {
				if (item.status === 'pending' && rels.has(item.path)) {
					matches.push({ runId: run.id, patchId: item.id });
				}
			}
		}
		if (!matches.length) {
			return false;
		}
		const chosen = allInFile ? matches : [matches[matches.length - 1]];
		const chat = accessor.get(IChatThreadService);
		const fileService = accessor.get(IFileService);
		const modelService = accessor.get(IModelService);
		const editCode = accessor.get(IEditCodeService);
		const touched = new Set<string>();
		let applied = false;
		for (const item of chosen) {
			const result = await patches.patch({ workspaceRoot: folder.uri.fsPath, op, runId: item.runId, patchId: item.patchId });
			if (!result.ok) {
				continue;
			}
			applied = true;
			chat.syncOpenCursorPatchStatus(item.runId, item.patchId, op === 'accept' ? 'accepted' : 'rejected', result.patch?.path);
			if (result.patch?.path) {
				touched.add(result.patch.path);
			}
		}
		for (const rel of touched) {
			const uri = URI.joinPath(folder.uri, rel);
			await editCode.acceptOrRejectAllDiffAreas({ uri, removeCtrlKs: false, behavior: op === 'accept' ? 'accept' : 'reject' });
			if (op === 'accept') {
				await reloadOpenCursorPatchedFile(folder.uri, rel, fileService, modelService);
			}
		}
		return applied;
	}
});
