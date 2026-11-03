'use client';

import { IconForward10Seconds10 } from '@vercel/geistdocs/assets/icons/icon-forward-10-seconds-10';
import { IconPause } from '@vercel/geistdocs/assets/icons/icon-pause';
import { IconPlayFill } from '@vercel/geistdocs/assets/icons/icon-play-fill';
import { IconRewind10Seconds } from '@vercel/geistdocs/assets/icons/icon-rewind-10-seconds';
import { IconSpeakerOff } from '@vercel/geistdocs/assets/icons/icon-speaker-off';
import { IconSpeakerVolumeLoud } from '@vercel/geistdocs/assets/icons/icon-speaker-volume-loud';
import { cn } from '@vercel/geistdocs/utils';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { IMAGE_SRC, SPEECH_AUDIO_SRC, VIDEO_SRC } from '../media-assets';
import {
  AssistantBubble,
  PromptBar,
  Reveal,
  Shell,
  StreamingText,
  UserBubble,
  useTimeline,
} from './preview-kit';
import { useInView, usePrefersReducedMotion } from './use-scene';

const GENERATION_MS = 1500;
const MAX_BLUR = 20;

interface SceneProps {
  active: boolean;
  reduce: boolean;
}

// --- Text ---

const TEXT_DELAYS = [500, 700];

function TextScene({ active, reduce }: SceneProps) {
  const step = useTimeline(TEXT_DELAYS, { active, reduce });
  return (
    <Shell label="Live preview of text generation">
      <div className="flex flex-1 flex-col justify-center gap-3">
        <Reveal show={step >= 1}>
          <UserBubble>Explain quantum entanglement.</UserBubble>
        </Reveal>
        <Reveal show={step >= 2}>
          <AssistantBubble>
            <StreamingText
              play={step >= 2}
              reduce={reduce}
              text="Two particles stay linked, so measuring one instantly determines the other — even across a great distance."
            />
          </AssistantBubble>
        </Reveal>
      </div>
      <PromptBar value="Ask a question…" />
    </Shell>
  );
}

// --- Shared media (image + video) ---

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Tweens 0 → 1 over `GENERATION_MS` while active, and back to 0 when not. */
function useGenerationProgress(active: boolean, reduce: boolean) {
  const [progress, setProgress] = useState(reduce && active ? 1 : 0);
  const progressRef = useRef(progress);

  useEffect(() => {
    const target = active ? 1 : 0;
    const update = (value: number) => {
      progressRef.current = value;
      setProgress(value);
    };
    if (reduce) {
      update(target);
      return;
    }
    const from = progressRef.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / GENERATION_MS);
      update(from + (target - from) * easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, reduce]);

  const done = active && progress >= 1;
  return { progress, done, blur: done ? 0 : MAX_BLUR * (1 - progress) };
}

function ProgressBadge({
  progress,
  hidden,
}: {
  progress: number;
  hidden: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-3 right-3 inline-flex items-center justify-end rounded-md bg-gray-1000 px-3 py-1.5 text-label-12 font-medium text-background-100 tabular-nums transition-opacity duration-300 ease-out"
      style={{ opacity: hidden ? 0 : 1 }}
    >
      {Math.round(progress * 100)}% complete
    </span>
  );
}

function MediaFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  // 8px inset matches the browser header's padding; the 4px radius is the
  // window's 12px corner minus that inset.
  return (
    <div
      aria-label={label}
      className="h-[309px] overflow-hidden p-2"
      role="img"
    >
      <div className="relative size-full overflow-hidden rounded-[4px]">
        {children}
      </div>
    </div>
  );
}

function ImageScene({ active, reduce }: SceneProps) {
  const { progress, done, blur } = useGenerationProgress(active, reduce);
  const [hideBadge, setHideBadge] = useState(reduce);

  useEffect(() => {
    if (!done || reduce) return;
    const timeout = setTimeout(() => setHideBadge(true), 1000);
    return () => clearTimeout(timeout);
  }, [done, reduce]);

  return (
    <MediaFrame label="Live preview of image generation">
      <img
        alt="AI-generated teddy bear hiking in the mountains"
        className="size-full object-cover"
        src={IMAGE_SRC}
        style={{ filter: `blur(${blur}px)` }}
      />
      <ProgressBadge hidden={hideBadge} progress={progress} />
    </MediaFrame>
  );
}

function VideoScene({ active, reduce }: SceneProps) {
  const { progress, done, blur } = useGenerationProgress(active, reduce);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (done && !reduce) videoRef.current?.play().catch(() => {});
  }, [done, reduce]);

  return (
    <MediaFrame label="Live preview of video generation">
      <video
        className="size-full object-cover"
        loop
        muted
        playsInline
        preload="auto"
        ref={videoRef}
        src={VIDEO_SRC}
        style={{ filter: `blur(${blur}px)` }}
      />
      <ProgressBadge hidden={done} progress={progress} />
    </MediaFrame>
  );
}

// --- Speech ---

