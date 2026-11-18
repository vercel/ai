import { IconChevronDown } from '@vercel/geistdocs/assets/icons/icon-chevron-down';
import { cn } from '@vercel/geistdocs/utils';
import type { ComponentProps } from 'react';

/**
 * Native select styled like Geistcn's small `Select`: the browser arrow is
 * replaced by a Geist chevron, and focus swaps the border for Geist's
 * focus border instead of the default outline.
 */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <span className="group relative inline-flex items-center">
      <select
        className={cn(
          'h-8 cursor-pointer appearance-none truncate rounded-md border-none bg-background-100 pr-9 pl-3 text-sm text-gray-1000 shadow-[0_0_0_1px_var(--ds-gray-alpha-400)] transition-[box-shadow,color] duration-200 hover:shadow-[0_0_0_1px_var(--ds-gray-alpha-500)] focus:shadow-[var(--ds-focus-border)] focus:outline-hidden [&_option]:text-gray-1000',
          className,
        )}
        {...props}
      />
      <IconChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 size-(--ds-control-decoration-size) text-gray-700 transition-colors duration-150 ease-in group-hover:text-gray-1000"
      />
    </span>
  );
}
