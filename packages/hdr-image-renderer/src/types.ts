/**
 * HDR Canvas - Type Definitions
 *
 * Main type export file for backward compatibility.
 * All types are now organized in domain modules under /domain/types/
 *
 * This file re-exports everything for convenience and backward compatibility.
 */

// Event system types
export type { HDRCanvasEventMap } from './core/EventTypes';
export type { EventBusOptions } from './core/TypedEventBus';
// Re-export all domain types
export type {
  // Canvas domain
  CanvasAPI,
  ColorSpace,
  DisplayedImageType,
  // Viewport domain
  EasingFunction,
  EncodedImageData,
  ExportAPI,
  ExportOptions,
  HDRCanvasOptions,
  IHDRCanvas,
  ImageData,
  ImageEncoder,
  ImageInfo,
  // Loading domain
  ImageLoader,
  InteractionAPI,
  InteractionOptions,
  KeyboardConfig,
  LinearImageData,
  LoadingAPI,
  LoadingState,
  LoadingStateListener,
  LoadOptions,
  MouseConfig,
  MutationListener,
  MutationSource,
  ObjectFit,
  // Export domain
  PixelReadback,
  RenderAPI,
  RenderState,
  // Render domain
  ToneMappingOperator,
  TouchConfig,
  // Image domain
  TransferFunction,
  TransitionEndListener,
  UpdateListener,
  ViewportAPI,
  ViewportConfig,
  ViewportMutation,
  ViewportState,
  VisualizationMode,
  // Interaction domain
  WheelConfig,
} from './domain/types';
