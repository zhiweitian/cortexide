/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEnvironmentMainService } from '../../../../platform/environment/electron-main/environmentMainService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IApplicationStorageMainService } from '../../../../platform/storage/electron-main/storageMainService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMetricsService } from '../common/metricsService.js';

// OpenCursor does not send usage metrics. The channel stays so existing call sites still resolve.
export class MetricsMainService extends Disposable implements IMetricsService {
	_serviceBrand: undefined;

	constructor(
		@IProductService _productService: IProductService,
		@IEnvironmentMainService _envMainService: IEnvironmentMainService,
		@IApplicationStorageMainService _appStorage: IApplicationStorageMainService,
		@IConfigurationService _configurationService: IConfigurationService,
	) {
		super()
	}

	capture: IMetricsService['capture'] = () => { }

	setOptOut: IMetricsService['setOptOut'] = () => { }

	async getDebuggingProperties() {
		return { telemetry: 'off' }
	}
}
