<script>
	import { useCompletion } from '@ai-sdk/svelte'

	const { completion, input, handleSubmit, data } = useCompletion();
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
	<div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
		<h4 class="pb-4 text-xl font-bold text-gray-900 md:text-xl">
		  useCompletion Example
		</h4>
		<pre>{$data != null ? JSON.stringify($data, null, 2) : ""}</pre>
		{$completion}
		<form on:submit={handleSubmit}>
		  <input
		    class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
			bind:value={$input} 
			placeholder="Say something..."
		  />
		</form>
	  </div>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		flex: 0.6;
	}
</style>