function formatTime(t: number): string {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function SpeechScene({ active, reduce }: SceneProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.muted = true;
    setIsMuted(true);
    if (active && !reduce) audio.play().catch(() => {});
  }, [active, reduce]);

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (audio)
      audio.currentTime = Math.min(
        audio.duration || 0,
        Math.max(0, audio.currentTime + seconds),
      );
  };

  return (
    <Shell label="Live preview of speech generation">
      <div className="relative flex flex-1 flex-col items-center justify-center gap-3">
        <audio
          onEnded={() => setIsPlaying(false)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={() =>
            setCurrentTime(audioRef.current?.currentTime ?? 0)
          }
          ref={audioRef}
          src={SPEECH_AUDIO_SRC}
        >
          <track
            default
            kind="captions"
            label="English"
            src="/images/home/speech.vtt"
            srcLang="en"
          />
        </audio>
        <div className="flex w-full items-center gap-3 font-mono text-label-13 text-gray-900">
          <span>{formatTime(currentTime)}</span>
          <div className="relative h-1 flex-1 rounded-full bg-gray-200">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gray-1000"
              style={{
                width: duration ? `${(currentTime / duration) * 100}%` : '0%',
              }}
            />
          </div>
          <span>{duration ? formatTime(duration) : '0:00'}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            aria-label="Rewind 10 seconds"
            className="flex shrink-0 items-center justify-center rounded-full border border-gray-400 bg-background-100 p-2 text-gray-900 shadow-sm"
            onClick={() => seek(-10)}
            type="button"
          >
            <IconRewind10Seconds size={12} />
          </button>
          <button
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex shrink-0 items-center justify-center rounded-full border border-gray-400 bg-background-100 p-3 shadow-sm [&_svg]:size-4"
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (audio.paused) audio.play().catch(() => {});
              else audio.pause();
            }}
            type="button"
          >
            {isPlaying ? <IconPause /> : <IconPlayFill className="pl-0.5" />}
          </button>
          <button
            aria-label="Forward 10 seconds"
            className="flex shrink-0 items-center justify-center rounded-full border border-gray-400 bg-background-100 p-2 text-gray-900 shadow-sm"
            onClick={() => seek(10)}
            type="button"
          >
            <IconForward10Seconds10 size={12} />
          </button>
        </div>
        <button
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          className="absolute right-0 bottom-0 text-gray-600"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.muted = !audio.muted;
            setIsMuted(audio.muted);
          }}
          type="button"
        >
          {isMuted ? (
            <IconSpeakerOff size={16} />
          ) : (
            <IconSpeakerVolumeLoud size={16} />
          )}
        </button>
      </div>
    </Shell>
  );
}

// --- Transcription ---

const TRANSCRIPTION_SEGMENTS = [
  { start: 0.119, text: 'You' },
  { start: 0.259, text: ' can' },
  { start: 0.459, text: ' build' },
  { start: 0.72, text: ' and' },
  { start: 0.879, text: ' host' },
  { start: 1.36, text: ' many' },
  { start: 1.6, text: ' different' },
  { start: 1.899, text: ' types' },
  { start: 2.119, text: ' of' },
  { start: 2.259, text: ' applications' },
  { start: 3.48, text: ' from' },
  { start: 3.779, text: ' static' },
  { start: 4.179, text: ' sites' },
  { start: 4.539, text: ' with' },
  { start: 4.799, text: ' your' },
  { start: 4.96, text: ' favorite' },
  { start: 5.319, text: ' framework,' },
  { start: 5.96, text: ' multi-tenant' },
  { start: 6.559, text: ' applications' },
  { start: 7.699, text: ' or' },
  { start: 7.859, text: ' micro-frontends' },
  { start: 8.78, text: ' to' },
  { start: 9.099, text: ' AI-powered' },
  { start: 9.82, text: ' agents.' },
];

function TranscriptionScene({ active, reduce }: SceneProps) {
  const [visibleCount, setVisibleCount] = useState(
    reduce ? TRANSCRIPTION_SEGMENTS.length : 0,
  );

  useEffect(() => {
    if (reduce) {
      setVisibleCount(TRANSCRIPTION_SEGMENTS.length);
      return;
    }
    setVisibleCount(0);
    if (!active) return;
    const timers = TRANSCRIPTION_SEGMENTS.map((segment, index) =>
      setTimeout(() => setVisibleCount(index + 1), segment.start * 700),
    );
    return () => timers.forEach(clearTimeout);
  }, [active, reduce]);

  const transcribing =
    visibleCount > 0 && visibleCount < TRANSCRIPTION_SEGMENTS.length;

  return (
    <Shell label="Live preview of audio transcription">
      <div className="flex flex-1 flex-col justify-between gap-3">
        <p className="text-copy-14 leading-relaxed">
          {TRANSCRIPTION_SEGMENTS.map((segment, index) => (
            <span
              className={cn(
                'transition-opacity duration-500',
                index < visibleCount ? 'opacity-100' : 'opacity-0',
                index === visibleCount - 1 ? 'text-gray-1000' : 'text-gray-900',
              )}
              key={segment.start}
            >
              {segment.text}
            </span>
          ))}
        </p>
        <div
          aria-hidden="true"
          className={cn(
            'flex items-end gap-[3px] self-end transition-opacity duration-300',
            transcribing ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span className="h-[18px] w-[4.5px] origin-bottom animate-[barPulse_0.8s_ease-in-out_infinite] rounded-full bg-gray-400" />
          <span className="h-[24px] w-[4.5px] origin-bottom animate-[barPulse_0.8s_ease-in-out_0.25s_infinite] rounded-full bg-gray-400" />
          <span className="h-[15px] w-[4.5px] origin-bottom animate-[barPulse_0.8s_ease-in-out_0.5s_infinite] rounded-full bg-gray-400" />
        </div>
      </div>
    </Shell>
  );
}

const SCENES: Record<string, (props: SceneProps) => ReactNode> = {
  text: TextScene,
  image: ImageScene,
  video: VideoScene,
  speech: SpeechScene,
  transcription: TranscriptionScene,
};

export function CorePreview({ previewId }: { previewId: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const reduce = usePrefersReducedMotion();
  const Scene = SCENES[previewId];

  return (
    <div ref={ref}>
      {Scene ? <Scene active={inView} key={previewId} reduce={reduce} /> : null}
    </div>
  );
}
