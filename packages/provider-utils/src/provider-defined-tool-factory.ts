import { tool, Tool, ToolExecuteFunction } from './types/tool';
import { FlexibleSchema } from './schema';
import { Context } from './types/context';
/**
 * A provider-defined tool is a tool for which the provider defines the input
 * and output schemas, but does not execute the tool.
 */
export type ProviderDefinedToolFactory<
  INPUT,
  ARGS extends object,
  CONTEXT extends Context = {},
> = <OUTPUT>(
  options: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT, CONTEXT>;
    needsApproval?: Tool<INPUT, OUTPUT, CONTEXT>['needsApproval'];
    toModelOutput?: Tool<INPUT, OUTPUT, CONTEXT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT, CONTEXT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT, CONTEXT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT, CONTEXT>['onInputAvailable'];
  },
) => Tool<INPUT, OUTPUT, CONTEXT>;

export function createProviderDefinedToolFactory<
  INPUT,
  ARGS extends object,
  CONTEXT extends Context = {},
>({
  id,
  inputSchema,
}: {
  id: `${string}.${string}`;
  inputSchema: FlexibleSchema<INPUT>;
}): ProviderDefinedToolFactory<INPUT, ARGS, CONTEXT> {
  return <OUTPUT>({
    execute,
    outputSchema,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT, CONTEXT>;
    outputSchema?: FlexibleSchema<OUTPUT>;
    needsApproval?: Tool<INPUT, OUTPUT, CONTEXT>['needsApproval'];
    toModelOutput?: Tool<INPUT, OUTPUT, CONTEXT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT, CONTEXT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT, CONTEXT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT, CONTEXT>['onInputAvailable'];
  }): Tool<INPUT, OUTPUT, CONTEXT> =>
    tool({
      type: 'provider',
      isProviderExecuted: false,
      id,
      args,
      inputSchema,
      outputSchema,
      execute,
      needsApproval,
      toModelOutput,
      onInputStart,
      onInputDelta,
      onInputAvailable,
    });
}

export type ProviderDefinedToolFactoryWithOutputSchema<
  INPUT,
  OUTPUT,
  ARGS extends object,
  CONTEXT extends Context = {},
> = (
  options: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT, CONTEXT>;
    needsApproval?: Tool<INPUT, OUTPUT, CONTEXT>['needsApproval'];
    toModelOutput?: Tool<INPUT, OUTPUT, CONTEXT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT, CONTEXT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT, CONTEXT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT, CONTEXT>['onInputAvailable'];
  },
) => Tool<INPUT, OUTPUT, CONTEXT>;

export function createProviderDefinedToolFactoryWithOutputSchema<
  INPUT,
  OUTPUT,
  ARGS extends object,
  CONTEXT extends Context = {},
>({
  id,
  inputSchema,
  outputSchema,
  supportsDeferredResults,
}: {
  id: `${string}.${string}`;
  inputSchema: FlexibleSchema<INPUT>;
  outputSchema: FlexibleSchema<OUTPUT>;
  /**
   * Whether this provider-executed tool supports deferred results.
   *
   * When true, the tool result may not be returned in the same turn as the
   * tool call (e.g., when using programmatic tool calling where a server tool
   * triggers a client-executed tool, and the server tool's result is deferred
   * until the client tool is resolved).
   *
   * @default false
   */
  supportsDeferredResults?: boolean;
}): ProviderDefinedToolFactoryWithOutputSchema<INPUT, OUTPUT, ARGS, CONTEXT> {
  return ({
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    execute?: ToolExecuteFunction<INPUT, OUTPUT, CONTEXT>;
    needsApproval?: Tool<INPUT, OUTPUT, CONTEXT>['needsApproval'];
    toModelOutput?: Tool<INPUT, OUTPUT, CONTEXT>['toModelOutput'];
    onInputStart?: Tool<INPUT, OUTPUT, CONTEXT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT, CONTEXT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT, CONTEXT>['onInputAvailable'];
  }): Tool<INPUT, OUTPUT, CONTEXT> =>
    tool({
      type: 'provider',
      isProviderExecuted: false,
      id,
      args,
      inputSchema,
      outputSchema,
      execute,
      needsApproval,
      toModelOutput,
      onInputStart,
      onInputDelta,
      onInputAvailable,
      supportsDeferredResults,
    });
}
