import { JSONValue } from 'ai';
import { describe, expectTypeOf, it } from 'vitest';

// This file is intentionally red until the generateText inline-tools
// inference bug is fixed. Compile it directly to confirm the current
// implementation still accepts `context: {}` for inline tool objects.

type Context = Record<string, unknown>;

type Schema<T> = {
  readonly __type?: T;
};

type Tool<
  INPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context = Context,
> = {
  inputSchema: Schema<INPUT>;
  contextSchema?: Schema<CONTEXT>;
  execute?: (input: INPUT, options: { context: CONTEXT }) => unknown;
};

type InferToolContext<TOOL extends Tool<any, any>> =
  TOOL extends Tool<any, infer CONTEXT> ? CONTEXT : never;

describe('generateText target behavior', () => {
  it('keeps the control case correct', () => {
    type I3 = InferToolContext<
      Tool<{ location: string }, { weatherApiKey: string }>
    >;
  });
});
