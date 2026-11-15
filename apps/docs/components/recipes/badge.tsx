import type { ReactNode } from 'react';

const variants = {
  blue: 'bg-blue-700 text-white',
  'gray-subtle': 'bg-gray-200 text-gray-1000',
  'amber-subtle': 'bg-amber-200 text-amber-900',
} as const;

const sizes = {
  md: 'h-6 px-2.5 text-xs',
  lg: 'h-8 px-3 text-sm',
} as const;

/**
 * Pill badge matching the legacy @vercel/geist `<Badge>` variants used on
 * the /resources/recipes landing page.
 */
export const Badge = ({
  children,
  variant = 'gray-subtle',
  size = 'md',
  className = '',
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
}) => (
  <span
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium capitalize ${variants[variant]} ${sizes[size]} ${className}`}
  >
    {children}
  </span>
);
