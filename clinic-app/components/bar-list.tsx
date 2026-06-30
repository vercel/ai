export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>{item.label}</span>
            <span className="font-medium text-gray-800">{item.value}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-brand-500"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
      {items.length === 0 && <p className="text-sm text-gray-400">Sem dados ainda.</p>}
    </ul>
  );
}
