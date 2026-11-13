import type { HarnessV2NetworkSandboxSession } from '@ai-sdk/harness';
import type { JSONSchema7, JSONValue } from '@ai-sdk/provider';
import {
  jsonSchema,
  tool,
  type Context,
  type Experimental_SandboxSession as SandboxSession,
  type Tool,
} from '@ai-sdk/provider-utils';
import type { AgentTool, AgentToolParams } from '@earendil-works/pi-agent-core';
import type { ImageContent, TextContent } from '@earendil-works/pi-ai';
import {
  createBashToolDefinition,
  createEditTool,
  createEditToolDefinition,
  createFindTool,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsTool,
  createLsToolDefinition,
  createReadTool,
  createReadToolDefinition,
  createWriteTool,
  createWriteToolDefinition,
  type BashToolInput,
  type EditToolInput,
  type FindToolInput,
  type GrepToolInput,
  type LsToolInput,
  type ReadToolInput,
  type WriteToolInput,
} from '@earendil-works/pi-coding-agent';
import { createPiBashTool } from './pi-bash-tool';
import { createPiGrepTool } from './pi-grep-tool';
import {
  createPiSandboxOperations,
  expandSandboxHome,
} from './pi-sandbox-operations';
import { toJSONObject } from './to-json-value';

/**
 * Parameter schemas of Pi's built-in tools, keyed by tool name.
 */
type PiBuiltinToolSchemas = {
  /**
   * Parameter schema of the read tool.
   */
  read: ReturnType<typeof createReadToolDefinition>['parameters'];

  /**
   * Parameter schema of the write tool.
   */
  write: ReturnType<typeof createWriteToolDefinition>['parameters'];

  /**
   * Parameter schema of the edit tool.
   */
  edit: ReturnType<typeof createEditToolDefinition>['parameters'];

  /**
   * Parameter schema of the bash tool.
   */
  bash: ReturnType<typeof createBashToolDefinition>['parameters'];

  /**
   * Parameter schema of the grep tool.
   */
  grep: ReturnType<typeof createGrepToolDefinition>['parameters'];

  /**
   * Parameter schema of the find tool.
   */
  find: ReturnType<typeof createFindToolDefinition>['parameters'];

  /**
   * Parameter schema of the ls tool.
   */
  ls: ReturnType<typeof createLsToolDefinition>['parameters'];
};

/**
 * Name of one of Pi's built-in tools.
 */
export type PiBuiltinToolName = keyof PiBuiltinToolSchemas;

/**
 * Pi tool of the built-in tool `NAME`, with the tool's parameter schema and
 * typed input.
 */
export type PiBuiltinAgentTool<
  NAME extends PiBuiltinToolName = PiBuiltinToolName,
> = AgentTool<PiBuiltinToolSchemas[NAME], unknown>;

/**
 * Input of a call of the built-in tool `NAME`.
 */
export type PiBuiltinToolInput<NAME extends PiBuiltinToolName> =
  AgentToolParams<PiBuiltinToolSchemas[NAME]>;

/**
 * Pi's definition of the built-in tool `NAME`: everything of its Pi tool
 * except the execution.
 */
export type PiBuiltinToolDefinition<NAME extends PiBuiltinToolName> = Omit<
  PiBuiltinAgentTool<NAME>,
  'execute'
>;

/**
 * Pi's definitions of its built-in tools. None of their names, descriptions
 * or parameter schemas depend on the working directory passed here; the
 * tools that run are created by `createPiBuiltinToolExecutors()` with the
 * sandbox working directory.
 */
export const PI_BUILTIN_TOOL_DEFINITIONS: {
  [NAME in PiBuiltinToolName]: PiBuiltinToolDefinition<NAME>;
} = {
  read: createReadToolDefinition('/'),
  write: createWriteToolDefinition('/'),
  edit: createEditToolDefinition('/'),
  bash: createBashToolDefinition('/'),
  grep: createGrepToolDefinition('/'),
  find: createFindToolDefinition('/'),
  ls: createLsToolDefinition('/'),
};

/**
 * Output of a built-in tool call: the content Pi shows the model, the
 * tool's details, and whether the result is an error.
 */
export type PiBuiltinToolOutput = {
  /**
   * Text and image content shown to the model.
   */
  content: Array<TextContent | ImageContent>;

  /**
   * Structured details reported by the tool, e.g. truncation information.
   */
  details?: JSONValue;

  /**
   * Whether the result is an error result.
   */
  isError?: boolean;
};

/**
 * JSON Schema of `PiBuiltinToolOutput`.
 */
const PI_BUILTIN_TOOL_OUTPUT_SCHEMA = jsonSchema<PiBuiltinToolOutput>({
  type: 'object',
  properties: {
    content: { type: 'array' },
    details: {},
    isError: { type: 'boolean' },
  },
  required: ['content'],
});

/**
 * Returns whether a value is a JSON Schema object.
 */
