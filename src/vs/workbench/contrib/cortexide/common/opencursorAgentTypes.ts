/*--------------------------------------------------------------------------------------
 *  OpenCursor: spawn monorepo agent-core CLI from the desktop fork (experimental bridge).
 *--------------------------------------------------------------------------------------*/

export const OPENCURSOR_AGENT_CHANNEL = 'opencursor-channel-agent';

export interface OpenCursorAgentRunRequest {
	readonly workspaceRoot: string;
	readonly message: string;
	readonly reviewWrites?: boolean;
	/** When false, skip MCP stdio connect (faster / offline). */
	readonly useMcp?: boolean;
	/** Absolute path to opencursor-agent.cjs; else env OPENCURSOR_AGENT_CLI or walk up from workspace */
	readonly cliPath?: string;
	readonly timeoutMs?: number;
	/** When set, written to workspace data/config.json if missing (DeepSeek BYOK). */
	readonly deepseekApiKey?: string;
	readonly deepseekEndpoint?: string;
}

export type OpenCursorAgentStep = {
	tool: string;
	args: Record<string, string>;
	out: string;
	patchId?: string;
	patchPath?: string;
	mcp?: boolean;
};

export interface OpenCursorAgentRunResult {
	readonly ok: boolean;
	readonly text?: string;
	readonly steps?: OpenCursorAgentStep[];
	readonly runId?: string;
	readonly patches?: { id: string; path: string; status: string }[];
	readonly error?: string;
}

export type OpenCursorAgentProgressEvent =
	| { type: 'step'; step: OpenCursorAgentStep }
	| { type: 'run'; runId: string }
	| { type: 'llm'; text: string }
	| { type: 'tool_start'; tool: string; args: Record<string, string> };

export type OpenCursorPatchOp = 'list' | 'accept' | 'reject' | 'get';

export interface OpenCursorPatchRequest {
	readonly workspaceRoot: string;
	readonly op: OpenCursorPatchOp;
	readonly runId?: string;
	readonly patchId?: string;
}

export interface OpenCursorPatchListItem {
	id: string;
	createdAt: string;
	pending: number;
}

export interface OpenCursorPatchResult {
	readonly ok: boolean;
	readonly error?: string;
	readonly runs?: OpenCursorPatchListItem[];
	readonly patch?: { id: string; path: string; status: string };
	readonly run?: unknown;
}
