import { FlexibleSchema } from './schema';
import { ProviderExecutedTool, tool, Tool } from './types/tool';
import { Context } from './types/context';

/**
 * A provider-executed tool is a tool for which the provider executes the tool.
 */
export type ProviderExecutedToolFactory<
  INPUT,
  OUTPUT,
  ARGS extends Record<string, unknown>,
  CONTEXT extends Context = {},
> = (
  options: ARGS & {
    onInputStart?: Tool<INPUT, OUTPUT, CONTEXT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT, CONTEXT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT, CONTEXT>['onInputAvailable'];
  },
) => ProviderExecutedTool<INPUT, OUTPUT, CONTEXT>;

export function createProviderExecutedToolFactory<
  INPUT,
  OUTPUT,
  ARGS extends Record<string, unknown>,
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
}): ProviderExecutedToolFactory<INPUT, OUTPUT, ARGS, CONTEXT> {
  return ({
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }: ARGS & {
    onInputStart?: Tool<INPUT, OUTPUT, CONTEXT>['onInputStart'];
    onInputDelta?: Tool<INPUT, OUTPUT, CONTEXT>['onInputDelta'];
    onInputAvailable?: Tool<INPUT, OUTPUT, CONTEXT>['onInputAvailable'];
  }): ProviderExecutedTool<INPUT, OUTPUT, CONTEXT> =>
    tool({
      type: 'provider',
      isProviderExecuted: true,
      id,
      args,
      inputSchema,
      outputSchema,
      onInputStart,
      onInputDelta,
      onInputAvailable,
      supportsDeferredResults,
    });
}
