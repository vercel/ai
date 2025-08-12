import { Tool, ToolCallOptions, ToolExecuteFunction } from './tool';
import { isAsyncIterable } from '../is-async-iterable';

export async function* executeTool<INPUT, OUTPUT>({
  tool,
  input,
  options,
}: {
  tool: Tool<INPUT, OUTPUT> & {
    execute: ToolExecuteFunction<INPUT, OUTPUT>;
  };
  input: INPUT;
  options: ToolCallOptions;
}): AsyncGenerator<
  { type: 'preliminary'; output: OUTPUT } | { type: 'final'; output: OUTPUT }
> {
  const result = tool.execute(input, options);

  if (isAsyncIterable(result)) {
    let lastOutput: OUTPUT | undefined;
    for await (const output of result) {
      lastOutput = output;
      yield { type: 'preliminary', output };
    }
    yield { type: 'final', output: lastOutput! };
  } else {
    yield { type: 'final', output: await result };
  }
}
