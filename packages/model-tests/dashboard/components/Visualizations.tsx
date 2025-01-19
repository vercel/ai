import { useMemo } from 'react';
import { ModelCapability } from '@/utils/fetchData';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface VisualizationsProps {
  modelCapabilities: ModelCapability[];
}

export default function Visualizations({
  modelCapabilities,
}: VisualizationsProps) {
  const providerStats = useMemo(() => {
    const stats = modelCapabilities.reduce((acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = { total: 0 };
      }
      acc[model.provider].total += 1;
      Object.entries(model.capabilities).forEach(
        ([capability, { supported }]) => {
          if (!acc[model.provider][capability]) {
            acc[model.provider][capability] = 0;
          }
          if (supported) {
            acc[model.provider][capability] += 1;
          }
        },
      );
      return acc;
    }, {} as Record<string, Record<string, number>>);

    return Object.entries(stats).map(([provider, data]) => ({
      provider,
      ...data,
    }));
  }, [modelCapabilities]);

  const capabilities = useMemo(() => {
    return Array.from(
      new Set(
        modelCapabilities.flatMap(model => Object.keys(model.capabilities)),
      ),
    );
  }, [modelCapabilities]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">
          Provider Capabilities Overview
        </h2>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={providerStats}>
            <XAxis dataKey="provider" />
            <YAxis />
            <Tooltip />
            <Legend />
            {capabilities.map(capability => (
              <Bar key={capability} dataKey={capability} stackId="a" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
