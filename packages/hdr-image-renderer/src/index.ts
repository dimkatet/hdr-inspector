// Core exports for vanilla JS API

export { HDRCanvas } from './HDRCanvas';
export {
  detectHDRCapabilities,
  getCapabilitiesDescription,
  type HDRCapabilities,
} from './utils';
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
} from './types';
