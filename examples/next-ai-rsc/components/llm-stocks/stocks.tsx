'use client';

import { useActions, useUIState } from 'ai/rsc';

import type { AI } from '../../app/action';

export function Stocks({ stocks }: { stocks: any[] }) {
  const [, setMessages] = useUIState<typeof AI>();
  const { submitUserMessage } = useActions();

  return (
    <div className="flex flex-col sm:flex-row text-sm gap-2 mb-4 overflow-y-scroll pb-4">
      {stocks.map(stock => (
        <button
          key={stock.symbol}
          className="bg-zinc-900 text-left p-2 rounded-lg flex flex-row gap-2 cursor-pointer hover:bg-zinc-800 sm:w-52"
          onClick={async () => {
            const response = await submitUserMessage(`View ${stock.symbol}`);
            setMessages(currentMessages => [...currentMessages, response]);
          }}
        >
          <div
            className={`text-xl ${
              stock.delta > 0 ? 'text-green-600' : 'text-red-600'
            } p-2 w-11 bg-white/10 flex flex-row justify-center rounded-md`}
          >
            {stock.delta > 0 ? '↑' : '↓'}
          </div>
          <div className="flex flex-col">
            <div className="text-zinc-300 bold uppercase">{stock.symbol}</div>
            <div className="text-zinc-500 text-base">${stock.price}</div>
          </div>
          <div className="flex flex-col ml-auto">
            <div
              className={`${
                stock.delta > 0 ? 'text-green-600' : 'text-red-600'
              } bold uppercase text-right`}
            >
              {` ${((stock.delta / stock.price) * 100).toFixed(2)}%`}
            </div>
            <div
              className={`${
                stock.delta > 0 ? 'text-green-700' : 'text-red-700'
              } text-base text-right`}
            >
              {stock.delta}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
