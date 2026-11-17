/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/
// @ts-nocheck — typechecked via react/tsconfig + buildreact

import { ScrollType } from '../../../../../../../editor/common/editorCommon.js';
import { URI } from '../../../../../../../base/common/uri.js';
type ServiceAccessor = { get: (id: string) => unknown };

export { getBasename, getFolderName } from '../../../../common/pathDisplay.js';

export const getRelative = (uri: URI, accessor: ServiceAccessor) => {
	const workspaceContextService = accessor.get('IWorkspaceContextService')
	let path: string
	const isInside = workspaceContextService.isInsideWorkspace(uri)
	if (isInside) {
		const f = workspaceContextService.getWorkspace().folders.find((folder: { uri: { fsPath: string } }) => uri.fsPath?.startsWith(folder.uri.fsPath))
		if (f) { path = uri.fsPath.replace(f.uri.fsPath, '') }
		else { path = uri.fsPath }
	}
	else {
		path = uri.fsPath
	}
	return path || undefined
}

export const voidOpenFileFn = (
	uri: URI,
	accessor: ServiceAccessor,
	range?: [number, number]
) => {
	const commandService = accessor.get('ICommandService')
	const editorService = accessor.get('ICodeEditorService')

	let editorSelection = undefined;

	if (range) {
		editorSelection = {
			startLineNumber: range[0],
			startColumn: 1,
			endLineNumber: range[1],
			endColumn: Number.MAX_SAFE_INTEGER,
		};
	}

	commandService.executeCommand('vscode.open', uri).then(() => {
		setTimeout(() => {
			if (!editorSelection) return;

			const editor = editorService.getActiveCodeEditor()
			if (!editor) return;

			editor.setSelection(editorSelection)
			editor.revealRange(editorSelection, ScrollType.Immediate)

		}, 50)
	})
};
