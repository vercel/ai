<script>
	import { useCompletion } from 'ai/svelte'

	const { completion, input, handleSubmit } =
    useCompletion();
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
	<div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
		<h4 class="text-xl font-bold text-gray-900 md:text-xl pb-4">
		  useCompletion Example
		</h4>
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

	h1 {
		width: 100%;
	}
</style>
