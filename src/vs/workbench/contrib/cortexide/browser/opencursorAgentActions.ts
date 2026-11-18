/*--------------------------------------------------------------------------------------
 *  Experimental: run monorepo agent-core from the fork (Command Palette).
 *--------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IOpenCursorAgentService } from '../common/opencursorAgentService.js';
import { ICortexideSettingsService } from '../common/cortexideSettingsService.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			f1: true,
			id: 'opencursor.runAgentCore',
			title: localize2('opencursorRunAgentCore', 'OpenCursor: Run agent-core (Experimental)'),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const workspace = accessor.get(IWorkspaceContextService);
		const quickInput = accessor.get(IQuickInputService);
		const agent = accessor.get(IOpenCursorAgentService);
		const settings = accessor.get(ICortexideSettingsService);
		const notifications = accessor.get(INotificationService);

		const folder = workspace.getWorkspace().folders[0];
		if (!folder) {
			notifications.warn('Open a workspace folder first.');
			return;
		}

		const message = await quickInput.input({
			prompt: 'Message for agent-core (uses data/config.json + .env in workspace)',
			placeHolder: 'e.g. list top-level files',
		});
		if (!message?.trim()) {
			return;
		}

		const progress = notifications.notify({
			severity: 2,
			message: 'Running agent-core…',
		});

		try {
			const deepseek = settings.state.settingsOfProvider.deepseek;
			const gs = settings.state.globalSettings;
			const result = await agent.run({
				workspaceRoot: folder.uri.fsPath,
				message: message.trim(),
				reviewWrites: true,
				useMcp: gs.openCursorUseMcp !== false,
				deepseekApiKey: deepseek?.apiKey,
				deepseekEndpoint: deepseek?.endpoint,
			});
			progress.close();
			if (!result.ok) {
				notifications.error(result.error ?? 'agent-core failed');
				return;
			}
			const preview = (result.text ?? '').slice(0, 2000);
			notifications.info(preview || '(empty response)');
		} catch (e) {
			progress.close();
			notifications.error(String(e));
		}
	}
});
