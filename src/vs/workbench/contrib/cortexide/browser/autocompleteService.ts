/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { EndOfLinePreference, ITextModel } from '../../../../editor/common/model.js';
import { Position } from '../../../../editor/common/core/position.js';
import { InlineCompletion, } from '../../../../editor/common/languages.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { isWindows } from '../../../../base/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IOpenCursorPatchService } from '../common/opencursorPatchService.js';



const allLinebreakSymbols = ['\r\n', '\n'];
const _ln = isWindows ? allLinebreakSymbols[0] : allLinebreakSymbols[1];

// Original autocomplete extension reference: https://github.com/OpenCortexIDE/cortexide


/*
A summary of autotab:

Postprocessing
-one common problem for all models is outputting unbalanced parentheses
we solve this by trimming all extra closing parentheses from the generated string
in future, should make sure parentheses are always balanced

-another problem is completing the middle of a string, eg. "const [x, CURSOR] = useState()"
we complete up to first matchup character
but should instead complete the whole line / block (difficult because of parenthesis accuracy)

-too much info is bad. usually we want to show the user 1 line, and have a preloaded response afterwards
this should happen automatically with caching system
should break preloaded responses into \n\n chunks

Preprocessing
- we don't generate if cursor is at end / beginning of a line (no spaces)
- we generate 1 line if there is text to the right of cursor
- we generate 1 line if variable declaration
- (in many cases want to show 1 line but generate multiple)

State
- cache based on prefix (and do some trimming first)
- when press tab on one line, should have an immediate followup response
to do this, show autocompletes before they're fully finished
- [todo] remove each autotab when accepted
!- [todo] provide type information

Details
-generated results are trimmed up to 1 leading/trailing space
-prefixes are cached up to 1 trailing newline
-
*/

class LRUCache<K, V> {
	public items: Map<K, V>;
	private keyOrder: K[];
	private maxSize: number;
	private disposeCallback?: (value: V, key?: K) => void;

	constructor(maxSize: number, disposeCallback?: (value: V, key?: K) => void) {
		if (maxSize <= 0) {
			throw new Error('Cache size must be greater than 0');
		}

		this.items = new Map();
		this.keyOrder = [];
		this.maxSize = maxSize;
		this.disposeCallback = disposeCallback;
	}

	set(key: K, value: V): void {
		// If key exists, remove it from the order list
		if (this.items.has(key)) {
			this.keyOrder = this.keyOrder.filter(k => k !== key);
		}
		// If cache is full, remove least recently used item
		else if (this.items.size >= this.maxSize) {
			const key = this.keyOrder[0];
			const value = this.items.get(key);

			// Call dispose callback if it exists
			if (this.disposeCallback && value !== undefined) {
				this.disposeCallback(value, key);
			}

			this.items.delete(key);
			this.keyOrder.shift();
		}

		// Add new item
		this.items.set(key, value);
		this.keyOrder.push(key);
	}

	delete(key: K): boolean {
		const value = this.items.get(key);

		if (value !== undefined) {
			// Remove from cache first, then call dispose callback
			// This prevents the callback from seeing the item as still in cache
			this.items.delete(key);
			this.keyOrder = this.keyOrder.filter(k => k !== key);

			// Call dispose callback if it exists (after removal to avoid issues)
			if (this.disposeCallback) {
				this.disposeCallback(value, key);
			}

			return true;
		}

		return false;
	}

	clear(): void {
		// Call dispose callback for all items if it exists
		if (this.disposeCallback) {
			for (const [key, value] of this.items.entries()) {
				this.disposeCallback(value, key);
			}
		}

		this.items.clear();
		this.keyOrder = [];
	}

	get size(): number {
		return this.items.size;
	}

	has(key: K): boolean {
		return this.items.has(key);
	}
}

type AutocompletionPredictionType =
	| 'single-line-fill-middle'
	| 'single-line-redo-suffix'
	// | 'multi-line-start-here'
	| 'multi-line-start-on-next-line'
	| 'do-not-predict';

type Autocompletion = {
	id: number;
	prefix: string;
	suffix: string;
	llmPrefix: string;
	llmSuffix: string;
	startTime: number;
	endTime: number | undefined;
	status: 'pending' | 'finished' | 'error';
	type: AutocompletionPredictionType;
	llmPromise: Promise<string> | undefined;
	insertText: string;
	requestId: string | null;
	_newlineCount: number;
};

