import type { ReactNode } from 'react';

/**
 * Browser window chrome around interactive cookbook demos (ported from the
 * legacy ai-sdk.dev app).
 */
export const Browser = ({ children }: { children: ReactNode }) => (
  <div className="not-prose my-6 rounded-lg border border-gray-alpha-400 bg-background-100">
    <div className="flex flex-row items-center justify-between rounded-t-lg border-gray-alpha-400 border-b bg-gray-100 p-2">
      <div className="flex flex-row gap-2 pl-1">
        <div className="size-[14px] rounded-full bg-red-700" />
        <div className="size-[14px] rounded-full bg-amber-700" />
        <div className="size-[14px] rounded-full bg-green-700" />
      </div>
      <div className="hidden items-center rounded-md border border-gray-alpha-400 bg-background-100 px-16 py-1 text-gray-900 text-sm md:flex">
        http://localhost:3000
      </div>
      <div className="w-12" />
    </div>
    <div className="p-4 text-gray-1000 text-sm">{children}</div>
  </div>
);
