import { expectTypeOf } from 'vitest';
import {
  toolSearch,
  type InferToolInput,
  type InferToolOutput,
  type ToolSet,
} from '../index';

const search = toolSearch();
const searchWithConfiguredLimit = toolSearch({ maxResults: 8 });

expectTypeOf<InferToolInput<typeof search>>().toEqualTypeOf<{
  query: string;
}>();
expectTypeOf<InferToolOutput<typeof search>>().toEqualTypeOf<{
  tools: Array<{ name: string; description?: string }>;
}>();
expectTypeOf<
  InferToolOutput<typeof searchWithConfiguredLimit>
>().toEqualTypeOf<{
  tools: Array<{ name: string; description?: string }>;
}>();

// @ts-expect-error maxResults must be a number
toolSearch({ maxResults: '8' });

const tools = {
  search: { ...search, description: 'Search available tools.' },
} satisfies ToolSet;

expectTypeOf<InferToolInput<typeof tools.search>>().toEqualTypeOf<{
  query: string;
}>();
