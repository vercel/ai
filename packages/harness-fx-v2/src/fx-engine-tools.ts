import type { HarnessV2TurnSettings } from '@ai-sdk/harness';
import type { FxHostTool } from 'libfx/node';
import {
  FX_BUILTIN_TOOL_SPECS,
  type FxBuiltinToolName,
} from './fx-builtin-tool-specs';

/**
 * Runs one tool call for libfx and returns what the libfx tool returns.
 */
export type FxEngineToolExecute = (call: {
  /**
   * Name of the called tool.
   */
  toolName: string;

  /**
   * Whether the tool is one of the harness's built-in tools.
   */
  builtin: boolean;

  /**
   * Tool input, parsed from the model's JSON by libfx.
   */
  input: unknown;

  /**
   * libfx's ID of the call, which is the model's tool call ID.
   */
  executionId: string;
}) => Promise<unknown>;

/**
 * Creates the tools of a turn's libfx engine: fx's kernel tools in fx's
 * advertisement order, without those the turn's own tools override, followed
 * by the turn's own tools (from the turn settings).
 *
 * Every tool is declared `writes: true`, so libfx runs the calls of a model
 * response one at a time, in order. libfx's `idempotent` only matters for
 * libfx's own persistence, which is not used, so it is `false`. A tool of
 * the turn without description or input schema gets an empty description
 * and an object schema.
 */
export function createFxEngineTools(options: {
  /**
   * Settings of the turn.
   */
  settings: HarnessV2TurnSettings;

  /**
   * Runs the tool calls.
   */
  execute: FxEngineToolExecute;
}): FxHostTool[] {
  const { settings, execute } = options;
  const specs = settings.tools;
  const hostNames = new Set(specs.map(spec => spec.name));
  const builtinTools = (
    Object.keys(FX_BUILTIN_TOOL_SPECS) as FxBuiltinToolName[]
  )
    .filter(name => !hostNames.has(name))
    .map(
      (name): FxHostTool => ({
        name,
        description: FX_BUILTIN_TOOL_SPECS[name].description,
        inputSchema: FX_BUILTIN_TOOL_SPECS[name].inputSchema,
        idempotent: false,
        writes: true,
        execute: (input, context) =>
          execute({
            toolName: name,
            builtin: true,
            input,
            executionId: context.executionId,
          }),
      }),
    );
  const hostTools = specs.map(
    (spec): FxHostTool => ({
      name: spec.name,
      description: spec.description ?? '',
      inputSchema: spec.inputSchema ?? { type: 'object' },
      idempotent: false,
      writes: true,
      execute: (input, context) =>
        execute({
          toolName: spec.name,
          builtin: false,
          input,
          executionId: context.executionId,
        }),
    }),
  );
  return [...builtinTools, ...hostTools];
}
