/*--------------------------------------------------------------------------------------
 *  Browser-side IPC to OpenCursor agent-core CLI.
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import {
	OPENCURSOR_AGENT_CHANNEL,
	OpenCursorAgentProgressEvent,
	OpenCursorAgentRunRequest,
	OpenCursorAgentRunResult,
} from './opencursorAgentTypes.js';

export interface IOpenCursorAgentService {
	readonly _serviceBrand: undefined;
	readonly onStep: Event<OpenCursorAgentProgressEvent>;
	run(request: OpenCursorAgentRunRequest): Promise<OpenCursorAgentRunResult>;
	abort(): Promise<void>;
}

export const IOpenCursorAgentService = createDecorator<IOpenCursorAgentService>('OpenCursorAgentService');

class OpenCursorAgentService extends Disposable implements IOpenCursorAgentService {
	declare readonly _serviceBrand: undefined;

	private readonly _channel;
	private readonly _onStep = this._register(new Emitter<OpenCursorAgentProgressEvent>());
	readonly onStep = this._onStep.event;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super();
		this._channel = mainProcessService.getChannel(OPENCURSOR_AGENT_CHANNEL);
		this._register(this._channel.listen('onStep')((e: unknown) => this._onStep.fire(e as OpenCursorAgentProgressEvent)));
	}

	run(request: OpenCursorAgentRunRequest): Promise<OpenCursorAgentRunResult> {
		return this._channel.call('run', request);
	}

	abort(): Promise<void> {
		return this._channel.call('abort', null);
	}
}

registerSingleton(IOpenCursorAgentService, OpenCursorAgentService, InstantiationType.Delayed);
