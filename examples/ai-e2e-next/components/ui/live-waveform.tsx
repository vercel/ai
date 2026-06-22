import { cn } from '@/lib/utils';

export type WaveformState = 'idle' | 'connecting' | 'listening' | 'speaking';

const barHeights = [10, 18, 30, 20, 36, 24, 14, 28, 16, 32, 20, 12];

export function LiveWaveform({
  state = 'idle',
  className,
}: {
  state?: WaveformState;
  className?: string;
}) {
  const active = state !== 'idle';

  return (
    <div
      role="img"
      aria-label={`${state} audio waveform`}
      className={cn(
        'flex h-12 items-center justify-center gap-1 overflow-hidden',
        className,
      )}
    >
      {barHeights.map((height, index) => (
        <span
          key={`${height}-${index}`}
          data-active={active}
          data-state={state}
          className="realtime-waveform-bar w-1 rounded-full bg-zinc-300 data-[state=listening]:bg-emerald-500 data-[state=speaking]:bg-zinc-950 data-[state=connecting]:bg-amber-500"
          style={{
            height,
            animationDelay: `${index * -65}ms`,
          }}
        />
      ))}
    </div>
  );
}
