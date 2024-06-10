import { useCompletion } from '@ai-sdk/solid';
import { JSX } from 'solid-js';

export default function Chat() {
  const { completion, input, setInput, handleSubmit, error, data } =
    useCompletion();

  const handleInputChange: JSX.ChangeEventHandlerUnion<
    HTMLInputElement,
    Event
  > = e => {
    setInput(e.target.value);
  };

  return (
    <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {data() && (
        <pre class="p-4 text-sm bg-gray-100">
          {JSON.stringify(data(), null, 2)}
        </pre>
      )}

      {error() && (
        <div class="fixed top-0 left-0 w-full p-4 text-center bg-red-500 text-white">
          {error()?.message}
        </div>
      )}

      {completion()}

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
