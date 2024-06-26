import { For, JSX, createEffect } from 'solid-js';
import { useChat } from '@ai-sdk/solid';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat();

  createEffect(() => {
    console.log(messages());
  });

  return (
    <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <For each={messages()} fallback={<div>No messages</div>}>
        {m => (
          <div class="whitespace-pre-wrap">
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        )}
      </For>

      <form onSubmit={handleSubmit}>
        <input
          class="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input()}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
