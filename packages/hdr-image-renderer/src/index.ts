// Core exports for vanilla JS API

export { HDRCanvas } from './HDRCanvas';
export { ImageLoadingManager } from './ImageLoadingManager';
export {
  detectHDRCapabilities,
  getCapabilitiesDescription,
  type HDRCapabilities,
} from './utils';
export { destroySharedDevice } from './render/gpu-device';
export { ViewportController } from './viewport';
export { MouseHandler, TouchHandler, KeyboardHandler } from './interaction';
export type {
  HDRCanvasOptions,
  RenderState,
  LinearImageData,
  EncodedImageData,
  ImageData,
  TransferFunction,
  ToneMappingOperator,
  VisualizationMode,
  ColorSpace,
  ObjectFit,
  ViewportState,
  ViewportConfig,
  ViewportMutation,
  MutationSource,
  ImageInfo,
  InteractionOptions,
  MouseConfig,
  TouchConfig,
  WheelConfig,
  KeyboardConfig,
  // Namespaced API interfaces
  ViewportAPI,
  RenderAPI,
  InteractionAPI,
  CanvasAPI,
  LoadingAPI,
  // Loading types
  ImageLoader,
  LoadOptions,
  LoadingState,
  LoadingStateListener,
  DisplayedImageType,
} from './types';
