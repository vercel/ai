<script lang="ts" generics="RESULT">
  import { createAIContext } from '../context-provider.js';
  import { StructuredObject } from '../structured-object.svelte.js';
  import type { Schema } from 'ai';
  import type { z } from 'zod';

  let {
    id,
    api,
    schema,
  }: {
    id?: string;
    api: string;
    schema: z.Schema<RESULT, z.ZodTypeDef, unknown> | Schema<RESULT>;
  } = $props();

  createAIContext();
  const object1 = new StructuredObject({ id, api, schema });
  const object2 = new StructuredObject({ id, api, schema });

  export { object1, object2 };
</script>
