// React component wrapper
// Will be a thin wrapper around HDRCanvas class

import { useEffect, useRef } from 'react'
import { HDRCanvas as VanillaHDRCanvas } from '../HDRCanvas'
import type { HDRCanvasOptions, LinearImageData } from '../types'

export interface HDRCanvasProps extends HDRCanvasOptions {
  image?: LinearImageData | File
  onLoad?: () => void
  onError?: (error: Error) => void
  className?: string
  style?: React.CSSProperties
}

export function HDRCanvas({
  image,
  onLoad,
  onError,
  className,
  style,
  ...options
}: HDRCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const instanceRef = useRef<VanillaHDRCanvas | null>(null)

  // Initialize canvas instance
  useEffect(() => {
    if (!canvasRef.current) return

    try {
      instanceRef.current = new VanillaHDRCanvas(canvasRef.current, options)
    } catch (error) {
      onError?.(error as Error)
    }

    return () => {
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  }, []) // Only on mount

  // Load image when it changes
  useEffect(() => {
    if (!image || !instanceRef.current) return

    const loadPromise =
      image instanceof File
        ? instanceRef.current.loadFile(image)
        : instanceRef.current.loadImage(image as LinearImageData)

    loadPromise
      .then(() => onLoad?.())
      .catch((error) => onError?.(error))
  }, [image, onLoad, onError])

  // Update options when they change
  useEffect(() => {
    if (!instanceRef.current) return
    instanceRef.current.setExposure(options.exposure ?? 0)
  }, [options.exposure])

  useEffect(() => {
    if (!instanceRef.current) return
    instanceRef.current.setToneMapping(options.toneMapping ?? 'aces')
  }, [options.toneMapping])

  useEffect(() => {
    if (!instanceRef.current) return
    instanceRef.current.setHDRMode(options.hdrMode ?? false)
  }, [options.hdrMode])

  useEffect(() => {
    if (!instanceRef.current) return
    if (options.visualizationMode) {
      instanceRef.current.setVisualizationMode(options.visualizationMode)
    }
  }, [options.visualizationMode])

  useEffect(() => {
    if (!instanceRef.current) return
    if (options.colorSpace) {
      instanceRef.current.setColorSpace(options.colorSpace)
    }
  }, [options.colorSpace])

  return <canvas ref={canvasRef} className={className} style={style} />
}
