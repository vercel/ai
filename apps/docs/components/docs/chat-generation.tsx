'use client';

import { type ReactNode, useState } from 'react';
import { useInterval } from './use-interval';

interface Message {
  role: string;
  content: string;
  display?: ReactNode;
}

/**
 * Simulated chat exchange for cookbook demos (ported from the legacy
 * ai-sdk.dev app): click "Send Message" to submit the staged input and
 * reveal the assistant reply, word by word when `stream` is set.
 */
export const ChatGeneration = ({
  stream = false,
  history,
  inputMessage,
  outputMessage,
}: {
  stream?: boolean;
  history: Message[];
  inputMessage: Message;
  outputMessage: Message;
}) => {
  const [streaming, setStreaming] = useState(false);
  const [index, setIndex] = useState(0);
  const [delay, setDelay] = useState(10);
  const [generation, setGeneration] = useState('');
  const [showLoader, setShowLoader] = useState(false);
  const [hasSent, setHasSent] = useState(false);

  useInterval(
    () => {
      const words = outputMessage.content.split(' ');
      setGeneration(words.slice(0, index).join(' '));
      setIndex(index + 1);
      setDelay(Math.floor(Math.random() * 150));
      if (index >= words.length) {
        setStreaming(false);
      }
    },
    streaming ? delay : null,
  );

  const send = () => {
    setHasSent(true);
    setTimeout(() => {
      if (stream) {
        setIndex(0);
        setStreaming(true);
        return;
      }
      setShowLoader(true);
      setTimeout(() => {
        setGeneration(outputMessage.content);
      }, 2000);
    }, 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {history.map(message => (
          <div className="leading-6" key={message.role}>
            {message.role}: {message.content}
          </div>
        ))}

        {hasSent ? (
          <div className="leading-6">
            {inputMessage.role}: {inputMessage.content}
          </div>
        ) : null}

        {showLoader && generation.length === 0 ? (
          <div className="leading-6 text-gray-800">Typing...</div>
        ) : generation.length > 0 ? (
          <div className="leading-6">
            {outputMessage.role}: {generation} {outputMessage.display}
          </div>
        ) : null}
      </div>

      <div className="flex flex-row gap-4">
        <div className="flex flex-grow flex-row items-center rounded-md border border-gray-alpha-400 px-3 py-2">
          {hasSent ? (
            <div className="text-gray-700">Type your message</div>
          ) : (
            <div className="flex h-full flex-row items-center">
              <div>{inputMessage.content}</div>
              <div className="h-5 w-px animate-blink bg-gray-700" />
            </div>
          )}
        </div>
        <button
          className="w-fit cursor-pointer rounded-md bg-gray-1000 p-2 text-background-100 hover:bg-gray-900"
          onClick={send}
          type="button"
        >
          Send Message
        </button>
      </div>
    </div>
  );
};
