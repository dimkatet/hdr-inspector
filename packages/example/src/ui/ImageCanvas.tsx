/**
 * Image Canvas Component
 *
 * Demonstrates usage of @dimkatet/hdr-canvas React component
 */

import type { ImageEncoder, ImageLoader, RenderState } from '@dimkatet/hdr-canvas';
import { type ExportActions, HDRImage, type HDRImageHandle } from '@dimkatet/hdr-canvas/react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlitchPlugin } from '../plugins/glitchPlugin';
import { VignettePlugin } from '../plugins/vignettePlugin';
import { EffectParamsPanel } from './EffectParamsPanel';

interface ImageCanvasProps {
  loader?: ImageLoader;
  options?: Partial<RenderState>;
  onRenderStateSync?: (state: RenderState) => void;
  /** Custom encoder for re-encoding to original source format */
  encoder?: ImageEncoder;
  /** Human-readable label for the original format (e.g. 'JPEG XL') */
  originalFormatLabel?: string;
  /** File extension for the original format (e.g. 'jxl') */
  originalFormatExtension?: string;
}

interface ExportMenuProps {
  actions: ExportActions;
  position: { x: number; y: number } | null;
  onClose: () => void;
  encoder?: ImageEncoder;
  originalFormatLabel?: string;
  originalFormatExtension?: string;
}

// Context-menu style export dropdown, rendered at fixed viewport coordinates
function ExportMenu({
  actions,
  position,
  onClose,
  encoder,
  originalFormatLabel,
  originalFormatExtension,
}: ExportMenuProps) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
      } catch (err) {
        console.error('Export failed:', err);
      } finally {
        setBusy(false);
        onClose();
      }
    },
    [onClose]
  );

  if (!position) return null;

  const itemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    color: busy ? 'rgba(255,255,255,0.4)' : '#fff',
    textAlign: 'left',
    cursor: busy ? 'not-allowed' : 'pointer',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        background: 'rgba(30,30,30,0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        overflow: 'hidden',
        minWidth: 150,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        pointerEvents: 'auto',
        zIndex: 1000,
      }}
    >
      <button
        type="button"
        style={itemStyle}
        disabled={busy}
        onMouseEnter={(e) => {
          if (!busy) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none';
        }}
        onClick={() => run(() => actions.download({ type: 'image/png' }))}
      >
        Download PNG
      </button>
      <button
        type="button"
        style={itemStyle}
        disabled={busy}
        onMouseEnter={(e) => {
          if (!busy) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none';
        }}
        onClick={() => run(() => actions.download({ type: 'image/jpeg', quality: 0.92 }))}
      >
        Download JPEG
      </button>

      {encoder && originalFormatLabel && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
          <button
            type="button"
            style={itemStyle}
            disabled={busy}
            onMouseEnter={(e) => {
              if (!busy) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
            }}
            onClick={() =>
              run(() =>
                actions.download({
                  encoder,
                  extension: originalFormatExtension,
                })
              )
            }
          >
            Download as {originalFormatLabel}
          </button>
        </>
      )}
    </div>
  );
}

