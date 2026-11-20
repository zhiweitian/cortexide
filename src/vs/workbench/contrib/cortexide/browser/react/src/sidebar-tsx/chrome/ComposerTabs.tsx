/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { LoaderCircle, Plus, X } from 'lucide-react';
import { useAccessor, useChatThreadsState, useFullChatThreadsStreamState } from '../../util/services.js';
import type { IsRunningType } from '../../../chatThreadService.js';
import { getThreadTabLabel } from '../../../../common/threadTitle.js';

const MAX_VISIBLE_TABS = 12;

export const ComposerTabs = () => {
	const accessor = useAccessor();
	const chatThreadsService = accessor.get('IChatThreadService');
	const commandService = accessor.get('ICommandService');
	const { openTabs, currentThreadId, allThreads } = useChatThreadsState();
	const streamState = useFullChatThreadsStreamState();

	const tabs = openTabs.slice(0, MAX_VISIBLE_TABS);

	const isRunning = (threadId: string): IsRunningType | undefined =>
		streamState[threadId]?.isRunning;

	return (
		<div
			className="flex items-end gap-1 px-1.5 pt-1.5 shrink-0 border-b border-void-border-3 bg-void-bg-3/50"
			role="tablist"
			aria-label="Chat threads"
		>
			<div className="flex items-end flex-1 min-w-0 overflow-x-auto void-scrollbar">
				{tabs.map(threadId => {
					const thread = allThreads[threadId];
					const active = threadId === currentThreadId;
					const label = getThreadTabLabel(thread);
					const running = isRunning(threadId);

					return (
						<div
							key={threadId}
							role="tab"
							aria-selected={active}
							className={`
								group flex items-center gap-1.5 max-w-[180px] min-w-[88px] shrink-0 h-8 px-2.5 text-xs cursor-pointer
								border border-b-0 rounded-t-md -mb-px
								${active
									? 'bg-void-bg-2 border-void-border-3 text-void-fg-1 z-[1]'
									: 'border-transparent text-void-fg-3 hover:text-void-fg-2 hover:bg-void-bg-2/50'}
							`}
							onClick={() => chatThreadsService.switchToTab(threadId)}
							title={label}
						>
							{(running === 'LLM' || running === 'tool' || running === 'preparing') && (
								<LoaderCircle className="size-3 shrink-0 animate-spin" aria-hidden />
							)}
							<span className="truncate flex-1">{label}</span>
							<button
								type="button"
								className={`shrink-0 p-0.5 rounded-sm hover:bg-void-bg-3 text-void-fg-3 hover:text-void-fg-1 void-focus-ring ${active ? 'opacity-80' : 'opacity-0 group-hover:opacity-100'}`}
								aria-label={`Close ${label}`}
								onClick={(e) => {
									e.stopPropagation();
									chatThreadsService.closeTab(threadId);
								}}
							>
								<X className="size-3" />
							</button>
						</div>
					);
				})}
			</div>
			<button
				type="button"
				className="shrink-0 mb-1 p-1 rounded-md text-void-fg-3 hover:text-void-fg-1 hover:bg-void-bg-2 void-focus-ring"
				aria-label="New chat"
				title="New chat"
				onClick={() => { void commandService.executeCommand('cortexide.cmdShiftL') }}
			>
				<Plus className="size-4" />
			</button>
		</div>
	);
};
