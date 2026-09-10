import { ThrottleReproduction } from './throttle-reproduction';

export default function Page() {
  return (
    <div className="flex w-full flex-col gap-12 py-24">
      <div className="mx-auto w-full max-w-3xl px-6">
        <h1 className="pb-3 text-2xl font-bold text-gray-900">
          useChat publication cadence
        </h1>
        <p className="text-sm text-gray-700">
          Compare the default 50ms message publication cadence with the explicit
          unthrottled opt-out.
        </p>
      </div>

      <ThrottleReproduction mode="default" />
      <ThrottleReproduction mode="unthrottled" />
    </div>
  );
}
