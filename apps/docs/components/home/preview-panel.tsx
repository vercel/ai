'use client';

import { useEffect, useState } from 'react';
import type { ModelKind } from '@/lib/home/code-examples';
import styles from './home.module.css';

const assets = 'https://e742qlubrjnjqpp0.public.blob.vercel-storage.com/ai-sdk';
const speech =
  'https://ejiidnob33g9ap1r.public.blob.vercel-storage.com/ElevenLabs_2025-11-10T22_10_24_Hayden_pvc_sp110_s50_sb75_se0_b_m2.mp3';
const transcript =
  'You can build and host many different types of applications from static sites with your favorite framework, multi-tenant applications or micro-frontends to AI-powered agents.';

function TranscriptionPreview() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(transcript.length);
      return;
    }
    let visible = 0;
    const timer = setInterval(() => {
      visible += 3;
      setCount(visible);
      if (visible >= transcript.length) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="p-6 text-sm leading-relaxed text-gray-900">
      <span className="sr-only">{transcript}</span>
      <span aria-hidden="true">{transcript.slice(0, count)}</span>
    </p>
  );
}

export function PreviewPanel({ kind }: { kind: ModelKind }) {
  return (
    <div
      aria-label={`${kind} generation preview`}
      className="relative hidden min-w-0 overflow-hidden rounded-lg border border-gray-400 bg-background-100 shadow-sm md:flex md:flex-col"
    >
      <div className="flex min-h-12 items-center border-b border-gray-400 px-4 text-xs text-gray-700">
        Example output
      </div>
      <div className="flex flex-1 flex-col justify-center overflow-hidden">
        {kind === 'text' ? (
          <div
            className={`flex flex-col gap-5 p-5 text-[13px] leading-relaxed ${styles.reveal}`}
          >
            <p className="max-w-[240px] self-end rounded-xl bg-gray-1000 px-3 py-2 text-background-100">
              Explain quantum entanglement in simple terms.
            </p>
            <p className="text-gray-900">
              Entanglement is nature’s way of keeping a secret between two
              particles. Once entangled, observing one instantly reveals
              information about the other — no signal needed, no matter how far
              apart they are.
            </p>
          </div>
        ) : kind === 'image' ? (
          <div className="p-4">
            <img
              alt="AI-generated teddy bear hiking in the mountains"
              className={`aspect-square w-full rounded object-cover ${styles.mediaReveal}`}
              height={280}
              src={`${assets}/teddy-bear-hiking.png`}
              width={280}
            />
          </div>
        ) : kind === 'video' ? (
          <video
            aria-label="Example video of a hippo chasing a cheetah"
            className="aspect-square w-full object-cover"
            controls
            loop
            muted
            playsInline
            preload="none"
            src={`${assets}/hippo-chases-cheetah.mp4`}
          />
        ) : kind === 'speech' ? (
          <div className="space-y-6 p-5">
            <p className="text-sm text-gray-900">{transcript}</p>
            <audio
              aria-label="Example generated speech"
              className="w-full"
              controls
              preload="none"
              src={speech}
            >
              <track
                default
                kind="captions"
                label="English"
                src="/images/home/speech.vtt"
                srcLang="en"
              />
            </audio>
          </div>
        ) : (
          <TranscriptionPreview />
        )}
      </div>
    </div>
  );
}
