'use client';

import { Mic, Square } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { LiveWaveform } from './live-waveform';

export interface VoiceButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
> {
  active?: boolean;
  onPress?: () => void;
}

const VoiceButton = forwardRef<HTMLButtonElement, VoiceButtonProps>(
  ({ active = false, onPress, className, ...props }, ref) => (
    <Button
      ref={ref}
      onClick={onPress}
      variant={active ? 'destructive' : 'outline'}
      className={cn('h-11 min-w-44 justify-between px-3', className)}
      aria-pressed={active}
      {...props}
    >
      <span className="flex items-center gap-2">
        {active ? <Square className="size-3.5" /> : <Mic className="size-4" />}
        {active ? 'Stop listening' : 'Start listening'}
      </span>
      <LiveWaveform
        state={active ? 'listening' : 'idle'}
        className="h-7 w-14 gap-0.5 [&>span]:w-0.5"
      />
    </Button>
  ),
);

VoiceButton.displayName = 'VoiceButton';

export { VoiceButton };
