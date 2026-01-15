// Core exports for vanilla JS API

export { HDRCanvas } from './HDRCanvas'
export { decodeRadianceHDR, DecodeError } from './decoders'
export {
  detectHDRCapabilities,
  getCapabilitiesDescription,
  ViewportController,
  InteractionHandler,
  type HDRCapabilities,
  type InteractionCallbacks
} from './core'
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
  InteractionOptions
} from './types'
