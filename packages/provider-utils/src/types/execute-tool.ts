import { isAsyncIterable } from '../is-async-iterable';
import type { ExecutableTool } from './executable-tool';
import type { InferToolContext } from './infer-tool-context';
import type { InferToolInput } from './infer-tool-input';
import type { InferToolOutput } from './infer-tool-output';
import type { Tool } from './tool';
import type { ToolExecutionOptions } from './tool-execute-function';

/**
 * Executes a tool function and normalizes its results into a stream of outputs.
 *
 * - If the tool's `execute` function returns an `AsyncIterable`, each yielded value is emitted as
 *   `{ type: "preliminary", output }`. After iteration completes, the last yielded value is emitted
 *   again as `{ type: "final", output }`.
 * - If the tool returns a direct value or Promise, a single `{ type: "final", output }` is yielded.
 *
 * @param params.tool The tool whose `execute` function should be invoked.
 * @param params.input The input value to pass to the tool.
 * @param params.options Additional options for tool execution.
 * @yields A preliminary output for each streamed value, followed by a final output, or a single final
 * output for non-streaming tools.
 */
export async function* executeTool<TOOL extends Tool>({
  tool,
  input,
  options,
}: {
  tool: ExecutableTool<TOOL>;
  input: InferToolInput<TOOL>;
  options: ToolExecutionOptions<InferToolContext<TOOL>>;
}): AsyncGenerator<
  | { type: 'progress'; progress: unknown }
  | { type: 'preliminary'; output: InferToolOutput<TOOL> }
  | { type: 'final'; output: InferToolOutput<TOOL> }
> {
  const result = tool.execute(input, options);

  if (isAsyncIterable(result)) {
    const iterator = result[Symbol.asyncIterator]();
    let next = await iterator.next();
    let lastOutput: InferToolOutput<TOOL> | undefined;

    while (!next.done) {
      const value = next.value;
      if (
        value &&
        typeof value === 'object' &&
        'type' in value &&
        value.type === 'progress'
      ) {
        yield { type: 'progress', progress: value };
      } else {
        lastOutput = value as any;
        yield { type: 'preliminary', output: lastOutput! };
      }
      next = await iterator.next();
    }

    const finalOutput = next.value !== undefined ? next.value : lastOutput;
    yield { type: 'final', output: finalOutput as any };
  } else {
    yield { type: 'final', output: await result };
  }
}
