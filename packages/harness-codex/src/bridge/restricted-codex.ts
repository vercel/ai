import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import type { BridgeTurn } from '@ai-sdk/harness/bridge';
import { z } from 'zod/v4';
import type { StartMessage } from '../codex-bridge-protocol';
import { AppServerClient, type CodexServerMessage } from './app-server-client';

export const RESTRICTED_CODEX_VERSION = '0.149.1';

// Audited against 0.149.1. environments: [] is also required on thread/start.
// code_mode_host is a restricted JS dispatcher, not Node. The native fixture
// probes its globals/imports and its tool inventory on every version change.
export const RESTRICTED_CODEX_CONFIG = {
  suppress_unstable_features_warning: true,
  approval_policy: 'never',
  sandbox_mode: 'read-only',
  allow_login_shell: false,
  check_for_update_on_startup: false,
  cli_auth_credentials_store: 'file',
  project_doc_max_bytes: 0,
  notify: [],
  mcp_servers: {},
  'agents.enabled': false,
  ...Object.fromEntries([
    'shell_tool', 'unified_exec', 'shell_snapshot', 'code_mode', 'code_mode_only',
    'remote_control', 'apps', 'plugins', 'hooks', 'multi_agent', 'multi_agent_v2', 'browser_use',
    'browser_use_external', 'computer_use', 'in_app_browser', 'in_app_chat',
    'image_generation', 'view_image', 'skill_search', 'skill_mcp_dependency_install',
    'workspace_dependencies', 'memory_tool', 'request_permissions_tool',
  ].map(key => [`features.${key}`, false])),
  'features.code_mode_host': true,
  'features.standalone_web_search': true,
};

const record = z.record(z.string(), z.unknown());
const identifier = z.string().min(1).max(1024);
const toolCallSchema = z.object({
  threadId: identifier, turnId: identifier, callId: identifier,
  tool: identifier, namespace: z.string().nullish(), arguments: record,
});
const itemSchema = z.object({ id: identifier, type: identifier }).passthrough();
const turnSchema = z.object({ id: identifier, status: z.string(), error: z.unknown().nullish() });
const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningOutputTokens: z.number().int().nonnegative(),
});

/** One private app-server process per live Harness session; no disk resume. */
export class RestrictedCodex {
  private client?: AppServerClient;
  private root?: string;
  private threadId?: string;
  private announcedThreadId?: string;
  private fingerprint?: string;
  private onMessage?: (message: CodexServerMessage) => void;
  private running = false;
  private removeAbortListener?: () => void;

  async close(): Promise<void> {
    this.client?.close();
    this.client = undefined;
    this.threadId = undefined;
    this.announcedThreadId = undefined;
    if (this.root) await rm(this.root, { recursive: true, force: true });
    this.root = undefined;
  }

  async run(start: StartMessage, turn: BridgeTurn): Promise<void> {
    if (this.running) throw new Error('Concurrent Codex turns are unsupported.');
    this.running = true;
    try {
      await this.runTurn(start, turn);
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      this.removeAbortListener?.();
      this.removeAbortListener = undefined;
      this.onMessage = undefined;
      this.running = false;
    }
  }

