/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../../../platform/environment/electron-main/environmentMainService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { ICortexideUpdateService } from '../common/cortexideUpdateService.js';
import { CortexideCheckUpdateResponse } from '../common/cortexideUpdateServiceTypes.js';

// OpenCursor does not follow CortexIDE releases. The channel stays so the command still resolves.
export class CortexideMainUpdateService extends Disposable implements ICortexideUpdateService {
	_serviceBrand: undefined;

	constructor(
		@IProductService _productService: IProductService,
		@IEnvironmentMainService _envMainService: IEnvironmentMainService,
		@IUpdateService _updateService: IUpdateService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IRequestService _requestService: IRequestService,
	) {
		super()
	}

	async check(explicit: boolean): Promise<CortexideCheckUpdateResponse> {
		if (!explicit) {
			return { message: null }
		}
		return { message: 'OpenCursor does not check CortexIDE releases.' }
	}
}
