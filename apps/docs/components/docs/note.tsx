import { Callout } from '@vercel/geistdocs/components/callout';
import type { ReactNode } from 'react';

/**
 * Maps the legacy ai-sdk.dev `<Note>` component (from @vercel/geist) onto the
 * geistdocs callout. Extra attributes such as `id` pass through so in-content
 * anchors (for example `/cookbook/guides/r1#deepseek-r1-middleware`) resolve.
 */
export const Note = ({
  children,
  type,
  ...props
}: {
  children: ReactNode;
  type?: 'warning' | 'error' | 'tip' | 'info';
  className?: string;
  id?: string;
}) => (
  <Callout
    {...props}
    type={type === 'warning' ? 'warn' : type === 'error' ? 'error' : 'info'}
  >
    {children}
  </Callout>
);
