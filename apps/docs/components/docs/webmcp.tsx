'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { type ModelContext, registerDocsTools } from '@/lib/webmcp';

export const DocsWebMCP = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const finishNavigation = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isPending) finishNavigation.current?.();
  }, [isPending]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;

    return registerDocsTools(context, (href, signal) => {
      signal.throwIfAborted();
      if (finishNavigation.current) {
        return Promise.reject(
          new Error('A documentation navigation is already in progress.'),
        );
      }
      const destination = new URL(href, window.location.href).href;
      if (window.location.href === destination) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          finishNavigation.current = null;
          signal.removeEventListener('abort', abort);
        };
        const abort = () => {
          cleanup();
          reject(signal.reason);
        };
        finishNavigation.current = () => {
          cleanup();
          if (window.location.href === destination) resolve();
          else
            reject(
              new Error('The requested documentation page was not reached.'),
            );
        };
        signal.addEventListener('abort', abort, { once: true });
        try {
          startTransition(() => router.push(href));
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    });
  }, [router]);

  return null;
};
