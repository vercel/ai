import { isAsyncIterable } from '../is-async-iterable';
import { ContextRegistry } from './context';
import { ToolExecutionOptions, ToolExecuteFunction } from './tool';

export async function* executeTool<
  CONTEXT extends Partial<ContextRegistry>,
  INPUT,
  OUTPUT,
>({
  execute,
  input,
  options,
}: {
  execute: ToolExecuteFunction<CONTEXT, INPUT, OUTPUT>;
  input: INPUT;
  options: ToolExecutionOptions<CONTEXT>;
}): AsyncGenerator<
  { type: 'preliminary'; output: OUTPUT } | { type: 'final'; output: OUTPUT }
> {
  const result = execute(input, options);

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
