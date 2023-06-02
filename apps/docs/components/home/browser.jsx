import { useRef, useEffect } from 'react'

export function Skeleton({ index, className }) {
  const ref = useRef()
  useEffect(() => {
    const interval = setInterval(() => {
      if (ref.current) {
        ref.current.style.animation = `fadeout 0.5s ease forwards`
        setTimeout(() => {
          if (ref.current) {
            ref.current.style.width = (Math.random() * 0.6 + 0.2) * 100 + '%'
            ref.current.style.animation = `fadein 0.4s ease ${
              index * 0.2
            }s forwards`
          }
        }, 800)
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [])
  return (
    <>
      <div
        className={className}
        style={{
          opacity: 0,
          animation: `fadein 0.4s ease ${index * 0.2}s forwards`
        }}
        ref={ref}
      />
    </>
  )
}

export function Browser() {
  return (
    <div className="h-52 w-full px-4 flex items-center justify-center dot-background">
      <div
        className="w-64 max-w-full h-40 border rounded-md shadow bg-white dark:bg-neutral-900 dark:border-neutral-800 hover:scale-105 duration-700 transition-transform"
        style={{
          animation: 'fadein .5s ease'
        }}
      >
        <div className="flex bg-slate-400/5 dark:bg-neutral-800/50 p-1 border-b gap-1 dark:border-neutral-800">
          <div className="border rounded-full w-2 h-2 dark:border-neutral-700" />
          <div className="border rounded-full w-2 h-2 dark:border-neutral-700" />
          <div className="border rounded-full w-2 h-2 dark:border-neutral-700" />
        </div>
        <div className="p-4 animate-pulse">
          <Skeleton
            index={0}
            className="h-2 w-2/3 bg-gray-300/80 dark:bg-neutral-800 rounded"
          ></Skeleton>
          <Skeleton
            index={1}
            className="h-2 w-1/2 mt-2 bg-gray-300/80 dark:bg-neutral-800 rounded"
          ></Skeleton>
          <Skeleton
            index={2}
            className="h-2 w-1/2 mt-2 bg-gray-300/80 dark:bg-neutral-800 rounded"
          ></Skeleton>
          <Skeleton
            index={3}
            className="h-2 w-3/4 mt-2 bg-gray-300/80 dark:bg-neutral-800 rounded"
          ></Skeleton>
          <Skeleton
            index={4}
            className="h-2 w-2/3 mt-2 bg-gray-300/80 dark:bg-neutral-800 rounded"
          ></Skeleton>
          <Skeleton
            index={5}
            className="h-2 w-1/4 mt-2 bg-gray-300/80 dark:bg-neutral-800 rounded"
          ></Skeleton>
          <Skeleton
            index={6}
            className="h-2 w-1/2 mt-2 bg-gray-300/80 dark:bg-neutral-800 rounded"
          ></Skeleton>
        </div>
      </div>
    </div>
  )
}
