import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);

export const runAsyncFnWithoutBlocking = (
  fn: (...args: any) => Promise<any>,
) => {
  fn();
};

export const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

// Fake data
export function getStockPrice(name: string) {
  let total = 0;
  for (let i = 0; i < name.length; i++) {
    total = (total + name.charCodeAt(i) * 9999121) % 9999;
  }
  return total / 100;
}
