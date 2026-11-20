/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


// register inline diffs
import './editCodeService.js'

// register Sidebar pane, state, actions (keybinds, menus) (Ctrl+L)
import './sidebarActions.js'
import './sidebarPane.js'

// register quick edit (Ctrl+K)
import './quickEditActions.js'

// Quick Actions (Explain / Refactor / …) are not part of OpenCursor.


// register Autocomplete
import './autocompleteService.js'

// register Context services
// import './contextGatheringService.js'
// import './contextUserChangesService.js'

// settings pane
import './cortexideSettingsPane.js'

// register css
import './media/cortexide.css'

// update (frontend part, also see platform/)
import './cortexideUpdateActions.js'

// OpenCursor agent-core bridge. Chat calls the service directly; the experimental command palette action is not registered.
import '../common/opencursorAgentService.js'
import '../common/opencursorPatchService.js'
import './opencursorPatchActions.js'
import './opencursorCanvasPane.js'
import './opencursorStatusBar.js'

import './convertToLLMMessageWorkbenchContrib.js'

// tools
import './toolsService.js'
import './terminalToolService.js'

// register Thread History
import './chatThreadService.js'

// Usage ping is off. OpenCursor does not report telemetry.

// helper services
import './helperServices/consistentItemService.js'

// register selection helper
import './cortexideSelectionHelperWidget.js'

// register tooltip service
import './tooltipService.js'

// register onboarding service - lazy load (only needed on first run)
import('./cortexideOnboardingService.js').catch(() => { });

// register misc service
import './miscWokrbenchContrib.js'

// remove built-in chat surfaces we don't use
import './hideBuiltinChat.js'

// register file service (for explorer context menu)
import './fileService.js'

// register source control management
import './cortexideSCMService.js'

// ---------- common (unclear if these actually need to be imported, because they're already imported wherever they're used) ----------

// llmMessage
import '../common/sendLLMMessageService.js'

// cortexideSettings
import '../common/cortexideSettingsService.js'

// secret detection
import '../common/secretDetectionService.js'

// memories
import '../common/memoriesService.js'
import './memoriesTrackingContribution.js'

// edit risk scoring
import '../common/editRiskScoringService.js'

// code review service stays registered for leftover call sites. The command and editor UI are not registered.

// NL shell parser - lazy load (only needed when NL shell parsing is used)
import('../common/nlShellParserService.js').catch(() => { });

// error detection commands are not registered.

// performance guardrails
import '../common/performanceGuardrailsService.js'

// status bar contribution
import './cortexideStatusBar.js'

// first-run validation - lazy load (only needed on first run)
import('./firstRunValidation.js').catch(() => { });
import('../common/secretDetectionConfiguration.js').catch(() => { });

// global settings configuration schema — registers cortexide.* settings (local-first AI,
// audit log, rollback/autostash safety, rag vector store, ast indexing) from the canonical
// key list. Static import so the keys are registered reliably and synchronously before
// services read them (previously this contribution was never imported, leaving the keys
// invisible/unregistered).
import '../common/cortexideGlobalSettingsConfiguration.js'

// refreshModel
import '../common/refreshModelService.js'

// project rules (.cortexide/rules/*.md)
import '../common/cortexideRulesService.js'

// allow-any-unicode-next-line
// i18n — multi-language support
import '../common/i18n/i18nService.js'

// metrics
import '../common/metricsService.js'

// updates
import '../common/cortexideUpdateService.js'

// model service
import '../common/cortexideModelService.js'

// model warm-up service
import '../common/modelWarmupService.js'


// allow-any-unicode-next-line
// local setup service — guided local model wizard (settings page is not shown)
import '../common/localSetupService.js'
import '../common/ollamaInstallerService.js'

// repo indexer
import './repoIndexerService.js'

// Image QA Registry initialization
import './imageQARegistryContribution.js'
