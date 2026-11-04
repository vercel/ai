import { cn } from '@vercel/geistdocs/utils';
import type { ComponentProps } from 'react';

export function BrowserRoot({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'material-large relative flex w-full flex-col overflow-hidden [--browser-header-height:44px]',
        className,
      )}
      {...props}
    />
  );
}

export function BrowserHeader({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'relative flex h-(--browser-header-height) items-center justify-between py-3 shadow-[0_0_0_1px_var(--ds-gray-alpha-200)]',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex min-w-[62px] items-center gap-1 pl-3"
      >
        <div className="size-2 rounded-full bg-[#EE6D5E]" />
        <div className="size-2 rounded-full bg-[#F3BF4A]" />
        <div className="size-2 rounded-full bg-[#5DC753]" />
      </div>
      <h3 className="flex items-center gap-1 text-label-13 text-gray-800">
        {title}
      </h3>
      <div className="min-w-[62px] pr-1.5" />
    </header>
  );
}
