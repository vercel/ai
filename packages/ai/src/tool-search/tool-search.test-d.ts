import { expectTypeOf } from 'vitest';
import {
  toolSearch,
  type InferToolInput,
  type InferToolOutput,
  type ToolSet,
} from '../index';

const search = toolSearch();

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

const customSearch = toolSearch({
  search: ({ query, tools }) => {
    expectTypeOf(query).toEqualTypeOf<string>();
    expectTypeOf(tools).toEqualTypeOf<
      Array<{ name: string; description?: string }>
    >();
    return tools.map(tool => tool.name);
  },
});

toolSearch({ search: async ({ tools }) => tools.map(tool => tool.name) });

expectTypeOf<InferToolInput<typeof customSearch>>().toEqualTypeOf<
  InferToolInput<typeof search>
>();
expectTypeOf<InferToolOutput<typeof customSearch>>().toEqualTypeOf<
  InferToolOutput<typeof search>
>();

toolSearch({
  // @ts-expect-error callbacks return names, not tool definitions
  search: ({ tools }) => tools,
});
