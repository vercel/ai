<script>
	import { useAssistant } from '../../../../../packages/core/svelte/use-assistant'

	const { messages, input, submitMessage } = useAssistant({
		api: '/api/assistant',
	});
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
	<h1>useAssistant</h1>
	<ul>
		{#each $messages as message}
			<li>{message.role}: {message.content}</li>
		{/each}
	</ul>
	<form on:submit={submitMessage}>
		<input bind:value={$input} />
		<button type="submit">Send</button>
	</form>
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
