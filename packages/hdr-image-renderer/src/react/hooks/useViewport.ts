import { useCallback, useEffect, useRef, useState } from "react";
import type { HDRCanvas } from "../../HDRCanvas";
import type { ViewportState } from "../../types";

export interface UseViewportOptions {
  /** Enable zoom/pan interactions */
  enabled?: boolean;
  /** Minimum zoom level */
  minZoom?: number;
  /** Maximum zoom level */
  maxZoom?: number;
  /** Wheel sensitivity for zoom */
  wheelSensitivity?: number;
  /** Animation smoothness (0-1, higher = faster, 0 = no animation) */
  animationSpeed?: number;
  /** Callback when viewport changes */
  onViewportChange?: (viewport: ViewportState) => void;
}

export interface UseViewportResult {
  /** Current viewport state */
  viewport: ViewportState;
  /** Event handlers to spread on canvas element */
  handlers: {
    onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
    onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    onDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  };
  /** Reset viewport to default */
  resetViewport: () => void;
}

const DEFAULT_OPTIONS: Required<Omit<UseViewportOptions, "onViewportChange">> = {
  enabled: false,
  minZoom: 0.1,
  maxZoom: 10,
  wheelSensitivity: 0.001,
  animationSpeed: 0.15,
};

/**
 * Clamp pan values to keep image within viewport bounds.
 * At zoom 1, no pan is allowed (image fills viewport).
 * At zoom > 1, pan is limited so image edges don't go past viewport center.
 */
function clampPan(pan: number, zoom: number): number {
  // Maximum pan = how much the image extends beyond viewport
  // At zoom 2, image is 2x size, so we can pan 0.25 in each direction (half of the extra 0.5)
  const maxPan = Math.max(0, (1 - 1 / zoom) / 2);
  return Math.max(-maxPan, Math.min(maxPan, pan));
}

/**
 * Hook for zoom/pan interactions on HDRCanvas.
 * Handles wheel zoom (centered on cursor) and drag pan.
 */
export function useViewport(
  instanceRef: React.RefObject<HDRCanvas | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: UseViewportOptions = {}
): UseViewportResult {
  const {
    enabled = DEFAULT_OPTIONS.enabled,
    minZoom = DEFAULT_OPTIONS.minZoom,
    maxZoom = DEFAULT_OPTIONS.maxZoom,
    wheelSensitivity = DEFAULT_OPTIONS.wheelSensitivity,
    animationSpeed = DEFAULT_OPTIONS.animationSpeed,
    onViewportChange,
  } = options;

  // Current viewport (what's actually rendered)
  const [viewport, setViewport] = useState<ViewportState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });

  // Target viewport (where we're animating to)
  const targetRef = useRef<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const animationRef = useRef<number | null>(null);

  // Track drag state
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Update HDRCanvas when viewport changes
  useEffect(() => {
    if (!enabled) return;
    instanceRef.current?.setViewport(viewport);
    onViewportChange?.(viewport);
  }, [viewport, enabled, instanceRef, onViewportChange]);

  // Animation loop - interpolates viewport toward target
  const startAnimation = useCallback(() => {
    if (animationRef.current !== null) return; // Already animating

    const animate = () => {
      setViewport((prev) => {
        const target = targetRef.current;
        const t = animationSpeed;

        // Check if we're close enough to stop
        const dZoom = Math.abs(target.zoom - prev.zoom);
        const dPanX = Math.abs(target.panX - prev.panX);
        const dPanY = Math.abs(target.panY - prev.panY);

        if (dZoom < 0.001 && dPanX < 0.0001 && dPanY < 0.0001) {
          animationRef.current = null;
          return target;
        }

        // Lerp toward target
        const newZoom = prev.zoom + (target.zoom - prev.zoom) * t;
        const newPanX = prev.panX + (target.panX - prev.panX) * t;
        const newPanY = prev.panY + (target.panY - prev.panY) * t;

        // Continue animation
        animationRef.current = requestAnimationFrame(animate);

        return {
          zoom: newZoom,
          panX: clampPan(newPanX, newZoom),
          panY: clampPan(newPanY, newZoom),
        };
      });
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [animationSpeed]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Wheel zoom (centered on cursor position)
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!enabled || !canvasRef.current) return;
      e.preventDefault();

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      // Mouse position in normalized canvas coords [0, 1]
      const mouseX = (e.clientX - rect.left) / rect.width;
      const mouseY = (e.clientY - rect.top) / rect.height;

      // Calculate zoom delta
      const zoomDelta = -e.deltaY * wheelSensitivity;

      // Update target (use current target as base for smooth accumulation)
      const prevTarget = targetRef.current;
      const newZoom = Math.max(
        minZoom,
        Math.min(maxZoom, prevTarget.zoom * (1 + zoomDelta))
      );

      // Zoom toward cursor position
      const zoomRatio = newZoom / prevTarget.zoom;

      // Mouse position relative to image center (in UV space)
      const mouseOffsetX = mouseX - 0.5;
      const mouseOffsetY = mouseY - 0.5;

      // Adjust pan to keep the point under cursor stationary
      const newPanX = prevTarget.panX + mouseOffsetX * (1 - 1 / zoomRatio) / newZoom;
      const newPanY = prevTarget.panY + mouseOffsetY * (1 - 1 / zoomRatio) / newZoom;

      targetRef.current = {
        zoom: newZoom,
        panX: clampPan(newPanX, newZoom),
        panY: clampPan(newPanY, newZoom),
      };

      startAnimation();
    },
    [enabled, canvasRef, minZoom, maxZoom, wheelSensitivity, startAnimation]
  );

  // Mouse down - start drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!enabled || e.button !== 0) return; // Only left click
      e.preventDefault();

      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      // Add document-level listeners for drag
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // Calculate delta in normalized coords
        const deltaX = (moveEvent.clientX - lastMousePos.current.x) / rect.width;
        const deltaY = (moveEvent.clientY - lastMousePos.current.y) / rect.height;

        lastMousePos.current = { x: moveEvent.clientX, y: moveEvent.clientY };

        setViewport((prev) => {
          // Pan is in image space, so divide by zoom
          const newPanX = prev.panX - deltaX / prev.zoom;
          const newPanY = prev.panY - deltaY / prev.zoom;
          const newState = {
            ...prev,
            panX: clampPan(newPanX, prev.zoom),
            panY: clampPan(newPanY, prev.zoom),
          };
          // Sync target with current state during drag (no animation)
          targetRef.current = newState;
          return newState;
        });
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [enabled, canvasRef]
  );

  // Double-click - reset viewport with animation
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      e.preventDefault();

      targetRef.current = { zoom: 1, panX: 0, panY: 0 };
      startAnimation();
    },
    [enabled, startAnimation]
  );

  // Reset viewport function (instant, no animation)
  const resetViewport = useCallback(() => {
    const defaultState = { zoom: 1, panX: 0, panY: 0 };
    targetRef.current = defaultState;
    setViewport(defaultState);
    instanceRef.current?.resetViewport();
  }, [instanceRef]);

  return {
    viewport,
    handlers: {
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onDoubleClick: handleDoubleClick,
    },
    resetViewport,
  };
}
