'use client';

import { useState } from 'react';
import { useInterval } from './use-interval';

const answer =
  "The sky appears blue because of a phenomenon called Rayleigh scattering. When sunlight reaches the Earth's atmosphere, the gases and particles in the air scatter the shorter blue wavelengths of light more effectively than the other colors in the spectrum. This scattered blue light is what we see when we look up at the sky.";

/**
 * Simulated text completion for cookbook demos (ported from the legacy
 * ai-sdk.dev app): click "Answer" to reveal a canned response, word by word
 * when `stream` is set.
 */
export const TextGeneration = ({ stream = false }: { stream?: boolean }) => {
  const [streaming, setStreaming] = useState(false);
  const [index, setIndex] = useState(0);
  const [delay, setDelay] = useState(10);
  const [generation, setGeneration] = useState('');
  const [showLoader, setShowLoader] = useState(false);

  useInterval(
    () => {
      const words = answer.split(' ');
      setGeneration(words.slice(0, index).join(' '));
      setIndex(index + 1);
      setDelay(Math.floor(Math.random() * 150));
      if (index >= words.length) {
        setStreaming(false);
      }
    },
    streaming ? delay : null,
  );

  const start = () => {
    if (stream) {
      setIndex(0);
      setStreaming(true);
      return;
    }
    setShowLoader(true);
    setTimeout(() => {
      setGeneration(answer);
    }, 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        className="w-fit cursor-pointer rounded-md bg-gray-1000 p-2 text-background-100 hover:bg-gray-900"
        onClick={start}
        type="button"
      >
        Answer
      </button>

      {showLoader && generation.length === 0 ? (
        <div className="animate-pulse text-gray-800">Loading...</div>
      ) : generation.length > 0 ? (
        <div className="leading-6">{generation}</div>
      ) : null}
    </div>
  );
};
