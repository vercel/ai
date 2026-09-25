'use client';

import { useState } from 'react';
import { EventPlanningSimulation } from './preview-event-planning';
import { MediaSearchSimulation } from './preview-media-search';
import { WeatherSearchSimulation } from './preview-weather-search';

type SimulationType = 'weather' | 'event-planning' | 'media-search';

const PlayIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height={10}
    viewBox="0 0 16 16"
    width={10}
  >
    <path
      clipRule="evenodd"
      d="M14.5528 7.77638C14.737 7.86851 14.737 8.13147 14.5528 8.2236L1.3618 14.8191C1.19558 14.9022 1 14.7813 1 14.5955L1 1.4045C1 1.21865 1.19558 1.09778 1.3618 1.18089L14.5528 7.77638Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

const PauseIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height={10}
    viewBox="0 0 16 16"
    width={10}
  >
    <path
      clipRule="evenodd"
      d="M5.5 2.5V1.75H4V2.5V13.5V14.25H5.5V13.5V2.5ZM12 2.5V1.75H10.5V2.5V13.5V14.25H12V13.5V2.5Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

const Simulation = ({
  isPlaying,
  type,
}: {
  isPlaying: boolean;
  type: SimulationType;
}) => {
  switch (type) {
    case 'weather':
      return <WeatherSearchSimulation isPlaying={isPlaying} />;
    case 'event-planning':
      return <EventPlanningSimulation isPlaying={isPlaying} />;
    case 'media-search':
      return <MediaSearchSimulation isPlaying={isPlaying} />;
    default:
      return null;
  }
};

/**
 * Static weather conversation shown at the top of the generative UI guide
 * (the paused state of the CardPlayer weather simulation).
 */
export const WeatherSearch = () => (
  <div className="not-prose my-6 mx-auto max-w-md rounded-lg border border-gray-alpha-400">
    <WeatherSearchSimulation />
  </div>
);

/**
 * Play/pause card around a looping generative-UI simulation (ported from the
 * legacy ai-sdk.dev app).
 */
export const CardPlayer = ({
  description,
  title,
  type,
}: {
  description: string;
  title: string;
  type: SimulationType;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <section className="not-prose mx-auto my-6 flex w-fit max-w-full flex-col items-center rounded-lg border border-gray-alpha-400">
      <div className="flex w-[350px] max-w-full flex-col items-center">
        <Simulation isPlaying={isPlaying} type={type} />
      </div>
      <div className="flex w-full flex-col gap-1 border-gray-alpha-400 border-t p-4">
        <div className="flex flex-row items-center gap-3">
          <h3 className="font-medium text-gray-1000 text-lg">{title}</h3>
          <button
            aria-label={`${isPlaying ? 'Pause' : 'Play'} ${title} preview`}
            aria-pressed={isPlaying}
            className="flex size-7 items-center justify-center rounded-md bg-gray-200 text-gray-900 hover:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            onClick={() => setIsPlaying(value => !value)}
            type="button"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
        </div>
        <p className="text-gray-900 text-sm leading-5">{description}</p>
      </div>
    </section>
  );
};
