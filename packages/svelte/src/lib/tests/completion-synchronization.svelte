<script lang="ts">
  import { Completion } from '$lib/completion.svelte.js';
  import { createAIContext } from '$lib/context-provider.js';

  let { id }: { id?: string } = $props();

  createAIContext();
  const completion1 = new Completion({ id });
  const completion2 = new Completion({ id });

  export { completion1, completion2 };
</script>
