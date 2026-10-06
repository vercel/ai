'use client';

import { cn } from '@vercel/geistdocs/utils';
import { IconSpeakerOff } from '@vercel/geistdocs/assets/icons/icon-speaker-off';
import { IconSpeakerVolumeLoud } from '@vercel/geistdocs/assets/icons/icon-speaker-volume-loud';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getChatPreview,
  type ModelKind,
  type Provider,
} from '@/lib/home/code-examples';
import { IMAGE_SRC, VIDEO_SRC } from '../media-assets';
import { ImageGenerationPreview } from './image-generation';
import { AudioPlayer } from './speech-generation';
import { ChatBubble } from './text-generation';
import { TranscriptionPlayer } from './transcription-generation';
import { VideoGenerationPreview } from './video-generation';

export function PreviewPanel({
  kind,
  selectedProvider,
  className,
}: {
  kind: ModelKind;
  selectedProvider: Provider;
  className?: string;
}) {
  const [animationKey, setAnimationKey] = useState(0);
  const [isProviderChange, setIsProviderChange] = useState(false);
  const prevKindRef = useRef(kind);
  const prevProviderRef = useRef(selectedProvider);
  const speechAudioRef = useRef<HTMLAudioElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  // Replay the preview when the capability or provider changes.
  useEffect(() => {
    const kindChanged = prevKindRef.current !== kind;
    const providerChanged = prevProviderRef.current !== selectedProvider;
    if (!kindChanged && !providerChanged) return;

    prevKindRef.current = kind;
    prevProviderRef.current = selectedProvider;
    setIsProviderChange(providerChanged && !kindChanged);
    setAnimationKey(key => key + 1);

    if (kindChanged) {
      setIsMuted(true);
      if (speechAudioRef.current) speechAudioRef.current.muted = true;
    }
  }, [kind, selectedProvider]);

  // Preload the image and video so switching tabs feels instant.
  useEffect(() => {
    const img = new Image();
    img.src = IMAGE_SRC;

    // `<link rel="preload" as="video">` isn't supported, so warm the cache
    // with a detached video element instead.
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = VIDEO_SRC;
  }, []);

  // Mute again when the user leaves the browser tab.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      if (speechAudioRef.current) speechAudioRef.current.muted = true;
      setIsMuted(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = speechAudioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  }, []);

  function renderContent() {
    switch (kind) {
      case 'image':
        return (
          <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
            <ImageGenerationPreview animationKey={animationKey} />
          </div>
        );
      case 'video':
        return (
          <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
            <VideoGenerationPreview animationKey={animationKey} />
          </div>
        );
      case 'speech':
        return (
          <div
            className="flex h-full flex-1 animate-[slideUpFadeIn_500ms_ease-out_both]"
            key={animationKey}
          >
            <AudioPlayer
              animationKey={animationKey}
              audioRef={speechAudioRef}
            />
          </div>
        );
      case 'transcription':
        return (
          <div
            className="flex flex-1 animate-[slideUpFadeIn_500ms_ease-out_both] items-start p-6"
            key={animationKey}
          >
            <TranscriptionPlayer animationKey={animationKey} />
          </div>
        );
      default:
        return (
          <div className="flex flex-1 flex-col justify-start gap-4 p-6">
            {getChatPreview(selectedProvider).map((message, index) => (
              <ChatBubble
                animationKey={animationKey}
                delay={isProviderChange ? 0 : index * 400}
                key={`${animationKey}-${message.role}`}
                message={message}
                skipAnimation={isProviderChange && message.role === 'user'}
              />
            ))}
          </div>
        );
    }
  }

  return (
    <div
      aria-label={`${kind} generation preview`}
      className={cn('relative min-w-0', className)}
      role="region"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-background-100 shadow-sm">
        {renderContent()}
      </div>
      {kind === 'speech' && (
        <button
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          className="absolute right-6 bottom-6 animate-[fadein-inplace_500ms_ease-out_both] text-gray-600"
          key={`mute-${animationKey}`}
          onClick={toggleMute}
          type="button"
        >
          {isMuted ? (
            <IconSpeakerOff size={16} />
          ) : (
            <IconSpeakerVolumeLoud size={16} />
          )}
        </button>
      )}
    </div>
  );
}
