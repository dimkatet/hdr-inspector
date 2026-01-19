// Core exports for vanilla JS API

export { HDRCanvas } from './HDRCanvas';
export { decodeRadianceHDR, DecodeError } from './image';
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
} from './types';