const removeAllWhitespace = (str: string): string => str.replace(/\s+/g, '');



type PrefixAndSuffixInfo = { prefix: string; suffix: string; prefixLines: string[]; suffixLines: string[]; prefixToTheLeftOfCursor: string; suffixToTheRightOfCursor: string };
const getPrefixAndSuffixInfo = (model: ITextModel, position: Position): PrefixAndSuffixInfo => {

	const fullText = model.getValue(EndOfLinePreference.LF);

	const cursorOffset = model.getOffsetAt(position);
	const prefix = fullText.substring(0, cursorOffset);
	const suffix = fullText.substring(cursorOffset);


	const prefixLines = prefix.split(_ln);
	const suffixLines = suffix.split(_ln);

	const prefixToTheLeftOfCursor = prefixLines.slice(-1)[0] ?? '';
	const suffixToTheRightOfCursor = suffixLines[0] ?? '';

	return { prefix, suffix, prefixLines, suffixLines, prefixToTheLeftOfCursor, suffixToTheRightOfCursor };

}

export class AutocompleteService extends Disposable {

	static readonly ID = 'void.autocompleteService'

	private _autocompletionsOfDocument: { [docUriStr: string]: LRUCache<number, Autocompletion> } = {}

	// used internally by vscode
	// fires after every keystroke and returns the completion to show
	async _provideInlineCompletionItems(
		model: ITextModel,
		position: Position,
	): Promise<InlineCompletion[]> {
		const folder = this._workspaceContextService.getWorkspace().folders[0]
		if (folder && model.uri.scheme === 'file') {
			try {
				const offset = model.getOffsetAt(position)
				const full = model.getValue()
				const start = Math.max(0, offset - 20_000)
				const text = full.slice(start, offset + 4_000)
				const hit = await this._openCursorPatchService.complete({
					workspaceRoot: folder.uri.fsPath,
					text,
					cursor: offset - start,
				})
				if (hit.ok && hit.completion) {
					return [{
						insertText: hit.completion,
						range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
					}]
				}
			} catch {
				return []
			}
		}
		return []
	}


	constructor(
		@ILanguageFeaturesService private _langFeatureService: ILanguageFeaturesService,
		@ILLMMessageService private readonly _llmMessageService: ILLMMessageService,
		@IEditorService private readonly _editorService: IEditorService,
		@IModelService private readonly _modelService: IModelService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IOpenCursorPatchService private readonly _openCursorPatchService: IOpenCursorPatchService,
	) {
		super()

		this._register(this._langFeatureService.inlineCompletionsProvider.register('*', {
			provideInlineCompletions: async (model, position, context, token) => {
				const items = await this._provideInlineCompletionItems(model, position)

				// console.log('item: ', items?.[0]?.insertText)
				return { items: items, }
			},
			disposeInlineCompletions: () => {
				// get the `docUriStr` and the `position` of the cursor
				const activePane = this._editorService.activeEditorPane;
				if (!activePane) return;
				const control = activePane.getControl();
				if (!control || !isCodeEditor(control)) return;
				const position = control.getPosition();
				if (!position) return;
				const resource = EditorResourceAccessor.getCanonicalUri(this._editorService.activeEditor);
				if (!resource) return;
				const model = this._modelService.getModel(resource)
				if (!model) return;
				const docUriStr = resource.fsPath;
				if (!this._autocompletionsOfDocument[docUriStr]) return;

				const { prefix, } = getPrefixAndSuffixInfo(model, position)

				// go through cached items and remove matching ones
				// autocompletion.prefix + autocompletion.insertedText ~== insertedText
				this._autocompletionsOfDocument[docUriStr].items.forEach((autocompletion: Autocompletion) => {

					// we can do this more efficiently, I just didn't want to deal with all of the edge cases
					const matchup = removeAllWhitespace(prefix) === removeAllWhitespace(autocompletion.prefix + autocompletion.insertText)
					if (matchup) {
						const wasPending = autocompletion.status === 'pending'
						autocompletion.status = 'finished'
						if (wasPending && autocompletion.requestId) {
							this._llmMessageService.abort(autocompletion.requestId)
						}
						this._autocompletionsOfDocument[docUriStr].delete(autocompletion.id);
					}
				});

			},
		}))
	}


}

registerWorkbenchContribution2(AutocompleteService.ID, AutocompleteService, WorkbenchPhase.BlockRestore);


