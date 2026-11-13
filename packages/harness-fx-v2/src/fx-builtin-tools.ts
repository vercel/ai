import type { HarnessV2NetworkSandboxSession } from '@ai-sdk/harness';
import {
  jsonSchema,
  tool,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type Tool,
} from '@ai-sdk/provider-utils';
import {
  FX_BUILTIN_TOOL_SPECS,
  type FxBuiltinToolInputs,
  type FxBuiltinToolName,
} from './fx-builtin-tool-specs';
import { editFxFile, readFxFile, writeFxFile } from './fx-file-tools';
import { globFxFiles, grepFxFiles } from './fx-search-tools';
import { runFxShell } from './fx-shell-tool';

/**
 * Output of a built-in tool call: the text fx shows the model, images
 * attached to it, and whether the result is an error result.
 */
export type FxBuiltinToolOutput = {
  /**
   * Text shown to the model.
   */
  text: string;

  /**
   * Images attached to the result, base64-encoded.
   */
  images?: Array<{
    /**
     * Media type of the image.
     */
    mediaType: string;

    /**
     * Base64-encoded image data.
     */
    data: string;
  }>;

  /**
   * Whether the result is an error result.
   */
  isError?: true;
};

/**
 * JSON Schema of `FxBuiltinToolOutput`.
 */
const FX_BUILTIN_TOOL_OUTPUT_SCHEMA = jsonSchema<FxBuiltinToolOutput>({
  type: 'object',
  properties: {
    text: { type: 'string' },
    images: { type: 'array' },
    isError: { type: 'boolean' },
  },
  required: ['text'],
});

/**
 * Declares one of fx's kernel tools with fx's description and input schema
 * and the tool's replay policy.
 */
function declareBuiltinTool<NAME extends FxBuiltinToolName>(options: {
  /**
   * Name of the tool.
   */
  name: NAME;

  /**
   * Whether the tool may run again after an interrupted execution.
   */
  replay: 'safe' | 'never';
}): Tool<FxBuiltinToolInputs[NAME], FxBuiltinToolOutput, Context> {
  const spec = FX_BUILTIN_TOOL_SPECS[options.name];
  return tool<FxBuiltinToolInputs[NAME], FxBuiltinToolOutput, Context>({
    description: spec.description,
    inputSchema: jsonSchema<FxBuiltinToolInputs[NAME]>(spec.inputSchema),
    outputSchema: FX_BUILTIN_TOOL_OUTPUT_SCHEMA,
    replay: options.replay,
  });
}

/**
 * fx's kernel tools as exposed to the host, in fx's advertisement order: the
 * read-only tools may run again after an interrupted execution, while the
 * tools that change files or run commands never do.
 */
export const FX_BUILTIN_TOOLS = {
  read_file: declareBuiltinTool({ name: 'read_file', replay: 'safe' }),
  glob_files: declareBuiltinTool({ name: 'glob_files', replay: 'safe' }),
  grep_files: declareBuiltinTool({ name: 'grep_files', replay: 'safe' }),
  edit_file: declareBuiltinTool({ name: 'edit_file', replay: 'never' }),
  write_file: declareBuiltinTool({ name: 'write_file', replay: 'never' }),
  shell: declareBuiltinTool({ name: 'shell', replay: 'never' }),
};

/**
 * Returns whether a name is the name of one of fx's kernel tools.
 */
export function isFxBuiltinToolName(name: string): name is FxBuiltinToolName {
  return Object.hasOwn(FX_BUILTIN_TOOL_SPECS, name);
}

/**
 * Sandbox a built-in tool runs on.
 */
export type FxToolSandbox = {
  /**
   * Sandbox session the tool acts on.
   */
  session: SandboxSession | HarnessV2NetworkSandboxSession;

  /**
   * Working directory that relative paths resolve against.
   */
  workDir: string;

  /**
   * Home directory of the sandbox user, which a leading `~` refers to.
   */
  home: string;
};

/**
 * fx's kernel tools operating on a sandbox, keyed by tool name.
 */
export type FxBuiltinToolExecutors = {
  [NAME in FxBuiltinToolName]: (options: {
    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Tool input given by the model.
     */
    input: FxBuiltinToolInputs[NAME];

    /**
     * Aborts the tool.
     */
    abortSignal: AbortSignal;
  }) => Promise<FxBuiltinToolOutput>;
};

/**
 * Creates fx's kernel tools operating on a sandbox. Failures fx reports to
 * the model are returned as error results; unexpected sandbox failures are
 * thrown.
 */
export function createFxBuiltinToolExecutors(options: {
  /**
   * Sandbox the tools run on.
   */
  sandbox: FxToolSandbox;
}): FxBuiltinToolExecutors {
  const { sandbox } = options;
  return {
    read_file: ({ input, abortSignal }) =>
      readFxFile({ sandbox, input, abortSignal }),
    glob_files: ({ input, abortSignal }) =>
      globFxFiles({ sandbox, input, abortSignal }),
    grep_files: ({ input, abortSignal }) =>
      grepFxFiles({ sandbox, input, abortSignal }),
    edit_file: ({ input, abortSignal }) =>
      editFxFile({ sandbox, input, abortSignal }),
    write_file: ({ input, abortSignal }) =>
      writeFxFile({ sandbox, input, abortSignal }),
    shell: ({ toolCallId, input, abortSignal }) =>
      runFxShell({ sandbox, toolCallId, input, abortSignal }),
  };
}
