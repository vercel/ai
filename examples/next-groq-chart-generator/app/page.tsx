'use client';

import { useState } from 'react';
import { submitUserMessage } from './actions';
import { ChartComponent } from './chart-component';

// 1. Define the shape of the Chart Data
interface ChartData {
  name: string;
  value: number;
}

// 2. Define the Message with strict types (No 'any')
interface Message {
  id: number;
  role: 'user' | 'ai';
  // Content can be a String (user text) OR ChartData Array (AI response)
  content: string | ChartData[]; 
  type?: string;
}

export default function Home() {
  const [inputValue, setInputValue] = useState('');
  
  // 3. Apply the interface here
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;
    setInputValue('');
    setLoading(true);

    // Add User Message (Content is a string)
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', content: userText }
    ]);

    // Call Server Action
    const response = await submitUserMessage(userText);

    // Add AI Response (Content is ChartData[])
    if (response.success) {
      setMessages((prev) => [
        ...prev,
        { 
          id: Date.now() + 1, 
          role: 'ai', 
          content: response.data as ChartData[], // Tell TS this is data
          type: response.type 
        }
      ]);
    } else {
      // Handle error case
      setMessages((prev) => [
        ...prev,
        { 
          id: Date.now() + 1, 
          role: 'ai', 
          content: [], 
          type: 'error' 
        }
      ]);
    }
    setLoading(false);
  };

  return (
    <main className="flex flex-col h-screen bg-black text-white">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center">
        <h1 className="text-xl font-bold">GEN<span className="text-blue-500">UI</span> DASHBOARD</h1>
        <span className="text-xs text-gray-500">Groq + Next.js</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'user' ? (
              <div className="bg-blue-600 px-4 py-2 rounded-2xl rounded-tr-sm max-w-[80%]">
                {/* We cast as string because we know user role = string */}
                {m.content as string}
              </div>
            ) : (
              <div className="w-full max-w-2xl">
                {m.type === 'error' ? (
                  <div className="text-red-500">Failed to generate data.</div>
                ) : (
                  // We cast as ChartData[] because we know ai role = data
                  <ChartComponent 
                    data={m.content as ChartData[]} 
                    type={m.type || 'area'} 
                  />
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="text-gray-500 animate-pulse">Generating chart...</div>}
      </div>

      <div className="p-4 border-t border-gray-800 bg-black">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <input
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500"
            placeholder="Describe a chart..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="bg-blue-600 px-6 py-2 rounded-xl font-bold" disabled={loading}>
            {loading ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </main>
  );
}