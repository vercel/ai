import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * The model asks for deferred tools by name. Gemini loads their schemas and
 * continues within the same request, so the call and its result arrive as a
 * provider-executed pair.
 */
const toolSearchInputSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** Names of the deferred tools whose schemas the model wants loaded. */
      function_names: z.array(z.string()).optional(),
    }),
  ),
);

/** Declarations Gemini loaded, in the shape it sends them back. */
const toolSearchOutputSchema = lazySchema(() =>
  zodSchema(z.array(z.record(z.string(), z.unknown()))),
);

/**
 * Tool Retrieval: Gemini holds back the parameter schemas of tools marked
 * `providerOptions: { google: { deferLoading: true } }` and loads them on
 * demand, so a large tool library costs only names and short descriptions up
 * front.
 *
 * Never set `deferLoading` on this tool itself -- it is what retrieves the
 * others.
 *
 * @note Only available with `google.interactions(...)`, on Gemini 3.6 and
 * later models.
 *
 * @see https://aistudio.google.com/docs/tool-retrieval
 */
export const toolSearch = createProviderExecutedToolFactory<
  { function_names?: Array<string> },
  Array<Record<string, unknown>>,
  {}
>({
  id: 'google.tool_search',
  inputSchema: toolSearchInputSchema,
  outputSchema: toolSearchOutputSchema,
});
