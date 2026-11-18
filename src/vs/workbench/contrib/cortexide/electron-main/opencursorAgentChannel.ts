/*--------------------------------------------------------------------------------------
 *  Runs dist/opencursor-agent.cjs (agent-core) in a child process with ELECTRON_RUN_AS_NODE.
 *--------------------------------------------------------------------------------------*/

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import type {
	OpenCursorAgentProgressEvent,
	OpenCursorAgentRunRequest,
	OpenCursorAgentRunResult,
	OpenCursorAgentStep,
	OpenCursorPatchRequest,
	OpenCursorPatchResult,
} from '../common/opencursorAgentTypes.js';

const MAX_TIMEOUT_MS = 600_000;
const AGENT_REL = join('dist', 'opencursor-agent.cjs');
const PATCHES_REL = join('dist', 'opencursor-patches.mjs');

function resolveDistScript(workspaceRoot: string, rel: string, envOverride?: string): string | null {
	if (envOverride && existsSync(envOverride)) {
		return envOverride;
	}
	let dir = workspaceRoot;
	for (let i = 0; i < 8; i++) {
		const candidate = join(dir, rel);
		if (existsSync(candidate)) {
			return candidate;
		}
		const parent = join(dir, '..');
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
	return null;
}

function resolveCliPath(workspaceRoot: string, explicit?: string): string | null {
	if (explicit && existsSync(explicit)) {
		return explicit;
	}
	return resolveDistScript(workspaceRoot, AGENT_REL, process.env.OPENCURSOR_AGENT_CLI);
}

function resolvePatchesCliPath(workspaceRoot: string): string | null {
	return resolveDistScript(workspaceRoot, PATCHES_REL, process.env.OPENCURSOR_PATCHES_CLI);
}

export class OpenCursorAgentChannel implements IServerChannel {

	private readonly _onStep = new Emitter<OpenCursorAgentProgressEvent>();
	private _agentChild: ChildProcess | undefined;

	listen(_: unknown, event: string): Event<any> {
		if (event === 'onStep') {
			return this._onStep.event;
		}
		throw new Error(`OpenCursorAgentChannel: no events (listen "${event}")`);
	}

	async call<T>(_: unknown, command: string, params?: unknown): Promise<T> {
		if (command === 'run') {
			return this._run(params as OpenCursorAgentRunRequest) as Promise<T>;
		}
		if (command === 'patch') {
			return this._patch(params as OpenCursorPatchRequest) as Promise<T>;
		}
		if (command === 'abort') {
			this._abortAgentChild();
			return { ok: true } as T;
		}
		throw new Error(`OpenCursorAgentChannel: unknown command "${command}"`);
	}

	private _abortAgentChild(): void {
		if (!this._agentChild) {
			return;
		}
		try {
			this._agentChild.kill('SIGKILL');
		} catch { /* ignore */ }
	}

	private _spawnJsonScript(cliPath: string, workspaceRoot: string, payload: object): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
		return new Promise((resolve) => {
			const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
			const child = spawn(process.execPath, [cliPath, JSON.stringify(payload)], {
				cwd: workspaceRoot,
				env,
				shell: false,
				windowsHide: true,
			});
			let stdout = '';
			let stderr = '';
			child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
			child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
			child.on('error', (e) => resolve({ ok: false, error: String(e) }));
			child.on('exit', (code) => {
				if (code !== 0) {
					resolve({ ok: false, error: stderr.trim() || `exit ${code}` });
					return;
				}
				try {
					resolve({ ok: true, data: JSON.parse(stdout.trim()) });
				} catch (e) {
					resolve({ ok: false, error: `invalid JSON: ${String(e)}` });
				}
			});
		});
	}

	private async _patch(req: OpenCursorPatchRequest): Promise<OpenCursorPatchResult> {
		const workspaceRoot = req?.workspaceRoot?.trim();
		if (!workspaceRoot || !req.op) {
			return { ok: false, error: 'workspaceRoot and op required' };
		}
		const cliPath = resolvePatchesCliPath(workspaceRoot);
		if (!cliPath) {
			return { ok: false, error: `patches CLI not found (npm run build:agent-cli). Expected ${PATCHES_REL}` };
		}
		const spawned = await this._spawnJsonScript(cliPath, workspaceRoot, {
			workspace: workspaceRoot,
			op: req.op,
			runId: req.runId,
			patchId: req.patchId,
		});
		if (!spawned.ok) {
			return { ok: false, error: spawned.error };
		}
		const data = spawned.data as {
			runs?: OpenCursorPatchResult['runs'];
			patch?: OpenCursorPatchResult['patch'];
			run?: unknown;
			restored?: number;
			paths?: string[];
			at?: 'before' | 'after';
		};
		return { ok: true, runs: data.runs, patch: data.patch, run: data.run, restored: data.restored, paths: data.paths, at: data.at };
	}

	private _emitProgressLines(buffer: string): string {
		const lines = buffer.split('\n');
		const rest = lines.pop() ?? '';
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			try {
				const evt = JSON.parse(trimmed) as {
					event?: string;
					step?: OpenCursorAgentStep;
					runId?: string;
					text?: string;
					tool?: string;
					args?: Record<string, string>;
				};
				if (evt.event === 'step' && evt.step?.tool) {
					this._onStep.fire({ type: 'step', step: evt.step });
				} else if (evt.event === 'run' && evt.runId) {
					this._onStep.fire({ type: 'run', runId: evt.runId });
				} else if (evt.event === 'llm' && typeof evt.text === 'string') {
					this._onStep.fire({ type: 'llm', text: evt.text });
				} else if (evt.event === 'tool_start' && evt.tool) {
					this._onStep.fire({ type: 'tool_start', tool: evt.tool, args: evt.args ?? {} });
				}
			} catch {
				// ignore non-JSON stderr
			}
		}
		return rest;
	}

	private _run(req: OpenCursorAgentRunRequest): Promise<OpenCursorAgentRunResult> {
		return new Promise((resolve) => {
			const workspaceRoot = req?.workspaceRoot?.trim();
			const message = req?.message?.trim();
			if (!workspaceRoot || !message) {
				resolve({ ok: false, error: 'workspaceRoot and message are required' });
				return;
			}

			const cliPath = resolveCliPath(workspaceRoot, req.cliPath);
			if (!cliPath) {
				resolve({
					ok: false,
					error: `agent CLI not found (build: npm run build:agent-cli, or set OPENCURSOR_AGENT_CLI). Expected ${AGENT_REL} under workspace or parent dirs.`,
				});
				return;
			}

			const payload = JSON.stringify({
				workspace: workspaceRoot,
				message,
				reviewWrites: req.reviewWrites ?? true,
				useMcp: req.useMcp,
				deepseekApiKey: req.deepseekApiKey,
				deepseekEndpoint: req.deepseekEndpoint,
			});

			const timeoutMs = Math.min(Math.max(req.timeoutMs ?? 300_000, 5_000), MAX_TIMEOUT_MS);
			let stdout = '';
			let stderrBuf = '';
			let settled = false;
			const finish = (r: OpenCursorAgentRunResult) => {
				if (!settled) {
					settled = true;
					resolve(r);
				}
			};

			const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
			const child = spawn(process.execPath, [cliPath, payload], {
				cwd: workspaceRoot,
				env,
				shell: false,
				windowsHide: true,
			});
			this._agentChild = child;
			const releaseChild = () => {
				if (this._agentChild === child) {
					this._agentChild = undefined;
				}
			};

			const timer = setTimeout(() => {
				try {
					child.kill('SIGKILL');
				} catch { /* ignore */ }
				finish({ ok: false, error: `agent timed out after ${timeoutMs}ms` });
			}, timeoutMs);

			child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
			child.stderr?.on('data', (d: Buffer) => {
				stderrBuf += d.toString();
				stderrBuf = this._emitProgressLines(stderrBuf);
			});

			child.on('error', (e) => {
				clearTimeout(timer);
				releaseChild();
				finish({ ok: false, error: String(e) });
			});

			child.on('exit', (code, signal) => {
				clearTimeout(timer);
				releaseChild();
				if (stderrBuf.trim()) {
					this._emitProgressLines(`${stderrBuf}\n`);
				}
				if (signal === 'SIGKILL' || code === 137) {
					finish({ ok: false, error: 'aborted' });
					return;
				}
				if (code !== 0) {
					finish({ ok: false, error: stderrBuf.trim() || `exit ${code}` });
					return;
				}
				try {
					const parsed = JSON.parse(stdout.trim()) as {
						text?: string;
						steps?: OpenCursorAgentStep[];
						runId?: string;
						patches?: { id: string; path: string; status: string }[];
					};
					finish({
						ok: true,
						text: parsed.text,
						steps: parsed.steps,
						runId: parsed.runId,
						patches: parsed.patches,
					});
				} catch (e) {
					finish({ ok: false, error: `invalid JSON from agent: ${String(e)}` });
				}
			});
		});
	}
}
