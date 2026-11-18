/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ICortexideSettingsService } from '../common/cortexideSettingsService.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IChatThreadService } from './chatThreadService.js';

export class CortexideStatusBarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.cortexideStatusBar';

	private modelEntry: IStatusbarEntryAccessor | undefined;
	private readonly updateDisposables = this._register(new MutableDisposable());

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ICortexideSettingsService private readonly cortexideSettingsService: ICortexideSettingsService,
		@IChatThreadService private readonly chatThreadService: IChatThreadService,
	) {
		super();
		this.create();
		this.registerListeners();
	}

	private create(): void {
		this.modelEntry = this.statusbarService.addEntry(
			this.getModelEntryProps(),
			'cortexide.model',
			StatusbarAlignment.RIGHT,
			{ location: { id: 'status.editor.mode', priority: 100.2 }, alignment: StatusbarAlignment.RIGHT }
		);
	}

	private registerListeners(): void {
		this.updateDisposables.value = this.cortexideSettingsService.onDidChangeState(() => {
			this.modelEntry?.update(this.getModelEntryProps());
		});
		this._register(this.chatThreadService.onDidChangeStreamState(() => {
			this.modelEntry?.update(this.getModelEntryProps());
		}));
	}

	private getModelEntryProps(): IStatusbarEntry {
		const modelName = this.cortexideSettingsService.state.globalSettings.openCursorModel?.trim() || 'deepseek-flash';
		const displayName = modelName.length > 18 ? modelName.slice(0, 15) + '...' : modelName;
		const currentThreadId = this.chatThreadService.state.currentThreadId;
		const isRunning = currentThreadId ? this.chatThreadService.streamState[currentThreadId]?.isRunning : undefined;
		const isActive = isRunning === 'LLM' || isRunning === 'tool' || isRunning === 'preparing';
		const icon = isActive ? '$(loading~spin)' : '$(code)';
		return {
			name: localize('opencursor.model', 'OpenCursor'),
			text: `${icon} ${displayName}`,
			ariaLabel: modelName,
			tooltip: modelName,
		};
	}

	override dispose(): void {
		super.dispose();
		this.modelEntry?.dispose();
		this.modelEntry = undefined;
	}
}

// Register the contribution
registerWorkbenchContribution2(CortexideStatusBarContribution.ID, CortexideStatusBarContribution, WorkbenchPhase.AfterRestored);

