import {
  JcodeClient,
  type ApiEvent,
  type ConnectOptions,
  type LaunchOptions,
} from '@1jehuang/jcode-sdk';

export interface JcodeExternalToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly input_schema?: unknown;
}

export interface JcodeExternalToolResult {
  readonly call_id: string;
  readonly output: unknown;
  readonly is_error?: boolean;
  readonly error_message?: string;
}

export type JcodeExternalToolCallEvent = {
  readonly ev: 'external_tool_call';
  readonly session_id: string;
  readonly root_session_id: string;
  readonly call_id: string;
  readonly catalog_revision: number;
  readonly name: string;
  readonly input: unknown;
};

export type JcodeSdkEvent = ApiEvent | JcodeExternalToolCallEvent;

export interface JcodeSdkClient {
  readonly instanceHome?: string;
  supports(capability: string): boolean;
  createSession(workingDir?: string): Promise<{ session_id: string }>;
  attachSession(sessionId: string): Promise<{ session_id: string }>;
  detachSession(sessionId: string): Promise<void>;
  sendMessage(sessionId: string, content: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  softInterrupt(
    sessionId: string,
    content: string,
    urgent?: boolean,
  ): Promise<void>;
  compact(sessionId: string): Promise<string>;
  setModel(sessionId: string, model: string): Promise<void>;
  setReasoningEffort(sessionId: string, effort: string): Promise<void>;
  setExternalTools(
    sessionId: string,
    tools: readonly JcodeExternalToolDefinition[],
  ): Promise<void>;
  submitExternalToolResult(
    sessionId: string,
    result: JcodeExternalToolResult,
  ): Promise<void>;
  events(sessionId?: string): AsyncIterableIterator<JcodeSdkEvent>;
  close(): Promise<void>;
}

export type JcodeClientFactory = (
  options: LaunchOptions & ConnectOptions,
) => Promise<JcodeSdkClient>;

export const launchJcodeClient: JcodeClientFactory = async options =>
  (await JcodeClient.launch(options)) as unknown as JcodeSdkClient;

// `JcodeClient.close()` shuts down instances it launched. A between-turn
// HarnessV1 detach must leave that runtime alive, so retain the connection for
// lossless same-process resume. Cross-process resume uses the persisted
// `jcodeHome` and launches a new daemon after `doStop`.
const parkedClients = new Map<string, JcodeSdkClient>();

export function parkJcodeClient(
  jcodeSessionId: string,
  client: JcodeSdkClient,
): void {
  parkedClients.set(jcodeSessionId, client);
}

export function takeParkedJcodeClient(
  jcodeSessionId: string,
): JcodeSdkClient | undefined {
  const client = parkedClients.get(jcodeSessionId);
  parkedClients.delete(jcodeSessionId);
  return client;
}
