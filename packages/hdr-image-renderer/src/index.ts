// Core exports for vanilla JS API

export { HDRCanvas } from './HDRCanvas';
export { decodeRadianceHDR, DecodeError } from './decoders';
export {
  detectHDRCapabilities,
  getCapabilitiesDescription,
  ViewportController,
  MouseHandler,
  TouchHandler,
  KeyboardHandler,
  type HDRCapabilities,
  type MouseCallbacks,
  type TouchCallbacks,
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
  ViewportMutation,
  MutationSource,
  ImageInfo,
  InteractionOptions,
  MouseConfig,
  TouchConfig,
  WheelConfig,
  KeyboardConfig,
} from './types';
