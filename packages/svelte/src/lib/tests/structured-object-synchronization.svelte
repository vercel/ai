<script lang="ts" generics="RESULT">
  import { createAIContext } from "$lib/context-provider.js";
  import { StructuredObject } from "$lib/structured-object.svelte.js";
  import type { Schema } from "@ai-sdk/ui-utils";
  import type { z } from "zod";

  let {
    id,
    api,
    schema,
  }: {
    id?: string;
    api: string;
    schema: z.Schema<RESULT, z.ZodTypeDef, any> | Schema<RESULT>;
  } = $props();

  createAIContext();
  const object1 = new StructuredObject({ id, api, schema });
  const object2 = new StructuredObject({ id, api, schema });

  export { object1, object2 };
</script>
