import createGlobe from 'cobe'
import { useRef, useEffect } from 'react'

import { useTheme } from 'nextra-theme-docs'

export function Globe() {
  const { resolvedTheme } = useTheme()
  const canvasRef = useRef()
  const themeRef = useRef(resolvedTheme)

  useEffect(() => {
    themeRef.current = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    if (!canvasRef.current) return
    let phi = 0
    let speed = 0.0025
    let scale = 1.7
    let targetScale = 1.7
    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: 400 * 2,
      height: 200 * 2,
      phi: 0,
      theta: 0.2,
      dark: themeRef.current === 'dark' ? 1 : 0,
      diffuse: 1.2,
      mapSamples: 10000,
      mapBrightness: themeRef.current === 'dark' ? 1 : 4,
      baseColor: [1, 1, 1],
      markerColor: [0.1, 0.8, 1],
      glowColor: themeRef.current === 'dark' ? [1, 1, 1] : [0.95, 0.95, 0.95],
      markers: [],
      offset: [0, 140],
      opacity: 0.9,
      scale: 1.7,
      onRender: state => {
        state.phi = phi
        phi += speed
        state.scale = scale
        scale += (targetScale - scale) * 0.1
        state.dark = themeRef.current === 'dark' ? 1 : 0
        state.mapBrightness = themeRef.current === 'dark' ? 1 : 4
        state.glowColor =
          themeRef.current === 'dark' ? [1, 1, 1] : [0.95, 0.95, 0.95]
      }
    })
    const onEnter = () => {
      speed = 0.008
      targetScale = 1.8
    }
    const onLeave = () => {
      speed = 0.0025
      targetScale = 1.7
    }
    canvasRef.current.addEventListener('pointerenter', onEnter)
    canvasRef.current.addEventListener('pointerleave', onLeave)
    return () => {
      globe.destroy()
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('pointerenter', onEnter)
        canvasRef.current.removeEventListener('pointerleave', onLeave)
      }
    }
  }, [])
  return (
    <canvas
      ref={canvasRef}
      className="h-52"
      width={400}
      style={{
        minWidth: 400,
        aspectRatio: 1,
        WebkitMaskImage:
          'linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(0,0,0,0))',
        opacity: 0,
        animation: 'fadein 1s ease .2s forwards'
      }}
    />
  )
}
