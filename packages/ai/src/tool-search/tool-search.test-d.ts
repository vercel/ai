import { expectTypeOf } from 'vitest';
import {
  toolSearch,
  type InferToolInput,
  type InferToolOutput,
  type ToolSet,
  type ToolSearchOptions,
} from '../index';

const search = toolSearch();
const options = {
  search: (query, tools) => {
    expectTypeOf(query).toEqualTypeOf<string>();
    expectTypeOf(tools).toEqualTypeOf<
      Array<{ name: string; description?: string }>
    >();
    return tools.map(tool => tool.name);
  },
} satisfies ToolSearchOptions;
toolSearch(options);
toolSearch({
  search: async (_query, tools) => tools.map(tool => tool.name),
});
toolSearch({
  search: (_query, tools) => ({
    // oxlint-disable-next-line unicorn/no-thenable -- Verify the public PromiseLike return type.
    then: onfulfilled =>
      Promise.resolve(onfulfilled!(tools.map(tool => tool.name))),
  }),
});

expectTypeOf<InferToolInput<typeof search>>().toEqualTypeOf<{
  query: string;
}>();
expectTypeOf<InferToolOutput<typeof search>>().toEqualTypeOf<{
  tools: Array<{ name: string; description?: string }>;
}>();

const tools = {
  search: { ...search, description: 'Search available tools.' },
} satisfies ToolSet;

expectTypeOf<InferToolInput<typeof tools.search>>().toEqualTypeOf<{
  query: string;
}>();
