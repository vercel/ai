const listeners: Record<string, Array<(data: any) => void>> = {};

export function on(event: string, fn: (data: any) => void) {
  (listeners[event] ??= []).push(fn);
  return () => {
    listeners[event] = listeners[event].filter(f => f !== fn);
  };
}

export function emit(event: string, data: any) {
  listeners[event]?.forEach(fn => fn(data));
}
