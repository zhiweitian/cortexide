/*--------------------------------------------------------------------------------------
 *  Patch list / accept / reject via opencursor-patches.mjs
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { OPENCURSOR_AGENT_CHANNEL } from './opencursorAgentTypes.js';
import type { OpenCursorPatchRequest, OpenCursorPatchResult } from './opencursorAgentTypes.js';

export interface IOpenCursorPatchService {
	readonly _serviceBrand: undefined;
	patch(req: OpenCursorPatchRequest): Promise<OpenCursorPatchResult>;
}

export const IOpenCursorPatchService = createDecorator<IOpenCursorPatchService>('OpenCursorPatchService');

class OpenCursorPatchService implements IOpenCursorPatchService {
	declare readonly _serviceBrand: undefined;
	private readonly _channel;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this._channel = mainProcessService.getChannel(OPENCURSOR_AGENT_CHANNEL);
	}

	patch(req: OpenCursorPatchRequest): Promise<OpenCursorPatchResult> {
		return this._channel.call('patch', req);
	}
}

registerSingleton(IOpenCursorPatchService, OpenCursorPatchService, InstantiationType.Delayed);
