import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IHDRCanvas,
  KeyboardConfig,
  ViewportConfig,
  ViewportState,
  WheelConfig,
} from '../../types';

export interface UseViewportOptions extends ViewportConfig {
  /** Enable zoom/pan interactions */
  enabled?: boolean;
  /** Enable/configure mouse wheel zoom (true for defaults, object for custom config) */
  wheel?: boolean | WheelConfig;
  /** Enable mouse drag pan (default: true) */
  drag?: boolean;
  /** Enable touch gestures (default: true) */
  touch?: boolean;
  /** Keyboard control configuration (true for defaults, object for custom config) */
  keyboard?: boolean | KeyboardConfig;
  /** Callback when viewport changes (fires on every frame during animation) */
  onViewportChange?: (viewport: ViewportState) => void;
}

export interface UseViewportResult {
  /** Current viewport state */
  viewport: ViewportState;
  /** Reset viewport to default */
  resetViewport: () => void;
}

/**
 * Hook for zoom/pan interactions on HDRCanvas.
 * Thin wrapper around HDRCanvas.attachInteractions().
 */
export function useViewport(
  instance: IHDRCanvas | null,
  options: UseViewportOptions = {}
): UseViewportResult {
  const {
    enabled = false,
    onViewportChange,
    keyboard,
    wheel,
    drag,
    touch,
    minZoom,
    maxZoom,
    animationDuration,
    easing,
  } = options;

  const [viewport, setViewport] = useState<ViewportState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });

  // Store callback in ref to avoid re-subscribing
  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  // Derive stable primitive values from potentially-object configs.
  // Using these as deps (instead of the objects) prevents re-attachment on every render
  // when the user passes inline object literals like `wheel={{ sensitivity: 0.002 }}`.
  const wheelEnabled = typeof wheel === 'boolean' ? wheel : wheel?.enabled;
  const wheelSensitivity = typeof wheel === 'object' ? wheel?.sensitivity : undefined;
  const keyboardEnabled = typeof keyboard === 'boolean' ? keyboard : keyboard?.enabled;

  // Attach interactions when enabled
  useEffect(() => {
    if (!enabled || !instance) {
      return;
    }

    // Reconstruct config objects from primitives so deps are honest
    const wheelConfig =
      wheelSensitivity !== undefined
        ? { enabled: wheelEnabled, sensitivity: wheelSensitivity }
        : wheelEnabled;
    const keyboardConfig = keyboardEnabled;

    const detachInteractions = instance.interaction.attach({
      wheel: wheelConfig,
      drag,
      touch,
      keyboard: keyboardConfig,
      minZoom,
      maxZoom,
      animationDuration,
      easing,
    });

    const unsubscribeViewport = instance.on('viewport:update', ({ state }) => {
      setViewport(state);
      onViewportChangeRef.current?.(state);
    });

    return () => {
      detachInteractions();
      unsubscribeViewport();
    };
  }, [
    enabled,
    instance,
    wheelEnabled,
    wheelSensitivity,
    drag,
    touch,
    keyboardEnabled,
    minZoom,
    maxZoom,
    animationDuration,
    easing,
  ]);

  // Reset function
  const resetViewport = useCallback(() => {
    instance?.viewport.reset();
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }, [instance]);

  return { viewport, resetViewport };
}
