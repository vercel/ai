import { isAsyncIterable } from '../is-async-iterable';
import { InferToolContext } from './infer-tool-context';
import { InferToolInput } from './infer-tool-input';
import { InferToolOutput } from './infer-tool-output';
import { Tool, ToolExecutionOptions } from './tool';

/**
 * Executes a tool function, supporting both synchronous and streaming/asynchronous results.
 *
 * This generator yields intermediate ("preliminary") outputs as they're produced, allowing callers
 * to stream partial tool results before completion. When execution is finished, it yields a final output,
 * ensuring all consumers receive a conclusive result.
 *
 * - If the tool's `execute` function returns an `AsyncIterable`, all intermediate values are yielded
 *   as `{ type: "preliminary", output }` except the last, which is yielded as `{ type: "final", output }`.
 * - If the tool returns a direct value or Promise, a single `{ type: "final", output }` is yielded.
 *
 * @template INPUT Input type for the tool execution.
 * @template OUTPUT Output type for the tool execution.
 * @template CONTEXT Context object extension for execution (extends Context).
 * @param params.execute The tool execute function.
 * @param params.input Input value to pass to the execute function.
 * @param params.options Additional options for tool execution.
 * @yields An object containing either a preliminary or final output from the tool.
 */
export async function* executeTool<
  TOOL extends Tool & { execute: NonNullable<Tool['execute']> },
>({
  tool,
  input,
  options,
}: {
  tool: TOOL;
  input: InferToolInput<TOOL>;
  options: ToolExecutionOptions<InferToolContext<TOOL>>;
}): AsyncGenerator<
  | { type: 'preliminary'; output: InferToolOutput<TOOL> }
  | { type: 'final'; output: InferToolOutput<TOOL> }
> {
  const result = tool.execute(input, options);

  if (isAsyncIterable(result)) {
    let lastOutput: InferToolOutput<TOOL> | undefined;
    for await (const output of result) {
      lastOutput = output;
      yield { type: 'preliminary', output };
    }
    yield { type: 'final', output: lastOutput! };
  } else {
    yield { type: 'final', output: await result };
  }
}
