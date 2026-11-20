/*--------------------------------------------------------------------------------------
 *  Status bar hint when Chat uses OpenCursor agent-core.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ICortexideSettingsService } from '../common/cortexideSettingsService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { resolveOpenCursorCliPaths } from './opencursorAgentReadiness.js';

class OpenCursorStatusBarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.opencursorStatusBar';

	private entry: IStatusbarEntryAccessor | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ICortexideSettingsService private readonly settingsService: ICortexideSettingsService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
	) {
		super();
		this._register(this.settingsService.onDidChangeState(() => this.refresh()));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this.refresh()));
		this.refresh();
		const id = setInterval(() => this.refresh(), 30_000);
		this._register({ dispose: () => clearInterval(id) });
	}

	private async refresh(): Promise<void> {
		const props = await this.buildEntry();
		if (!this.entry) {
			this.entry = this.statusbarService.addEntry(
				props,
				'opencursor.agentCore',
				StatusbarAlignment.RIGHT,
				{ location: { id: 'cortexide.model', priority: -0.1 }, alignment: StatusbarAlignment.RIGHT },
			);
		} else {
			this.entry.update(props);
		}
	}

	private async buildEntry(): Promise<IStatusbarEntry> {
		const folder = this.workspaceService.getWorkspace().folders[0];
		if (!folder) {
			return {
				name: 'OpenCursor',
				text: '$(warning) OpenCursor',
				ariaLabel: 'OpenCursor: open a workspace folder',
				tooltip: 'OpenCursor agent-core needs a workspace folder.',
			};
		}

		const root = folder.uri.fsPath;
		const clis = await resolveOpenCursorCliPaths(root, this.fileService, this.environmentService.appRoot);
		const apis = this.settingsService.state.globalSettings.openCursorApis ?? [];
		const hasKey = apis.some(api => !!api.apiKey?.trim());

		if (!clis) {
			return {
				name: 'OpenCursor',
				text: '$(warning) OpenCursor',
				ariaLabel: 'OpenCursor agent CLI missing',
				tooltip: localize(
					'opencursor.cliMissing',
					'OpenCursor Chat is on, but the agent program was not found.\nFrom the monorepo root run: npm run build:agent-cli',
				),
			};
		}

		const keyHint = hasKey
			? localize('opencursor.keyOk', 'API key is set in Settings.')
			: localize('opencursor.keyMissing', 'Add an API key in OpenCursor Settings.');
		const icon = hasKey ? '$(pass)' : '$(info)';
		return {
			name: 'OpenCursor',
			text: `${icon} OpenCursor`,
			ariaLabel: 'OpenCursor agent-core ready',
			tooltip: localize(
				'opencursor.cliReady',
				'Chat engine: OpenCursor agent-core\nCLI: {0}\n{1}',
				clis.monorepoRoot,
				keyHint,
			),
		};
	}
}

registerWorkbenchContribution2(OpenCursorStatusBarContribution.ID, OpenCursorStatusBarContribution, WorkbenchPhase.Eventually);