export function ImageCanvas({
  loader,
  options,
  onRenderStateSync,
  encoder,
  originalFormatLabel,
  originalFormatExtension,
}: ImageCanvasProps) {
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const hdrRef = useRef<HDRImageHandle>(null);

  // Vignette plugin — stable instance across renders
  const vignettePlugin = useMemo(() => new VignettePlugin(false), []);
  const [vignetteEnabled, setVignetteEnabled] = useState(false);

  // Glitch plugin — stable instance across renders
  const glitchPlugin = useMemo(() => new GlitchPlugin(false), []);
  const [glitchEnabled, setGlitchEnabled] = useState(false);
  const [glitchParamInfo, setGlitchParamInfo] = useState(() => glitchPlugin.getParamInfo());

  const pluginRegisteredRef = useRef(false);

  const handleError = useCallback((err: Error) => {
    console.log(err);
    setError(err.message);
  }, []);

  const handleLoad = useCallback(() => {
    setError(null);
    const canvas = hdrRef.current?.getCanvas();
    // Register plugin once on first load (canvas instance is stable)
    if (canvas && !pluginRegisteredRef.current) {
      canvas.use(vignettePlugin);
      canvas.use(glitchPlugin);
      pluginRegisteredRef.current = true;
    }
    const effectiveState = canvas?.render.getState();
    if (effectiveState) {
      onRenderStateSync?.(effectiveState);
    }
  }, [onRenderStateSync, vignettePlugin, glitchPlugin]);

  const handleVignetteToggle = useCallback(() => {
    setVignetteEnabled((prev) => {
      vignettePlugin.setEnabled(!prev);
      return !prev;
    });
  }, [vignettePlugin]);

  const handleGlitchToggle = useCallback(() => {
    setGlitchEnabled((prev) => {
      glitchPlugin.setEnabled(!prev);
      return !prev;
    });
  }, [glitchPlugin]);

  const handleGlitchParamUpdate = useCallback(
    (stepId: string, name: string, value: unknown) => {
      glitchPlugin.updateParam(stepId, name, value);
      setGlitchParamInfo(glitchPlugin.getParamInfo());
    },
    [glitchPlugin],
  );

  const handleZoom = useCallback((zoomLevel: number) => setZoom(zoomLevel), []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenuPos(null), []);

  // Close menu on any click outside
  useEffect(() => {
    if (!menuPos) return;
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [menuPos, closeMenu]);

  // Button style
  const btnStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: '#333',
    color: '#fff',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    minWidth: '44px',
  };

  // useRef, not useState — event handlers need synchronous access, React state is async
  const capturingRef = useRef(false);

  if (error) {
    return (
      <div
        style={{
          padding: '40px',
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '4px',
          textAlign: 'center',
        }}
      >
        <h3 style={{ color: '#ff6666', margin: '0 0 16px' }}>WebGPU Error</h3>
        <p style={{ color: '#999', margin: '0 0 16px' }}>{error}</p>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          WebGPU is required for this application. Please use Chrome/Edge 113+ or Safari 18+.
        </p>
      </div>
    );
  }
  if (!loader) return null;
  return (
    <div
      onTouchStart={() => console.log('touch start; capturing:', capturingRef.current)}
      onTouchEnd={() => console.log('touch end; capturing:', capturingRef.current)}
    >
      <HDRImage
        ref={hdrRef}
        objectFit="auto"
        loader={loader}
        options={{
          ...options,
          transparent: true,
          debug: true,
        }}
        onLoad={handleLoad}
        onError={handleError}
        onZoom={handleZoom}
        onContextMenu={handleContextMenu}
        onGestureChange={(capturing, type) => {
          console.log('Gesture change:', capturing, type);
          capturingRef.current = capturing;
        }}
        interactions={{
          wheel: { sensitivity: 0.0015 },
          drag: true,
          touch: true,
          minZoom: 0.5,
          maxZoom: 20,
          animationDuration: 100,
          keyboard: true, // Enable keyboard controls with default settings
        }}
        exportMenu={(actions) => (
          <ExportMenu
            actions={actions}
            position={menuPos}
            onClose={closeMenu}
            encoder={encoder}
            originalFormatLabel={originalFormatLabel}
            originalFormatExtension={originalFormatExtension}
          />
        )}
        style={{
          display: 'block',
          // height: '70%',
          // width: 'auto'
          width: '70%',
          // width: 700
        }}
      />

      {/* Viewport Controls */}
      <div
        style={{
          marginTop: '12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.zoomOut()}>
          -
        </button>
        <span style={{ color: '#ccc', minWidth: '60px', textAlign: 'center' }}>
          {zoom.toFixed(2)}x
        </span>
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.zoomIn()}>
          +
        </button>
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.zoomToFit()}>
          Fit
        </button>
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.zoomToActual()}>
          1:1
        </button>
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.resetViewport()}>
          Reset
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 24, backgroundColor: '#444' }} />

        {/* Vignette post-processing toggle */}
        <button
          type="button"
          onClick={handleVignetteToggle}
          style={{
            ...btnStyle,
            backgroundColor: vignetteEnabled ? '#2563eb' : '#333',
            borderColor: vignetteEnabled ? '#3b82f6' : '#555',
          }}
        >
          Vignette
        </button>

        {/* Glitch post-processing toggle */}
        <button
          type="button"
          onClick={handleGlitchToggle}
          style={{
            ...btnStyle,
            backgroundColor: glitchEnabled ? '#7c3aed' : '#333',
            borderColor: glitchEnabled ? '#8b5cf6' : '#555',
          }}
        >
          Glitch
        </button>
      </div>

      {glitchEnabled && (
        <EffectParamsPanel paramInfo={glitchParamInfo} onUpdate={handleGlitchParamUpdate} />
      )}
    </div>
  );
}
