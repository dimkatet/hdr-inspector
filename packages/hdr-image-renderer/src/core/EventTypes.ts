/**
 * HDRCanvas Event Types
 *
 * Defines all events emitted by HDRCanvas subsystems.
 * Split into Domain (application) and Runtime (infrastructure) events.
 */

import type {
  DisplayedImageType,
  ImageInfo,
  LoadingState,
  RenderState,
  ViewportMutation,
  ViewportState,
} from '../types';
import type { RuntimeState } from './RuntimeService';

/**
 * Domain events — emitted by application services
 * (viewport, loading, render, canvas)
 */
export interface DomainEventMap {
  // Viewport events
  'viewport:mutation': {
    mutation: ViewportMutation;
    prev: ViewportState;
    target: ViewportState;
  };
  'viewport:update': {
    state: ViewportState;
  };
  'viewport:transitionEnd': {
    state: ViewportState;
  };

  // Loading events
  'loading:imageReady': {
    info: ImageInfo;
  };
  'loading:stateChange': {
    state: LoadingState;
    type: DisplayedImageType;
  };

  // Render events
  'render:settingsChanged': {
    settings: RenderState;
  };
  'render:beforeFrame': Record<string, never>;
  'render:complete': Record<string, never>;

  // Post-processing events
  'postProcessing:changed': Record<string, never>;

  // Canvas/Control events
  'canvas:resized': {
    width: number;
    height: number;
  };

  // Interaction events
  /**
   * Emitted when the canvas acquires or releases gesture ownership.
   * `capturing: true` means the canvas is actively handling a pan or pinch gesture
   * and is consuming pointer events (stopPropagation/preventDefault in effect).
   * `capturing: false` means the gesture ended and events propagate normally.
   */
  'interaction:gestureChange': {
    capturing: boolean;
    type: 'pan' | 'pinch' | null;
  };
}

/**
 * Runtime events — emitted by lifecycle infrastructure
 */
export interface RuntimeEventMap {
  'runtime:stateChange': {
    state: RuntimeState;
    previousState: RuntimeState;
  };
}

/**
 * Combined event map — used at facade level for unified subscriptions
 */
export interface HDRCanvasEventMap extends DomainEventMap, RuntimeEventMap {}

/**
 * Type-safe event listener
 */
export type EventListener<K extends keyof HDRCanvasEventMap> = (data: HDRCanvasEventMap[K]) => void;