function isJSONSchema(value: unknown): value is JSONSchema7 {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Converts a parameter schema of a Pi tool into a plain JSON Schema, without
 * the TypeBox metadata Pi's schemas carry.
 */
function toJSONSchema(options: {
  /**
   * Parameter schema of the tool.
   */
  schema: object;
}): JSONSchema7 {
  const schema = toJSONObject({ value: options.schema });
  if (!isJSONSchema(schema)) {
    throw new Error('The tool parameter schema is not a JSON Schema object.');
  }
  return schema;
}

/**
 * Declares one of Pi's built-in tools with Pi's description and parameter
 * schema and the tool's replay policy.
 */
function declareBuiltinTool<INPUT>(options: {
  /**
   * Pi's definition of the tool.
   */
  definition: PiBuiltinToolDefinition<PiBuiltinToolName>;

  /**
   * Whether the tool may run again after an interrupted execution.
   */
  replay: 'safe' | 'never';
}): Tool<INPUT, PiBuiltinToolOutput, Context> {
  return tool<INPUT, PiBuiltinToolOutput, Context>({
    description: options.definition.description,
    inputSchema: jsonSchema<INPUT>(
      toJSONSchema({ schema: options.definition.parameters }),
    ),
    outputSchema: PI_BUILTIN_TOOL_OUTPUT_SCHEMA,
    replay: options.replay,
  });
}

/**
 * Pi's built-in tools as exposed to the host: the read-only tools may run
 * again after an interrupted execution, while the tools that change files or
 * run commands never do.
 */
export const PI_BUILTIN_TOOLS = {
  read: declareBuiltinTool<ReadToolInput>({
    definition: PI_BUILTIN_TOOL_DEFINITIONS.read,
    replay: 'safe',
  }),
  write: declareBuiltinTool<WriteToolInput>({
    definition: PI_BUILTIN_TOOL_DEFINITIONS.write,
    replay: 'never',
  }),
  edit: declareBuiltinTool<EditToolInput>({
    definition: PI_BUILTIN_TOOL_DEFINITIONS.edit,
    replay: 'never',
  }),
  bash: declareBuiltinTool<BashToolInput>({
    definition: PI_BUILTIN_TOOL_DEFINITIONS.bash,
    replay: 'never',
  }),
  grep: declareBuiltinTool<GrepToolInput>({
    definition: PI_BUILTIN_TOOL_DEFINITIONS.grep,
    replay: 'safe',
  }),
  find: declareBuiltinTool<FindToolInput>({
    definition: PI_BUILTIN_TOOL_DEFINITIONS.find,
    replay: 'safe',
  }),
  ls: declareBuiltinTool<LsToolInput>({
    definition: PI_BUILTIN_TOOL_DEFINITIONS.ls,
    replay: 'safe',
  }),
};

/**
 * Returns whether a name is the name of one of Pi's built-in tools.
 */
export function isPiBuiltinToolName(name: string): name is PiBuiltinToolName {
  return Object.hasOwn(PI_BUILTIN_TOOL_DEFINITIONS, name);
}

/**
 * Sandbox a built-in tool runs on.
 */
export type PiToolSandbox = {
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
 * Pi's built-in tools operating on a sandbox, keyed by tool name.
 */
export type PiBuiltinToolExecutors = {
  [NAME in PiBuiltinToolName]: PiBuiltinAgentTool<NAME>;
};

/**
 * Returns a tool input whose `path`, if it is a string, has a leading `~`
 * resolved against the sandbox user's home directory.
 */
function expandInputPath<INPUT>(options: {
  /**
   * Tool input.
   */
  input: INPUT;

  /**
   * Home directory of the sandbox user.
   */
  home: string;
}): INPUT {
  const { input, home } = options;
  if (
    typeof input !== 'object' ||
    input === null ||
    !('path' in input) ||
    typeof input.path !== 'string'
  ) {
    return input;
  }
  return { ...input, path: expandSandboxHome({ path: input.path, home }) };
}

/**
 * Wraps a tool so that a leading `~` in its `path` input refers to the
 * sandbox user's home directory. Pi's tools would otherwise expand it to the
 * home directory of the local machine.
 */
function withSandboxHome<PARAMETERS extends object, DETAILS>(options: {
  /**
   * Tool to wrap.
   */
  tool: AgentTool<PARAMETERS, DETAILS>;

  /**
   * Home directory of the sandbox user.
   */
  home: string;
}): AgentTool<PARAMETERS, DETAILS> {
  const { tool, home } = options;
  return {
    ...tool,
    execute: (toolCallId, input, signal, onUpdate) =>
      tool.execute(
        toolCallId,
        expandInputPath({ input, home }),
        signal,
        onUpdate,
      ),
  };
}

/**
 * Creates Pi's built-in tools operating on a sandbox.
 *
 * The read, write, edit, find and ls tools are Pi's own implementations,
 * operating on the sandbox through `createPiSandboxOperations()`. Pi's grep
 * and bash tools run ripgrep and a shell on the local machine, so their
 * sandbox counterparts from `createPiGrepTool()` and `createPiBashTool()`
 * are used instead. A leading `~` in the `path` input refers to the sandbox
 * user's home directory. Failures are thrown, like Pi's tools throw them.
 */
export function createPiBuiltinToolExecutors(options: {
  /**
   * Sandbox the tools run on.
   */
  sandbox: PiToolSandbox;
}): PiBuiltinToolExecutors {
  const { session, workDir, home } = options.sandbox;
  const operations = createPiSandboxOperations({ session });
  return {
    read: withSandboxHome({
      tool: createReadTool(workDir, { operations }),
      home,
    }),
    write: withSandboxHome({
      tool: createWriteTool(workDir, { operations }),
      home,
    }),
    edit: withSandboxHome({
      tool: createEditTool(workDir, { operations }),
      home,
    }),
    bash: withSandboxHome({
      tool: createPiBashTool({ session, workDir }),
      home,
    }),
    grep: withSandboxHome({
      tool: createPiGrepTool({ session, workDir }),
      home,
    }),
    find: withSandboxHome({
      tool: createFindTool(workDir, { operations }),
      home,
    }),
    ls: withSandboxHome({ tool: createLsTool(workDir, { operations }), home }),
  };
}
