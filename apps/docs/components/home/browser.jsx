import { useRef, useEffect } from 'react'
import cn from 'clsx'

export function Skeleton({ index, blocking, className }) {
  const ref = useRef()
  useEffect(() => {
    const interval = setInterval(() => {
      if (ref.current) {
        ref.current.style.animation = `fadeout 0.5s ease forwards`
        if (ref.current.children[0]) {
          ref.current.children[0].style.animation = ``
        }

        setTimeout(() => {
          if (ref.current) {
            ref.current.style.width = (Math.random() * 0.6 + 0.2) * 100 + '%'
            ref.current.style.animation = `fadein 0.4s ease ${
              index * 0.2
            }s forwards`
            if (ref.current.children[0]) {
              ref.current.children[0].style.animation = `slideout .4s ease ${
                index * 0.2
              }s forwards`
            }
          }
        }, 800)
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [])
  return (
    <div
      className={className + ' browser-skeleton'}
      style={{
        opacity: 0,
        animation: `fadein 0.4s ease ${index * 0.2}s forwards`,
        transformOrigin: 'left'
      }}
      ref={ref}
    >
      {!blocking ? (
        <span
          style={{
            animation: `slideout .4s ease ${index * 0.2}s forwards`
          }}
        />
      ) : null}
    </div>
  )
}

function Spinner(props) {
  const color = props.color || 'text-neutral-400 dark:text-neutral-600'
  return (
    <svg
      className={`animate-spin -ml-1 mr-3 h-5 w-5 ${color} ${props.extraClasses}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  )
}

export function Browser({ highlight, blocking }) {
  return (
    <div className="h-52 w-full px-4 flex items-center justify-center dot-background">
      <div
        className={cn(
          'w-64 max-w-full h-40 border rounded-md shadow bg-white dark:bg-neutral-900 hover:scale-105 duration-700 transition-transform',
          highlight ? 'border-neutral-300 dark:border-neutral-600' : ''
        )}
        style={{
          animation: 'fadein .5s ease'
        }}
      >
        <div
          className={cn(
            'flex bg-slate-400/5 dark:bg-neutral-800/50 p-1 border-b gap-1 dark:border-neutral-800',
            highlight ? 'border-neutral-300' : ''
          )}
        >
          <div className="border rounded-full w-2 h-2 dark:border-neutral-700" />
          <div className="border rounded-full w-2 h-2 dark:border-neutral-700" />
          <div className="border rounded-full w-2 h-2 dark:border-neutral-700" />
        </div>
        <div className="p-4 animate-pulse relative">
          {/* {blocking ? (
            <div>
              <Spinner />
            </div>
          ) : null} */}
          <Skeleton
            blocking={blocking}
            index={blocking ? 6.5 : 0}
            className={cn(
              'h-2 w-2/3 rounded',
              highlight
                ? 'bg-gray-400/80 dark:bg-neutral-600'
                : 'bg-gray-300/80 dark:bg-neutral-800'
            )}
          ></Skeleton>
          <Skeleton
            blocking={blocking}
            index={blocking ? 6.5 : 1}
            className={cn(
              'h-2 w-1/2 mt-2 rounded',
              highlight
                ? 'bg-gray-400/80 dark:bg-neutral-600'
                : 'bg-gray-300/80 dark:bg-neutral-800'
            )}
          ></Skeleton>
          <Skeleton
            blocking={blocking}
            index={blocking ? 6.5 : 2}
            className={cn(
              'h-2 w-1/2 mt-2 rounded',
              highlight
                ? 'bg-gray-400/80 dark:bg-neutral-600'
                : 'bg-gray-300/80 dark:bg-neutral-800'
            )}
          ></Skeleton>
          <Skeleton
            blocking={blocking}
            index={blocking ? 6.5 : 3}
            className={cn(
              'h-2 w-3/4 mt-2 rounded',
              highlight
                ? 'bg-gray-400/80 dark:bg-neutral-600'
                : 'bg-gray-300/80 dark:bg-neutral-800'
            )}
          ></Skeleton>
          <Skeleton
            blocking={blocking}
            index={blocking ? 6.5 : 4}
            className={cn(
              'h-2 w-2/3 mt-2 rounded',
              highlight
                ? 'bg-gray-400/80 dark:bg-neutral-600'
                : 'bg-gray-300/80 dark:bg-neutral-800'
            )}
          ></Skeleton>
          <Skeleton
            blocking={blocking}
            index={blocking ? 6.5 : 5}
            className={cn(
              'h-2 w-1/4 mt-2 rounded',
              highlight
                ? 'bg-gray-400/80 dark:bg-neutral-600'
                : 'bg-gray-300/80 dark:bg-neutral-800'
            )}
          ></Skeleton>
          <Skeleton
            blocking={blocking}
            index={blocking ? 6.5 : 6}
            className={cn(
              'h-2 w-1/2 mt-2 rounded',
              highlight
                ? 'bg-gray-400/80 dark:bg-neutral-600'
                : 'bg-gray-300/80 dark:bg-neutral-800'
            )}
          ></Skeleton>
        </div>
      </div>
    </div>
  )
}
