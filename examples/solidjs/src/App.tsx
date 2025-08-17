import type { Component } from 'solid-js';
import { useChat } from '@ai-sdk/solid';
import { DefaultChatTransport, UIMessage } from 'ai';
import { createEffect, createSignal, For } from 'solid-js';
import Message from './_components/message';
const baseUrl = import.meta.env.VITE_BASE_URL;

const App: Component = () => {
  const [newMessage, setNewMessage] = createSignal<UIMessage[]>([]);
  const {messages, sendMessage, status, regenerate, } = useChat({
    transport: new DefaultChatTransport({
      api: `${baseUrl}/`
    }),
    onFinish: (message) => {
      console.log('onFinish', message);
    }
  });

  createEffect(() => {
    const m = messages();
    setNewMessage([...m]);
  });

  return (
    <div class="text-4xl text-green-700 text-center py-20">
      <For each={newMessage()}>
        {(message) => <Message message={message} status={status()} regenerate={regenerate} sendMessage={sendMessage} />}
      </For>
      <button onClick={() => sendMessage({
        text: 'Hello, world!'
      })}>Send</button>
    </div>
  );
};

export default App;
