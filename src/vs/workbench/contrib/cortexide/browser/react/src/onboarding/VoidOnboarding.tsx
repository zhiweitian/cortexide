/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import '../styles.css';
import { useAccessor, useIsDark, useSettingsState } from '../util/services.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { ExpressOnboardingFlow } from './ExpressOnboardingFlow.js';

const OVERRIDE_VALUE = false

export const VoidOnboarding = () => {

	const accessor = useAccessor()
	const settingsService = accessor.get('ICortexideSettingsService')

	const voidSettingsState = useSettingsState()
	const isOnboardingComplete = voidSettingsState.globalSettings.isOnboardingComplete || OVERRIDE_VALUE

	const isDark = useIsDark()

	const showApiForm = !isOnboardingComplete

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			<div
				className={`
					cortex-onboarding-root fixed inset-0 z-[99999] flex items-start justify-center px-6 py-12
					backdrop-blur-[28px]
					overflow-y-auto
					transition-all duration-700 ease-in-out
					${isOnboardingComplete ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 pointer-events-auto'}
				`}
				style={{
					backgroundColor: 'var(--vscode-editor-background, #050507)',
					backgroundImage: 'radial-gradient(circle at 18% -15%, rgba(255,255,255,0.06), transparent 55%), radial-gradient(circle at 82% 0%, rgba(0,0,0,0.55), transparent 50%)',
				}}
			>
				<ErrorBoundary>
					<div className="w-full max-w-[1200px] py-6">
						{showApiForm ? (
							<ExpressOnboardingFlow
								onCustomize={() => { }}
								onDismiss={() => {
									settingsService.setGlobalSetting('isOnboardingComplete', true)
								}}
							/>
						) : null}
					</div>
				</ErrorBoundary>
			</div>
		</div>
	)
}
