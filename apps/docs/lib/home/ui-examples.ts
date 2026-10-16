import type { CodeExample } from './code-examples';

function staticTab(label: string, filename: string, code: string): CodeExample {
  return { label, filename, kind: 'text', getCode: () => code };
}

export const UI_EXAMPLES: CodeExample[] = [
  staticTab(
    'useChat',
    'chat.tsx',
    `'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });
  const [input, setInput] = useState('');

  return (
    <>
      {messages.map(message => (
        <div key={message.id}>
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, i) =>
            part.type === 'text' ? (
              <span key={i}>{part.text}</span>
            ) : null,
          )}
        </div>
      ))}
      <form onSubmit={e => {
        e.preventDefault();
        sendMessage({ text: input });
        setInput('');
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
        />
      </form>
    </>
  );
}`,
  ),
  staticTab(
    'useCompletion',
    'completion.tsx',
    `'use client';

import { useCompletion } from '@ai-sdk/react';

export default function Completion() {
  const {
    completion,
    input,
    handleInputChange,
    handleSubmit,
  } = useCompletion({
    api: '/api/completion',
  });

  return (
    <form onSubmit={handleSubmit}>
      <input
        name="prompt"
        value={input}
        onChange={handleInputChange}
      />
      <button type="submit">Submit</button>
      <div>{completion}</div>
    </form>
  );
}`,
  ),
  staticTab(
    'useObject',
    'object-generation.tsx',
    `'use client';

import {
  experimental_useObject as useObject,
} from '@ai-sdk/react';
import { z } from 'zod/v4';

const notificationSchema = z.object({
  notifications: z.array(z.object({
    name: z.string(),
    message: z.string(),
  })),
});

export default function Notifications() {
  const { object, submit } = useObject({
    api: '/api/notifications',
    schema: notificationSchema,
  });

  return (
    <>
      <button
        onClick={() =>
          submit('Messages during finals week.')
        }
      >
        Generate
      </button>
      {object?.notifications?.map((n, i) => (
        <div key={i}>
          <p>{n?.name}</p>
          <p>{n?.message}</p>
        </div>
      ))}
    </>
  );
}`,
  ),
  staticTab(
    'Chat with Tools',
    'chat-tools.tsx',
    `'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Chat() {
  const { messages, sendMessage, addToolOutput } =
    useChat({
      transport: new DefaultChatTransport({
        api: '/api/chat',
      }),
      async onToolCall({ toolCall }) {
        if (!toolCall.dynamic && toolCall.toolName === 'getLocation') {
          addToolOutput({
            tool: 'getLocation',
            toolCallId: toolCall.toolCallId,
            output: 'San Francisco',
          });
        }
      },
    });
  const [input, setInput] = useState('');

  return (
    <form onSubmit={e => {
      e.preventDefault();
      sendMessage({ text: input });
      setInput('');
    }}>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
      />
    </form>
  );
}`,
  ),
  staticTab(
    'Generative UI',
    'generative-ui.tsx',
    `'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useState } from 'react';

type WeatherProps = {
  temperature: number;
  weather: string;
  location: string;
};

export const Weather = ({ temperature, weather, location }: WeatherProps) => {
  return (
    <div>
      <h2>Current Weather for {location}</h2>
      <p>Condition: {weather}</p>
      <p>Temperature: {temperature}°C</p>
    </div>
  );
};

type WeatherMessage = UIMessage<unknown, never, {
  displayWeather: { input: { location: string }; output: WeatherProps };
}>;

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat<WeatherMessage>({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  return (
    <>
      {messages.map(message => (
        <div key={message.id}>
          {message.parts.map((part, i) => {
            if (part.type === 'text') {
              return <span key={i}>{part.text}</span>;
            }
            if (part.type === 'tool-displayWeather') {
              switch (part.state) {
                case 'input-available':
                  return <div key={i}>Loading...</div>;
                case 'output-available':
                  return (
                    <Weather key={i} {...part.output} />
                  );
              }
            }
          })}
        </div>
      ))}
      <form onSubmit={e => {
        e.preventDefault();
        sendMessage({ text: input });
        setInput('');
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
        />
      </form>
    </>
  );
}`,
  ),
  staticTab(
    'Streaming Data',
    'streaming-data.tsx',
    `'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

type DataMessage = UIMessage<unknown, {
  notification: { message: string };
  weather: { city: string; weather: string };
}>;

export default function Chat() {
  const { messages } = useChat<DataMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onData: dataPart => {
      if (dataPart.type === 'data-notification') {
        console.log(dataPart.data.message);
      }
    },
  });

  return (
    <>
      {messages.map(m => (
        <div key={m.id}>
          {m.parts
            .filter(p => p.type === 'data-weather')
            .map((p, i) => (
              <span key={i}>
                Weather in {p.data.city}:
                {p.data.weather}
              </span>
            ))}
          {m.parts
            .filter(p => p.type === 'text')
            .map((p, i) => (
              <div key={i}>{p.text}</div>
            ))}
        </div>
      ))}
    </>
  );
}`,
  ),
  staticTab(
    'Chat Persistence',
    'chat-persistence.tsx',
    `'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useState } from 'react';

export default function Chat({
  id,
  initialMessages,
}: {
  id?: string;
  initialMessages?: UIMessage[];
}) {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.parts
            .map(p => p.type === 'text' ? p.text : '')
            .join('')}
        </div>
      ))}
      <form onSubmit={e => {
        e.preventDefault();
        sendMessage({ text: input });
        setInput('');
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
        />
      </form>
    </div>
  );
}`,
  ),
  staticTab(
    'Stream Status',
    'stream-status.tsx',
    `'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: '/api/chat',
      }),
    });

  return (
    <>
      {messages.map(m => (
        <div key={m.id}>
          {m.parts.map((p, i) =>
            p.type === 'text' ? (
              <span key={i}>{p.text}</span>
            ) : null,
          )}
        </div>
      ))}
      {status === 'streaming' && (
        <button onClick={stop}>Stop generating</button>
      )}
      {status === 'submitted' && <div>Thinking...</div>}
      <form onSubmit={e => {
        e.preventDefault();
        sendMessage({ text: input });
        setInput('');
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
        />
      </form>
    </>
  );
}`,
  ),
];
