/*--------------------------------------------------------------------------------------
 *  Locate bundled OpenCursor CLIs under workspace or parent dirs (same walk as main IPC).
 *--------------------------------------------------------------------------------------*/

import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';

export type OpenCursorCliPaths = {
	agentCli: URI;
	patchesCli: URI;
	monorepoRoot: string;
};

export async function resolveOpenCursorCliPaths(
	workspaceRoot: string,
	fileService: IFileService,
): Promise<OpenCursorCliPaths | undefined> {
	let dir = workspaceRoot;
	for (let i = 0; i < 8; i++) {
		const agentCli = URI.file(join(dir, 'dist', 'opencursor-agent.cjs'));
		const patchesCli = URI.file(join(dir, 'dist', 'opencursor-patches.mjs'));
		if ((await fileService.exists(agentCli)) && (await fileService.exists(patchesCli))) {
			return { agentCli, patchesCli, monorepoRoot: dir };
		}
		const parent = join(dir, '..');
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
	return undefined;
}

export async function workspaceHasOpenCursorConfig(
	workspaceRoot: string,
	fileService: IFileService,
): Promise<boolean> {
	return fileService.exists(URI.file(join(workspaceRoot, 'data', 'config.json')));
}
