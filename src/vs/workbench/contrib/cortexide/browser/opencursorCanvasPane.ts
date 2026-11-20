/*--------------------------------------------------------------------------------------
 *  OpenCursor canvas as its own editor tab.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IOpenCursorPatchService } from '../common/opencursorPatchService.js';

type CanvasBlock = Record<string, unknown> & { type?: string };
type CanvasDoc = { title?: string; blocks?: CanvasBlock[]; lastAction?: string };

class OpenCursorCanvasInput extends EditorInput {
	static readonly ID = 'workbench.input.opencursor.canvas';
	static readonly RESOURCE = URI.from({ scheme: 'opencursor', path: 'canvas' });
	readonly resource = OpenCursorCanvasInput.RESOURCE;

	override get typeId(): string {
		return OpenCursorCanvasInput.ID;
	}

	override getName(): string {
		return 'Canvas';
	}

	override getIcon() {
		return Codicon.preview;
	}
}

let reloadCanvas: (() => void) | undefined;

function line(parent: HTMLElement, text: string, tag = 'div'): HTMLElement {
	const el = document.createElement(tag);
	el.textContent = text;
	el.style.margin = '0 0 8px';
	parent.appendChild(el);
	return el;
}

function renderDoc(host: HTMLElement, doc: CanvasDoc | null, onAction: (action: string) => void, onRefresh: () => void): void {
	host.replaceChildren();
	const refresh = document.createElement('button');
	refresh.textContent = 'Refresh';
	refresh.style.marginBottom = '12px';
	refresh.onclick = onRefresh;
	host.appendChild(refresh);
	if (!doc?.title) {
		line(host, 'No canvas yet.');
		return;
	}
	const title = line(host, doc.title, 'h2');
	title.style.marginTop = '0';
	for (const block of doc.blocks ?? []) {
		const type = String(block.type || '');
		if (type === 'divider') {
			host.appendChild(document.createElement('hr'));
			continue;
		}
		if (type === 'button') {
			const button = document.createElement('button');
			button.textContent = String(block.label || block.action || 'Action');
			button.style.margin = '0 8px 8px 0';
			button.onclick = () => onAction(String(block.action || block.label || ''));
			host.appendChild(button);
			continue;
		}
		if (type === 'table') {
			const table = document.createElement('table');
			table.style.borderCollapse = 'collapse';
			table.style.marginBottom = '12px';
			const headers = Array.isArray(block.headers) ? block.headers : [];
			if (headers.length) {
				const row = document.createElement('tr');
				for (const cell of headers) {
					const th = document.createElement('th');
					th.textContent = String(cell);
					th.style.border = '1px solid var(--vscode-editorWidget-border)';
					th.style.padding = '4px 8px';
					row.appendChild(th);
				}
				table.appendChild(row);
			}
			for (const raw of Array.isArray(block.rows) ? block.rows : []) {
				const row = document.createElement('tr');
				for (const cell of Array.isArray(raw) ? raw : []) {
					const td = document.createElement('td');
					td.textContent = String(cell);
					td.style.border = '1px solid var(--vscode-editorWidget-border)';
					td.style.padding = '4px 8px';
					row.appendChild(td);
				}
				table.appendChild(row);
			}
			host.appendChild(table);
			continue;
		}
		if (type === 'timeline' || type === 'todos') {
			for (const item of Array.isArray(block.items) ? block.items : []) {
				const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
				line(host, [row.time, row.title, row.detail].filter(Boolean).map(String).join(' · '));
			}
			continue;
		}
		if (type === 'bars') {
			if (block.title) line(host, String(block.title));
			for (const item of Array.isArray(block.points) ? block.points : []) {
				const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
				line(host, `${row.label ?? ''} ${row.value ?? ''}`.trim());
			}
			continue;
		}
		if (type === 'pills') {
			const items = Array.isArray(block.items) ? block.items : [];
			line(host, items.map((item) => {
				const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
				return String(row.text || '');
			}).filter(Boolean).join('  '));
			continue;
		}
		if (type === 'diff') {
			if (block.path) line(host, String(block.path));
			for (const item of Array.isArray(block.lines) ? block.lines : []) {
				const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
				const mark = row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' ';
				line(host, `${mark} ${row.text ?? ''}`);
			}
			continue;
		}
		const text = block.text || (block.label ? `${block.label} ${block.value || ''}` : '');
		if (text) line(host, String(text), type === 'h1' || type === 'h2' || type === 'h3' ? type : 'div');
	}
	if (doc.lastAction) line(host, `Noted: ${doc.lastAction}`);
}

class OpenCursorCanvasPane extends EditorPane {
	static readonly ID = 'workbench.editor.opencursorCanvas';
	private _host: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(OpenCursorCanvasPane.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.style.height = '100%';
		parent.style.width = '100%';
		const host = document.createElement('div');
		host.style.height = '100%';
		host.style.width = '100%';
		host.style.boxSizing = 'border-box';
		host.style.overflow = 'auto';
		host.style.padding = '16px 20px';
		parent.appendChild(host);
		this._host = host;
		reloadCanvas = () => { void this._load(); };
		this._register(toDisposable(() => {
			if (reloadCanvas) reloadCanvas = undefined;
		}));
		void this._load();
	}

	override layout(dimension: Dimension): void {
		if (!this._host) return;
		this._host.style.height = `${dimension.height}px`;
		this._host.style.width = `${dimension.width}px`;
	}

	private async _load(): Promise<void> {
		const host = this._host;
		if (!host) return;
		await this._instantiationService.invokeFunction(async accessor => {
			const folder = accessor.get(IWorkspaceContextService).getWorkspace().folders[0];
			if (!folder) {
				renderDoc(host, null, () => { }, () => { void this._load(); });
				host.replaceChildren();
				line(host, 'Open a folder first.');
				return;
			}
			const patches = accessor.get(IOpenCursorPatchService);
			const res = await patches.patch({ workspaceRoot: folder.uri.fsPath, op: 'canvas' });
			const doc = (res.ok ? res.canvas : null) as CanvasDoc | null;
			const reload = () => { void this._load(); };
			renderDoc(host, doc, (action) => {
				void patches.patch({ workspaceRoot: folder.uri.fsPath, op: 'canvas-action', action }).then(reload);
			}, reload);
		});
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(OpenCursorCanvasPane, OpenCursorCanvasPane.ID, 'OpenCursor Canvas'),
	[new SyncDescriptor(OpenCursorCanvasInput)],
);

async function openCanvas(accessor: ServicesAccessor): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const instantiationService = accessor.get(IInstantiationService);
	const openEditors = editorService.findEditors(OpenCursorCanvasInput.RESOURCE);
	if (openEditors.length) {
		await editorService.openEditor(openEditors[0].editor);
		reloadCanvas?.();
		return;
	}
	await editorService.openEditor(instantiationService.createInstance(OpenCursorCanvasInput));
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'opencursor.openCanvas',
			title: localize2('opencursorOpenCanvas', 'OpenCursor: Open Canvas'),
			f1: true,
			icon: Codicon.preview,
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return openCanvas(accessor);
	}
});