  private async runTurn(start: StartMessage, bridge: BridgeTurn): Promise<void> {
    if (start.codexConfig != null || start.mcpServers != null || start.resumeThreadId != null) {
      throw new Error('Restricted Codex does not accept native configuration or resumed threads.');
    }
    const names = new Set<string>();
    for (const tool of start.tools ?? []) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(tool.name) || names.has(tool.name) ||
          ['exec', 'webSearch', 'web_search', 'apply_patch', 'exec_command', 'spawn_agent', 'shell'].includes(tool.name)) {
        throw new Error('Invalid, reserved, or duplicate Codex host tool name.');
      }
      names.add(tool.name);
    }
    const fingerprint = JSON.stringify([start.model, start.tools, start.instructions, start.webSearch, start.headers]);
    if (this.client && this.fingerprint !== fingerprint) await this.close();
    const aborted = new Promise<never>((_, reject) => {
      const abort = () => {
        this.client?.close();
        reject(bridge.abortSignal.reason ?? new Error('Codex turn aborted.'));
      };
      if (bridge.abortSignal.aborted) abort();
      else {
        bridge.abortSignal.addEventListener('abort', abort, { once: true });
        this.removeAbortListener = () => bridge.abortSignal.removeEventListener('abort', abort);
      }
    });
    // Race even while bootstrapping; no pending host result can hold cancellation open.
    void aborted.catch(() => {});
    if (bridge.abortSignal.aborted) throw bridge.abortSignal.reason;
    if (!this.client) {
      await this.initialize(start, bridge.abortSignal);
      this.fingerprint = fingerprint;
    }
    const client = this.client!;
    let turnId: string | undefined;
    let receivedTurnStarted = false;
    let finished = false;
    let finalText: string | undefined;
    let finalId: string | undefined;
    let usage: z.infer<typeof usageSchema> | undefined;
    const calls = new Set<string>();
    const pendingCalls = new Set<string>();
    const items = new Map<string, { type: string; complete: boolean; text: string }>();
    let resolveCompleted!: () => void;
    const completed = new Promise<void>(resolve => { resolveCompleted = resolve; });

    this.onMessage = message => {
      const p = record.parse(message.params ?? {});
      if (message.id != null) {
        if (message.method !== 'item/tool/call' || finished) throw new Error('Unexpected Codex server request.');
        const call = toolCallSchema.parse(p);
        if (call.threadId !== this.threadId || turnId == null || call.turnId !== turnId ||
            !names.has(call.tool) || (call.namespace != null && call.namespace !== '') || calls.has(call.callId)) {
          throw new Error('Invalid or duplicate Codex host tool call.');
        }
        calls.add(call.callId);
        pendingCalls.add(call.callId);
        // Register BEFORE emission: host handlers may return synchronously.
        const result = bridge.requestToolResult(call.callId);
        bridge.emit({ type: 'tool-call', toolCallId: call.callId, toolName: call.tool,
          input: JSON.stringify(call.arguments), providerExecuted: false });
        void Promise.race([result, client.failure, aborted]).then(output => {
          if (finished || bridge.abortSignal.aborted) throw new Error('Late Codex tool result.');
          client.send({ id: message.id, result: {
            contentItems: [{ type: 'inputText', text: JSON.stringify(output.output ?? null) }],
            success: !output.isError,
          } });
          pendingCalls.delete(call.callId);
          bridge.emit({ type: 'tool-result', toolCallId: call.callId, toolName: call.tool,
            result: output.output ?? null, isError: !!output.isError });
        }).catch(error => client.fail(error));
        return;
      }
      // The pinned server emits legacy compatibility notifications in addition
      // to v2 events. They are never interpreted as model output or tool calls.
      if (message.method.startsWith('codex/event/') || message.method === 'deprecationNotice') return;
      if (p.threadId != null && p.threadId !== this.threadId) throw new Error('Mismatched Codex thread.');
      if (p.turnId != null && p.turnId !== turnId) throw new Error('Mismatched Codex turn.');
      if (message.method === 'turn/started') {
        const value = turnSchema.parse(p.turn);
        if (receivedTurnStarted || (turnId != null && turnId !== value.id) || p.threadId !== this.threadId || value.status !== 'inProgress') throw new Error('Unexpected Codex turn.');
        receivedTurnStarted = true;
        turnId = value.id;
        return;
      }
      if (message.method === 'thread/tokenUsage/updated') {
        if (p.threadId !== this.threadId || p.turnId !== turnId) throw new Error('Mismatched Codex usage.');
        usage = usageSchema.parse(record.parse(p.tokenUsage).total);
        return;
      }
      if (message.method === 'turn/completed') {
        const value = turnSchema.parse(p.turn);
        if (finished || value.id !== turnId || p.threadId !== this.threadId || value.status !== 'completed' ||
            value.error != null || finalText == null || pendingCalls.size > 0 ||
            [...items.values()].some(item => !item.complete)) throw new Error('Codex turn did not complete successfully.');
        finished = true;
        resolveCompleted();
        return;
      }
      if (message.method === 'item/started' || message.method === 'item/completed') {
        if (finished || turnId == null || p.threadId !== this.threadId || p.turnId !== turnId) throw new Error('Unexpected Codex item.');
        const item = itemSchema.parse(p.item);
        if (!['userMessage', 'agentMessage', 'reasoning', 'webSearch', 'dynamicToolCall'].includes(item.type)) {
          // Secondary assertion. The configuration and empty environment list
          // prevent forbidden tools from executing in the first place.
          throw new Error(`Forbidden Codex item: ${item.type}`);
        }
        let state = items.get(item.id);
        if (message.method === 'item/started') {
          if (state || items.size >= 10000) throw new Error('Duplicate or excessive Codex items.');
          state = { type: item.type, complete: false, text: '' };
          items.set(item.id, state);
          if (item.type === 'reasoning') bridge.emit({ type: 'reasoning-start', id: item.id });
          if (item.type === 'agentMessage' && item.phase !== 'final_answer') bridge.emit({ type: 'text-start', id: item.id });
          return;
        }
        if (!state || state.complete || state.type !== item.type) throw new Error('Unexpected or duplicate completed Codex item.');
        state.complete = true;
        if (item.type === 'agentMessage') {
          const text = z.string().parse(item.text);
          if (item.phase === 'final_answer') {
            if (finalText != null) throw new Error('Multiple Codex final answers.');
            finalText = text;
            finalId = item.id;
          } else {
            if (!text.startsWith(state.text)) throw new Error('Inconsistent Codex text.');
            bridge.emit({ type: 'text-delta', id: item.id, delta: text.slice(state.text.length) });
            bridge.emit({ type: 'text-end', id: item.id });
          }
        }
        if (item.type === 'reasoning') {
          if (!state.text) bridge.emit({ type: 'reasoning-delta', id: item.id,
            delta: z.array(z.string()).parse(item.summary ?? []).join('\n') });
          bridge.emit({ type: 'reasoning-end', id: item.id });
        }
        if (item.type === 'webSearch') {
          if (!start.webSearch) throw new Error('Unrequested Codex web search.');
          bridge.emit({ type: 'tool-call', toolCallId: item.id, toolName: 'webSearch', nativeName: 'web_search',
            input: JSON.stringify({ query: item.query ?? '' }), providerExecuted: true });
          bridge.emit({ type: 'tool-result', toolCallId: item.id, toolName: 'webSearch', result: item.action ?? null });
        }
        return;
      }
      if (['item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/textDelta'].includes(message.method)) {
        const state = items.get(identifier.parse(p.itemId));
        if (finished || !state || state.complete || p.threadId !== this.threadId || p.turnId !== turnId) throw new Error('Unexpected Codex delta.');
        const delta = z.string().parse(p.delta);
        // Final answers are released only after successful turn completion.
        // Agent deltas are buffered because phase can be supplied at completion.
        if (state.type === 'reasoning') {
          state.text += delta;
          bridge.emit({ type: 'reasoning-delta', id: p.itemId as string, delta });
        } else if (state.type !== 'agentMessage') throw new Error('Invalid Codex delta type.');
        return;
      }
      if (['account/rateLimits/updated', 'thread/status/changed', 'item/reasoning/summaryPartAdded', 'serverRequest/resolved', 'model/rerouted', 'turn/moderationMetadata'].includes(message.method)) return;
      throw new Error(`Unexpected Codex notification: ${message.method}`);
    };
    bridge.emit({ type: 'stream-start' });
    await Promise.race([
      (async () => {
        const result = record.parse(await client.request('turn/start', {
          threadId: this.threadId, input: [{ type: 'text', text: start.prompt }],
          ...(start.reasoningEffort ? { effort: start.reasoningEffort } : {}),
          ...(start.responseFormat?.type === 'json' ? { outputSchema: start.responseFormat.schema } : {}),
        }));
        const started = turnSchema.parse(result.turn);
        if (turnId == null) turnId = started.id;
        else if (turnId !== started.id) throw new Error('Mismatched Codex start response.');
        await completed;
      })(), client.failure, aborted,
    ]);
    bridge.emit({ type: 'text-start', id: finalId! });
    bridge.emit({ type: 'text-delta', id: finalId!, delta: finalText! });
    bridge.emit({ type: 'text-end', id: finalId! });
    const totalUsage = {
      inputTokens: { total: usage?.inputTokens ?? 0, noCache: Math.max(0, (usage?.inputTokens ?? 0) - (usage?.cachedInputTokens ?? 0)), cacheRead: usage?.cachedInputTokens ?? 0, cacheWrite: 0 },
      outputTokens: { total: usage?.outputTokens ?? 0, text: Math.max(0, (usage?.outputTokens ?? 0) - (usage?.reasoningOutputTokens ?? 0)), reasoning: usage?.reasoningOutputTokens ?? 0 },
    };
    bridge.emit({ type: 'finish-step', finishReason: { unified: 'stop', raw: 'completed' }, usage: totalUsage });
    bridge.emit({ type: 'finish', finishReason: { unified: 'stop', raw: 'completed' }, totalUsage });
  }

  private async initialize(start: StartMessage, signal: AbortSignal): Promise<void> {
    // Never search PATH, use the SDK's cache, or load code from the worktree.
    const require = createRequire(import.meta.url);
    const packageFile = require.resolve('@openai/codex/package.json');
    const manifest = await safeParseJSON({ text: await readFile(packageFile, 'utf8'), schema: z.object({ version: z.literal(RESTRICTED_CODEX_VERSION) }) });
    if (!manifest.success) throw new Error('Unsupported restricted Codex CLI version.');
    const targets: Record<string, string> = { 'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl', 'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin' };
    const target = targets[`${process.platform}-${process.arch}`];
    if (!target) throw new Error('Unsupported restricted Codex platform.');
    const nativePackage = createRequire(packageFile).resolve(`@openai/codex-${process.platform}-${process.arch}/package.json`);
    const executable = path.join(path.dirname(nativePackage), 'vendor', target, 'bin', 'codex');
    this.root = await mkdtemp('/tmp/ai-sdk-codex-');
    const cwd = path.join(this.root, 'work');
    const home = path.join(this.root, 'home');
    const codexHome = path.join(home, '.codex');
    await mkdir(cwd, { mode: 0o700 });
    await mkdir(codexHome, { recursive: true, mode: 0o700 });
    const env = { HOME: home, CODEX_HOME: codexHome, PATH: '/usr/bin:/bin', TMPDIR: this.root,
      CODEX_API_KEY: process.env.CODEX_API_KEY ?? '' };
    if (!env.CODEX_API_KEY) throw new Error('Restricted Codex requires explicit API credentials.');
    const version = await promisify(execFile)(executable, ['--version'], { cwd, env, signal, timeout: 10000, maxBuffer: 4096 });
    if (version.stdout.trim() !== `codex-cli ${RESTRICTED_CODEX_VERSION}`) throw new Error('Unsupported restricted Codex executable.');
    const config: Record<string, unknown> = { ...RESTRICTED_CODEX_CONFIG,
      web_search: start.webSearch ? 'live' : 'disabled',
      model_provider: 'harness',
      'model_providers.harness.name': 'Harness',
      'model_providers.harness.base_url': process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      'model_providers.harness.env_key': 'CODEX_API_KEY',
      'model_providers.harness.wire_api': 'responses',
      'model_providers.harness.supports_websockets': false,
      'model_providers.harness.supports_standalone_web_search': true,
    };
    for (const [key, value] of Object.entries(start.headers ?? {})) config[`model_providers.harness.http_headers.${JSON.stringify(key)}`] = value;
    const args = Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
    const client = new AppServerClient({ executable, args: [...args, 'app-server'], cwd, env,
      onMessage: message => {
        if (message.method === 'remoteControl/status/changed' && message.id == null && record.parse(message.params).status === 'disabled') return;
        if (message.method === 'thread/started' && message.id == null) {
          const id = identifier.parse(record.parse(record.parse(message.params).thread).id);
          if (this.announcedThreadId != null || (this.threadId != null && this.threadId !== id)) throw new Error('Unexpected Codex thread.');
          this.announcedThreadId = id;
          return;
        }
        if (this.onMessage) this.onMessage(message);
        else if (message.id != null || !['thread/status/changed', 'deprecationNotice'].includes(message.method) && !message.method.startsWith('codex/event/')) {
          throw new Error(`Unexpected idle Codex message: ${message.method}`);
        }
      },
    });
    this.client = client;
    await client.request('initialize', { clientInfo: { name: 'ai-sdk-harness', version: '1' }, capabilities: { experimentalApi: true } });
    client.send({ method: 'initialized' });
    const configuration = record.parse(await client.request('config/read', { includeLayers: true, cwd }));
    const layers = z.array(z.object({ name: z.object({ type: z.string() }), config: record })).parse(configuration.layers);
    for (const layer of layers) {
      if (!['sessionFlags', 'packagedDefaults'].includes(layer.name.type) && Object.keys(layer.config).length > 0) {
        throw new Error('Restricted Codex refuses inherited runtime configuration.');
      }
    }
    const effective = record.parse(configuration.config);
    if (Object.keys(record.parse(effective.mcp_servers ?? {})).length > 0) throw new Error('Restricted Codex refuses MCP servers.');
    const result = record.parse(await client.request('thread/start', {
      model: start.model, cwd, sandbox: 'read-only', approvalPolicy: 'never',
      ephemeral: true, environments: [],
      dynamicTools: (start.tools ?? []).map(tool => ({ name: tool.name, description: tool.description ?? '', inputSchema: tool.inputSchema })),
      developerInstructions: start.instructions ?? '',
    }));
    this.threadId = identifier.parse(record.parse(result.thread).id);
    if (this.announcedThreadId != null && this.threadId !== this.announcedThreadId) throw new Error('Mismatched Codex thread.');
  }
}
