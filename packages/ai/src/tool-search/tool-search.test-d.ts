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
