/**
 * HDRCanvas Event Types
 *
 * Defines all events emitted by HDRCanvas subsystems.
 * Used for type-safe event subscriptions via TypedEventBus.
 */

import type {
  DisplayedImageType,
  LoadingState,
  RenderState,
  ViewportMutation,
  ViewportState,
} from '../types';

/**
 * HDRCanvas Event Map
 *
 * Maps event names to their data payloads for type-safe subscriptions.
 */
export interface HDRCanvasEventMap {
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
  'loading:stateChange': {
    state: LoadingState;
    type: DisplayedImageType;
  };

  // Render events
  'render:settingsChanged': {
    settings: RenderState;
  };
  'render:complete': Record<string, never>;

  // Canvas/Control events
  'canvas:resized': {
    width: number;
    height: number;
  };
}

/**
 * Type-safe event listener
 */
export type EventListener<K extends keyof HDRCanvasEventMap> = (data: HDRCanvasEventMap[K]) => void;
