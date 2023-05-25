'use client';

import { useChat } from '@vercel/ai-utils';

export function Chat() {
  const { messages, append } = useChat({
    initialMessages: [],
    api: '/api/generate',
    parser: async (res, { onCompletion, onToken, onStart }) => {
      // This data is a ReadableStream
      const data = res.body;
      if (!data) {
        return new ReadableStream();
      }
      if (onStart) {
        onStart();
      }
      const reader = data.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedValue = ''; // Variable to accumulate chunks

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);
        accumulatedValue += chunkValue; // Accumulate the chunk value

        // Check if the accumulated value contains the delimiter
        const delimiter = '\n';
        const chunks = accumulatedValue.split(delimiter);

        // Process all chunks except the last one (which may be incomplete)
        while (chunks.length > 1) {
          const chunkToDispatch = chunks.shift(); // Get the first chunk
          if (chunkToDispatch && chunkToDispatch.length > 0) {
            const chunk = JSON.parse(chunkToDispatch);
            if (onToken) {
              onToken(chunk);
            }
          }
        }

        // The last chunk may be incomplete, so keep it in the accumulated value
        accumulatedValue = chunks[0];
      }

      // Process any remaining accumulated value after the loop is done
      if (accumulatedValue.length > 0) {
        if (onCompletion) {
          onCompletion(accumulatedValue);
        }
      }

      return res.body as ReadableStream<any>;
    },
  });

  return (
    <div>
      {messages && messages.length
        ? messages.map((m) => <div>{m.content}</div>)
        : null}
      
      <form>
        <textarea 
      </form>
    </div>
  );
}
