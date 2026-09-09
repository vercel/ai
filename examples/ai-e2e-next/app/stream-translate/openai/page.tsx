'use client';

import { parseJSON } from '@ai-sdk/provider-utils';
import { useEffect, useRef, useState } from 'react';
import type { TranslationEvent } from './translation-event';

const targetLanguages = [
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
];

export default function Page() {
  const [text, setText] = useState(
    'Hello from the AI SDK! Streaming translation is experimental.',
  );
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [sourceText, setSourceText] = useState('');
  const [translationText, setTranslationText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string>();
  const [durationInSeconds, setDurationInSeconds] = useState<number>();
  const [usage, setUsage] = useState<unknown>();
  const [warnings, setWarnings] = useState<unknown[]>([]);
  const [error, setError] = useState<string>();
  const [isTranslating, setIsTranslating] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const abortControllerRef = useRef<AbortController>();

  useEffect(
    () => () => {
      if (audioUrl != null) {
        URL.revokeObjectURL(audioUrl);
      }
    },
    [audioUrl],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsTranslating(true);
    setSourceText('');
    setTranslationText('');
    setDurationInSeconds(undefined);
    setUsage(undefined);
    setWarnings([]);
    setError(undefined);
    setAudioUrl(undefined);
    setIsFinished(false);

    const audioChunks: Uint8Array[] = [];

    try {
      const response = await fetch('/api/stream-translate/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage }),
        signal: abortController.signal,
      });

      if (!response.ok || response.body == null) {
        throw new Error(await response.text());
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = async (line: string) => {
        if (line.trim().length === 0) {
          return;
        }

        const translationEvent = (await parseJSON({
          text: line,
        })) as TranslationEvent;

        switch (translationEvent.type) {
          case 'source-transcript-delta':
            setSourceText(current => current + translationEvent.delta);
            break;
          case 'source-transcript-partial':
          case 'source-transcript-final':
            setSourceText(translationEvent.text);
            break;
          case 'output-text-delta':
            setTranslationText(current => current + translationEvent.delta);
            break;
          case 'audio':
            audioChunks.push(decodeBase64(translationEvent.audio));
            break;
          case 'finish':
            setSourceText(translationEvent.sourceText);
            setTranslationText(translationEvent.translationText);
            setDurationInSeconds(translationEvent.durationInSeconds);
            setUsage(translationEvent.usage);
            setWarnings(translationEvent.warnings);
            setIsFinished(true);
            break;
          case 'error':
            setError(translationEvent.message);
            if (translationEvent.fatal) {
              throw new Error(translationEvent.message);
            }
            break;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          await processLine(line);
        }

        if (done) {
          await processLine(buffer);
          break;
        }
      }

      if (audioChunks.length > 0) {
        setAudioUrl(
          URL.createObjectURL(createPcmWav(audioChunks, { sampleRate: 24000 })),
        );
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = undefined;
        setIsTranslating(false);
      }
    }
  };

  return (
    <main className="w-full max-w-3xl px-6 py-16 mx-auto">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">
          OpenAI streamTranslate
        </h1>
        <p className="text-gray-600">
          Generates deterministic PCM input with OpenAI TTS, streams it through
          the OpenAI speech translation model, and plays the translated audio.
        </p>
      </div>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="font-medium">English text to synthesize</span>
          <textarea
            className="w-full px-3 py-2 border rounded-md min-h-28 disabled:bg-gray-100"
            value={text}
            onChange={event => setText(event.target.value)}
            disabled={isTranslating}
            required
          />
        </label>

        <label className="block space-y-2">
          <span className="font-medium">Target language</span>
          <select
            className="block w-full px-3 py-2 border rounded-md disabled:bg-gray-100"
            value={targetLanguage}
            onChange={event => setTargetLanguage(event.target.value)}
            disabled={isTranslating}
          >
            {targetLanguages.map(language => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isTranslating}
            className="px-4 py-2 text-white bg-blue-600 rounded-md disabled:bg-blue-300"
          >
            {isTranslating ? 'Translating…' : 'Translate'}
          </button>
          {isTranslating && (
            <button
              type="button"
              className="px-4 py-2 border rounded-md"
              onClick={() => abortControllerRef.current?.abort()}
            >
              Stop
            </button>
          )}
        </div>
      </form>

      {error != null && (
        <div
          className="p-4 mt-6 text-red-700 bg-red-100 border border-red-300 rounded-md"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 mt-8 md:grid-cols-2">
        <OutputCard
          title="Source transcript"
          text={sourceText}
          emptyText={
            isFinished
              ? 'The provider returned no source transcript.'
              : 'Waiting for output…'
          }
        />
        <OutputCard
          title="Translation"
          text={translationText}
          emptyText={
            isFinished
              ? 'The provider returned no translated text.'
              : 'Waiting for output…'
          }
        />
      </div>

      {audioUrl != null && (
        <section className="p-4 mt-4 border rounded-md">
          <h2 className="font-semibold">Translated audio</h2>
          <audio className="w-full mt-3" controls src={audioUrl}>
            <track kind="captions" />
          </audio>
        </section>
      )}

      {(durationInSeconds != null || usage != null || warnings.length > 0) && (
        <details className="p-4 mt-4 border rounded-md">
          <summary className="font-semibold cursor-pointer">Metadata</summary>
          <pre className="mt-3 overflow-auto text-sm">
            {JSON.stringify(
              { durationInSeconds, usage, warnings },
              undefined,
              2,
            )}
          </pre>
        </details>
      )}
    </main>
  );
}

function OutputCard({
  title,
  text,
  emptyText,
}: {
  title: string;
  text: string;
  emptyText: string;
}) {
  return (
    <section className="p-4 border rounded-md min-h-36">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-gray-700">
        {text || emptyText}
      </p>
    </section>
  );
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createPcmWav(
  chunks: Uint8Array[],
  { sampleRate }: { sampleRate: number },
) {
  const pcmLength = chunks.reduce((length, chunk) => length + chunk.length, 0);
  const bytes = new Uint8Array(44 + pcmLength);
  const view = new DataView(bytes.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, pcmLength, true);

  let offset = 44;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return new Blob([bytes], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
