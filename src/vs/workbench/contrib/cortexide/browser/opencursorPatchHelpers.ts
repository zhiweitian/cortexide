/*--------------------------------------------------------------------------------------
 *  Shared OpenCursor patch UI helpers (diff editor, chat sync).
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { IOpenCursorPatchService } from '../common/opencursorPatchService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { EndOfLinePreference } from '../../../../editor/common/model.js';
import { ICortexideModelService } from '../common/cortexideModelService.js';
import { IEditCodeService } from './editCodeServiceInterface.js';

export type OpenCursorRunPatch = {
	id: string;
	path: string;
	status: string;
	diff?: string;
	oldContent?: string;
	newContent?: string;
};

export function patchFromRun(run: unknown, patchId: string): OpenCursorRunPatch | undefined {
	const patches = (run as { patches?: OpenCursorRunPatch[] })?.patches ?? [];
	return patches.find((p) => p.id === patchId);
}

export async function openOpenCursorPatchDiffWithServices(
	relPath: string,
	oldContent: string,
	newContent: string,
	services: {
		untitled: IUntitledTextEditorService;
		commands: ICommandService;
		langService: ILanguageService;
		workspaceFolder: URI | undefined;
	},
): Promise<void> {
	const fileUri = services.workspaceFolder
		? URI.joinPath(services.workspaceFolder, relPath)
		: URI.file(relPath);
	const languageId = services.langService.createByFilepathOrFirstLine(fileUri, newContent).languageId;

	const original = await services.untitled.resolve({
		untitledResource: URI.from({ scheme: Schemas.untitled, path: `opencursor/${relPath} (before)` }),
		initialValue: oldContent,
		languageId,
	});
	const modified = await services.untitled.resolve({
		untitledResource: URI.from({ scheme: Schemas.untitled, path: `opencursor/${relPath} (after)` }),
		initialValue: newContent,
		languageId,
	});

	await services.commands.executeCommand(
		'vscode.diff',
		original.resource,
		modified.resource,
		`${relPath} (OpenCursor)`,
		{ preview: true },
	);
}

export async function openOpenCursorPatchDiff(
	accessor: ServicesAccessor,
	relPath: string,
	oldContent: string,
	newContent: string,
): Promise<void> {
	const folder = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
	await openOpenCursorPatchDiffWithServices(relPath, oldContent, newContent, {
		untitled: accessor.get(IUntitledTextEditorService),
		commands: accessor.get(ICommandService),
		langService: accessor.get(ILanguageService),
		workspaceFolder: folder?.uri,
	});
}

/** After accept, sync in-memory editor buffer with disk (if file is open). */
export async function reloadOpenCursorPatchedFile(
	workspaceFolder: URI,
	relPath: string,
	fileService: IFileService,
	modelService: IModelService,
): Promise<void> {
	const uri = URI.joinPath(workspaceFolder, relPath);
	const model = modelService.getModel(uri);
	if (!(await fileService.exists(uri))) {
		if (model) model.setValue('');
		return;
	}
	const disk = await fileService.readFile(uri);
	const text = disk.value.toString();
	if (model && model.getValue() !== text) {
		model.setValue(text);
	}
}

function sameText(a: string, b: string): boolean {
	return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}

/** Show the pending patch as red/green in the real file. Returns false when the file is new or the editor text is not the patch original. */
export async function tryShowOpenCursorInlineDiff(
	folder: URI,
	relPath: string,
	oldContent: string,
	newContent: string,
	services: {
		fileService: IFileService;
		models: ICortexideModelService;
		editCode: IEditCodeService;
		commands: ICommandService;
	},
): Promise<boolean> {
	const uri = URI.joinPath(folder, relPath);
	if (!(await services.fileService.exists(uri))) {
		return false;
	}
	await services.models.initializeModel(uri);
	const { model } = services.models.getModel(uri);
	if (!model || !sameText(model.getValue(EndOfLinePreference.LF), oldContent)) {
		return false;
	}
	await services.commands.executeCommand('vscode.open', uri);
	services.editCode.instantlyRewriteFile({ uri, newContent });
	return true;
}

export async function previewOpenCursorPatch(
	accessor: ServicesAccessor,
	runId: string,
	patchId: string,
): Promise<string | undefined> {
	const folder = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
	if (!folder) {
		return 'Open a workspace folder first.';
	}
	const patches = accessor.get(IOpenCursorPatchService);
	const detail = await patches.patch({ workspaceRoot: folder.uri.fsPath, op: 'get', runId });
	if (!detail.ok || !detail.run) {
		return detail.error ?? 'Failed to load patch run';
	}
	const p = patchFromRun(detail.run, patchId);
	if (!p) {
		return 'Patch not found';
	}
	const shown = await tryShowOpenCursorInlineDiff(folder.uri, p.path, p.oldContent ?? '', p.newContent ?? '', {
		fileService: accessor.get(IFileService),
		models: accessor.get(ICortexideModelService),
		editCode: accessor.get(IEditCodeService),
		commands: accessor.get(ICommandService),
	});
	if (!shown) {
		await openOpenCursorPatchDiff(accessor, p.path, p.oldContent ?? '', p.newContent ?? '');
	}
	return undefined;
}
