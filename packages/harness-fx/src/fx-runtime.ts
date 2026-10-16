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

export type FxAgent = {
  prompt(input: FxPrompt, options?: { signal?: AbortSignal }): FxTurn;
  checkpoint(): Promise<Uint8Array>;
  close(): Promise<void>;
};

export type FxRuntimeOptions = {
  apiKey: string;
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
  onEvent?: (event: { type: string; message?: unknown }) => void;
};

/*
 * The pinned stable SDK ships JavaScript without declarations. Keeping its
 * small, source-verified boundary here avoids ambient declarations and keeps
 * upstream implementation types out of the package's public API.
 */
export async function createFxRuntime(
  options: FxRuntimeOptions,
): Promise<FxAgent> {
  const packageName: string = 'libfx';
  const runtime = (await import(packageName)) as {
    createFxAgent(options: FxRuntimeOptions): Promise<FxAgent>;
  };
  return runtime.createFxAgent(options);
}
