'use client';

import { IconForward10Seconds10 } from '@vercel/geistdocs/assets/icons/icon-forward-10-seconds-10';
import { IconPause } from '@vercel/geistdocs/assets/icons/icon-pause';
import { IconPlayFill } from '@vercel/geistdocs/assets/icons/icon-play-fill';
import { IconRewind10Seconds } from '@vercel/geistdocs/assets/icons/icon-rewind-10-seconds';
import { type RefObject, useCallback, useEffect, useState } from 'react';
import { SPEECH_AUDIO_SRC } from '../media-assets';

const SKIP_SECONDS = 2;

const formatTime = (t: number) => {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function AudioPlayer({
  animationKey,
  audioRef,
}: {
  animationKey: number;
  audioRef: RefObject<HTMLAudioElement>;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.muted = true;
    audio.play().catch(() => {});
  }, [animationKey, audioRef]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [isPlaying, audioRef]);

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(
      audio.duration || 0,
      Math.max(0, audio.currentTime + seconds),
    );
  };

  return (
    <div className="relative flex size-full flex-col items-center justify-center px-6">
      <audio
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
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
      <div className="flex w-full flex-col items-center gap-2.5 px-4">
        <div className="flex w-full animate-[fadein-inplace_400ms_ease-out_both] items-center gap-3 font-mono text-xs text-gray-900">
          <span>{formatTime(currentTime)}</span>
          <div
            aria-label="Audio progress"
            aria-valuemax={Math.round(duration)}
            aria-valuemin={0}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            className="relative h-1 flex-1 cursor-pointer rounded-full bg-gray-200"
            onClick={event => {
              const audio = audioRef.current;
              if (!audio || !duration) return;
              const rect = event.currentTarget.getBoundingClientRect();
              audio.currentTime =
                ((event.clientX - rect.left) / rect.width) * duration;
            }}
            onKeyDown={event => {
              if (event.key === 'ArrowLeft') seek(-SKIP_SECONDS);
              if (event.key === 'ArrowRight') seek(SKIP_SECONDS);
            }}
            role="slider"
            tabIndex={0}
          >
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
            aria-label={`Back ${SKIP_SECONDS} seconds`}
            className="shrink-0 animate-[fadein-inplace_400ms_ease-out_200ms_both] rounded-full border border-gray-400 bg-background-100 p-2 text-gray-900 shadow-sm"
            onClick={() => seek(-SKIP_SECONDS)}
            type="button"
          >
            <IconRewind10Seconds size={12} />
          </button>
          <button
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="shrink-0 animate-[fadein-inplace_400ms_ease-out_350ms_both] rounded-full border border-gray-400 bg-background-100 p-3 shadow-sm"
            onClick={togglePlay}
            type="button"
          >
            {isPlaying ? <IconPause /> : <IconPlayFill className="pl-0.5" />}
          </button>
          <button
            aria-label={`Forward ${SKIP_SECONDS} seconds`}
            className="shrink-0 animate-[fadein-inplace_400ms_ease-out_500ms_both] rounded-full border border-gray-400 bg-background-100 p-2 text-gray-900 shadow-sm"
            onClick={() => seek(SKIP_SECONDS)}
            type="button"
          >
            <IconForward10Seconds10 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
