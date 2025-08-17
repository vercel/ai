import { ChatStatus, UIMessage } from 'ai';
import { createMemo, mergeProps } from 'solid-js';

export default function Message(props: {
  status: ChatStatus;
  message: UIMessage;
  regenerate: ({ messageId }: { messageId: string }) => void;
  sendMessage: ({
    text,
    messageId,
  }: {
    text: string;
    messageId?: string;
  }) => void;
}) {
  const p = mergeProps(props);
  const isUser = p.message.role === 'user';

  const text = createMemo(() => {
    return p.message.parts
      .map(part => (part.type === 'text' ? part.text : ''))
      .join('');
  });

  return (
    <div
      class="whitespace-pre-wrap my-2 p-3 rounded-lg shadow"
      classList={{
        "bg-blue-100 text-right ml-10": isUser,
        "bg-gray-100 text-left mr-10": !isUser,
      }}
    >
      <div class="font-semibold">{isUser ? 'User:' : 'AI:'}</div>
      <div>
        {text()}
      </div>
      {props.message.role === 'user' && (
        <>
          <button
            onClick={() => p.regenerate({ messageId: p.message.id })}
            class="px-3 py-1 mt-2 text-sm transition-colors bg-gray-200 rounded-md hover:bg-gray-300"
            disabled={props.status !== 'ready'}
          >
            Regenerate
          </button>
          <button
            onClick={() =>
              p.sendMessage({ text: 'Hello', messageId: p.message.id })
            }
            class="px-3 py-1 mt-2 text-sm transition-colors bg-gray-200 rounded-md hover:bg-gray-300"
            disabled={p.status !== 'ready'}
          >
            Replace with Hello
          </button>
        </>
      )}
    </div>
  );
}
