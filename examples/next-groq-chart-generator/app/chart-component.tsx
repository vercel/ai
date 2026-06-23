'use client';

import { 
  AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

interface ChartData {
  name: string;
  value: number;
}

export function ChartComponent({ data, type }: { data: ChartData[], type: string }) {
  if (type === 'bar') {
    return (
      <div className="w-full h-64 p-4 bg-gray-900 border border-gray-800 rounded-xl">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
            <YAxis stroke="#9CA3AF" fontSize={12} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
              itemStyle={{ color: '#82ca9d' }}
            />
            <Bar dataKey="value" fill="#82ca9d" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default to Area Chart
  return (
    <div className="w-full h-64 p-4 bg-gray-900 border border-gray-800 rounded-xl">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
          <YAxis stroke="#9CA3AF" fontSize={12} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }} 
            itemStyle={{ color: '#8884d8' }}
          />
          <Area type="monotone" dataKey="value" stroke="#8884d8" fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}