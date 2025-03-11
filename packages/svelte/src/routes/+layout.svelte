<script lang="ts">
  import { createAIContext } from "$lib/context-provider.js";
  import "../app.css";
  let { children } = $props();

  createAIContext();
</script>

{@render children()}
