import type { FxProviderCredentials } from './fx-subscription';

export type FxToolResult = {
  type: 'libfx.tool-result';
  text: string;
  images: Array<{
    type: 'image';
    mimeType: string;
    data?: string;
    sourceRef?: string;
  }>;
  isError?: boolean;
};

export type FxTool = {
  name: string;
  description: string;
  inputSchema: unknown;
  idempotent: boolean;
  execute: (
    input: unknown,
    context: { signal: AbortSignal },
  ) => Promise<unknown>;
};

export type FxRuntimeEvent =
  | { type: 'text_delta' | 'reasoning_delta'; delta: string }
  | {
      type: 'tool_start';
      id: string;
      name: string;
      input?: unknown;
      inputTruncated?: boolean;
    }
  | {
      type: 'tool_end';
      id: string;
      name: string;
      content?: string;
      isError?: boolean;
    }
  | { type: 'user_message'; text: string };

export type FxPrompt =
  | string
  | Array<{
      type: 'text' | 'image';
      text?: string;
      data?: string;
      mimeType?: string;
    }>;

export type FxTurn = AsyncIterable<FxRuntimeEvent> & {
  cancel(): void;
  steer(text: string): Promise<unknown>;
  result: Promise<{ stopReason: string; usage?: Record<string, number> }>;
};

export type FxEngine = {
  prompt(input: FxPrompt, options?: { signal?: AbortSignal }): FxTurn;
  checkpoint(): Promise<Uint8Array>;
  close(): Promise<void>;
};

type FxCredentialRequest = { provider: 'codex' | 'grok'; sessionId?: string };

export type FxSessionUpdate = {
  sessionUpdate?: string;
  toolCallId?: string;
  name?: string;
  toolName?: string;
  title?: string;
  content?: { type?: string; text?: string };
};

export type FxModelEnd = {
  finishReason?: string | null;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    reasoningTokens: number | null;
  };
};

export type FxRuntimeOptions = (
  | {
      provider?: 'gateway';
      apiKey: string;
      credentials?: undefined;
      onCredentials?: undefined;
    }
  | {
      provider: 'codex' | 'grok';
      apiKey?: undefined;
      credentials(
        request: FxCredentialRequest,
      ): FxProviderCredentials | Promise<FxProviderCredentials>;
      onCredentials?(
        credentials: FxProviderCredentials,
        info: FxCredentialRequest,
      ): void | Promise<void>;
    }
) & {
  model?:
    | string
    | { id: string; effort?: string; fast?: boolean; ultrafast?: boolean };
  effort?: string;
  fast?: boolean;
  ultrafast?: boolean;
  instructions?: string;
  tools: FxTool[];
  checkpoint?: Uint8Array;
  fetch: typeof globalThis.fetch;
  backend?: 'auto' | 'native' | 'wasm';
  hooks?: {
    onEvent(event: { type: string; data: FxModelEnd }): void;
  };
  onEvent?: (event: { type: string; message?: unknown }) => void;
};

/*
 * Keeping a small, source-verified runtime boundary here keeps upstream
 * implementation types out of the package's public API and lets the adapter
 * describe only the runtime operations it uses.
 */
export async function createFxRuntime(
  options: FxRuntimeOptions,
): Promise<FxEngine> {
  const packageName: string = 'libfx';
  const runtime = (await import(packageName)) as {
    createFxEngine(options: FxRuntimeOptions): Promise<FxEngine>;
  };
  return runtime.createFxEngine(options);
}
