import {
  createProviderDefinedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const fileSearchArgsBaseSchema = z
  .object({
    fileSearchStoreNames: z
      .array(z.string())
      .min(1, 'At least one File Search store name must be provided.')
      .describe(
        'Fully-qualified names of the File Search stores to retrieve context from.',
      ),
    metadataFilter: z
      .string()
      .describe(
        'Optional metadata filter expression used to narrow the set of files searched.',
      )
      .optional(),
    maxResults: z
      .number()
      .int()
      .positive()
      .describe(
        'Optional limit for the number of chunks that File Search should return across all stores.',
      )
      .optional(),
  })
  .passthrough();

export type GoogleFileSearchToolArgs = z.infer<
  typeof fileSearchArgsBaseSchema
>;

const fileSearchArgsSchema = lazySchema(() =>
  zodSchema(fileSearchArgsBaseSchema),
);

export const fileSearch = createProviderDefinedToolFactory<
  {},
  GoogleFileSearchToolArgs
>({
  id: 'google.file_search',
  name: 'file_search',
  inputSchema: fileSearchArgsSchema,
});
