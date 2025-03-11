<script lang="ts">
  import { Textarea } from "$demo-lib/components/ui/textarea/index.js";
  import { Completion } from "$lib/index.js";

  const completion = new Completion();

  const submit = debounced(completion.handleSubmit, 300);

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Tab" && completion.completion) {
      event.preventDefault();
      completion.input += " " + completion.completion;
      completion.completion = "";
    }
    submit(event);
  }

  function debounced<T extends (...args: any[]) => void>(
    fn: T,
    delay: number,
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;
    return function (...args: Parameters<T>): void {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }
</script>

<main class="flex h-dvh w-dvw flex-col items-center">
  <div
    class="relative m-3 flex h-full w-full max-w-4xl grid-cols-1 grid-rows-[1fr,120px]"
  >
    <div
      class="
        bg-secondary text-primary/50 border-input ring-offset-background placeholder:text-muted-foreground
        focus-visible:ring-ring pointer-events-none absolute inset-0 -z-10 flex h-full min-h-[80px] w-full rounded-md
        border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:text-sm
      "
    >
      {#if completion.completion}
        {completion.input + " " + completion.completion}
      {/if}
    </div>
    <Textarea
      bind:value={completion.input}
      placeholder="Start typing to generate autocompletions..."
      class="h-full bg-transparent"
      onkeydown={handleKeydown}
    />
  </div>
</main>
