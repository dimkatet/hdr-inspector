/**
 * ViewportSubscriptions - Convenient API for subscribing to viewport events
 *
 * Provides high-level event subscriptions with automatic throttling and filtering.
 * Wraps ViewportController's low-level mutation/update events with user-friendly API.
 */

import { throttle } from 'throttle-debounce';
import type { MutationListener, TransitionEndListener, ViewportState } from '../types';
import type { ViewportController } from './Controller';

export class ViewportSubscriptions {
  private viewportController: ViewportController;

  constructor(viewportController: ViewportController) {
    this.viewportController = viewportController;
  }

  /**
   * Subscribe to zoom changes (throttled for wheel/pinch events)
   * @param callback - Called with new zoom level and full viewport state
   * @param throttleMs - Throttle interval for frequent events (default: 100ms)
   * @returns Unsubscribe function
   */
  onZoom(callback: (zoom: number, state: ViewportState) => void, throttleMs = 100): () => void {
    const throttledCallback = throttle(throttleMs, callback);

    return this.viewportController.onMutation((mutation, _prev, target) => {
      if (mutation.type === 'zoom') {
        // Throttle wheel/pinch gestures, immediate for button/programmatic
        if (mutation.source === 'wheel' || mutation.source === 'pinch') {
          throttledCallback(target.zoom, target);
        } else {
          callback(target.zoom, target);
        }
      } else if (mutation.type === 'reset') {
        callback(target.zoom, target);
      }
    });
  }

  /**
   * Subscribe to pan changes (throttled for drag events)
   * @param callback - Called with new pan position and full viewport state
   * @param throttleMs - Throttle interval for frequent events (default: 100ms)
   * @returns Unsubscribe function
   */
  onPan(
    callback: (panX: number, panY: number, state: ViewportState) => void,
    throttleMs = 100
  ): () => void {
    const throttledCallback = throttle(throttleMs, callback);

    return this.viewportController.onMutation((mutation, _prev, target) => {
      if (mutation.type === 'pan') {
        // Throttle drag gestures, immediate for programmatic
        if (mutation.source === 'drag') {
          throttledCallback(target.panX, target.panY, target);
        } else {
          callback(target.panX, target.panY, target);
        }
      }
    });
  }

  /**
   * Subscribe to all viewport mutations (low-level)
   * Fires once when a viewport change is requested, before animation starts.
   * @param listener - Called with mutation details and state
   * @returns Unsubscribe function
   */
  onMutation(listener: MutationListener): () => void {
    return this.viewportController.onMutation(listener);
  }

  /**
   * Subscribe to viewport state updates (fires every animation frame)
   * Use this for smooth rendering that needs interpolated values.
   * @param callback - Called with current viewport state
   * @returns Unsubscribe function
   */
  onUpdate(callback: (state: ViewportState) => void): () => void {
    return this.viewportController.onUpdate(callback);
  }

  /**
   * Subscribe to transition end events
   * Fires when an animated transition completes (not called for instant transitions).
   * @param callback - Called with final viewport state
   * @returns Unsubscribe function
   */
  onTransitionEnd(callback: TransitionEndListener): () => void {
    return this.viewportController.onTransitionEnd(callback);
  }

  /**
   * Subscribe to wheel zoom events only
   * @param callback - Called with new zoom level and state
   * @returns Unsubscribe function
   */
  onWheelZoom(callback: (zoom: number, state: ViewportState) => void): () => void {
    return this.viewportController.onMutation((mutation, _prev, target) => {
      if (mutation.type === 'zoom' && mutation.source === 'wheel') {
        callback(target.zoom, target);
      }
    });
  }

  /**
   * Subscribe to button/programmatic zoom events only
   * @param callback - Called with new zoom level and state
   * @returns Unsubscribe function
   */
  onButtonZoom(callback: (zoom: number, state: ViewportState) => void): () => void {
    return this.viewportController.onMutation((mutation, _prev, target) => {
      if (
        mutation.type === 'zoom' &&
        (mutation.source === 'button' || mutation.source === 'programmatic')
      ) {
        callback(target.zoom, target);
      }
    });
  }

  /**
   * Subscribe to drag pan events only
   * @param callback - Called with new pan position and state
   * @returns Unsubscribe function
   */
  onDragPan(callback: (panX: number, panY: number, state: ViewportState) => void): () => void {
    return this.viewportController.onMutation((mutation, _prev, target) => {
      if (mutation.type === 'pan' && mutation.source === 'drag') {
        callback(target.panX, target.panY, target);
      }
    });
  }

  /**
   * Subscribe to reset events
   * @param callback - Called with reset state
   * @returns Unsubscribe function
   */
  onReset(callback: (state: ViewportState) => void): () => void {
    return this.viewportController.onMutation((mutation, _prev, target) => {
      if (mutation.type === 'reset') {
        callback(target);
      }
    });
  }
}
