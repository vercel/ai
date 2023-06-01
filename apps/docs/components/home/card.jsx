export function Card({ title, description, children }) {
  return (
    <div className="rounded-lg border border-slate-200 hover:border-slate-300 transition-colors dark:border-neutral-800 dark:hover:border-neutral-700">
      <div className="flex items-center justify-center overflow-hidden">
        {children}
      </div>
      <div className="mt-2 mx-6 mb-6">
        <p className="text-lg font-semibold tracking-tight">{title}</p>
        <p className="mt-1 text-neutral-500">{description}</p>
      </div>
    </div>
  )
}
