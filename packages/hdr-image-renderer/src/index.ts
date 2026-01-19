// Core exports for vanilla JS API

export { HDRCanvas } from './HDRCanvas';
export { decodeRadianceHDR, DecodeError } from './decoders';
export {
  detectHDRCapabilities,
  getCapabilitiesDescription,
  ViewportController,
  PointerHandler,
  KeyboardHandler,
  type HDRCapabilities,
  type PointerCallbacks,
  type KeyboardCallbacks,
} from './core';
export type {
  HDRCanvasOptions,
  RenderState,
  LinearImageData,
  ToneMappingOperator,
  VisualizationMode,
  ColorSpace,
  ViewportState,
  ViewportConfig,
  ImageInfo,
  InteractionOptions,
  PointerConfig,
  WheelConfig,
  KeyboardConfig,
} from './types';
