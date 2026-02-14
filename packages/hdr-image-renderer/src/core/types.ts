/**
 * Core types for CanvasCore system
 */

import type { ImageUploadService } from '../ImageUploadService';
import type { InteractionTarget } from '../interaction/InteractionTarget';
import type { Logger } from '../logger';
import type { PixelReadbackService } from '../render/PixelReadbackService';
import type { Renderer } from '../render/Renderer';
import type { ResizeService } from '../render/ResizeService';
import type {
  ColorSpace,
  ExportAPI,
  HDRCanvasOptions,
  InteractionAPI,
  LoadingAPI,
  ObjectFit,
  RenderAPI,
  ToneMappingOperator,
  VisualizationMode,
} from '../types';
import type { ViewportLayoutService } from '../viewport/LayoutService';
import type { ViewportCommandService } from '../viewport/ViewportCommandService';
import type { HDRCanvasEventMap } from './EventTypes';
import type { TypedEventBus } from './TypedEventBus';

/**
 * Lifecycle states for CanvasCore
 */
export type CoreLifecycle = 'created' | 'initializing' | 'ready' | 'destroyed';

/**
 * Internal configuration derived from HDRCanvasOptions
 */
export interface CoreConfig {
  debug: boolean;
  transparent: boolean;
  renderOptions: {
    exposure?: number;
    toneMapping?: ToneMappingOperator;
    hdrMode?: boolean;
    colorSpace?: ColorSpace;
    visualizationMode?: VisualizationMode;
    objectFit?: ObjectFit;
  };
}

/**
 * Service factory function
 */
export type ServiceFactory<T> = () => T;

/**
 * Service with optional destroy method
 */
export interface DestroyableService {
  destroy?: () => void;
}

/**
 * Command handlers for zoom operations
 */
export interface ZoomCommands {
  zoomIn: (factor?: number) => void;
  zoomOut: (factor?: number) => void;
  zoomToFit: () => void;
  zoomToActual: () => void;
}

/**
 * Type-safe service map for CanvasCore DI container.
 * Maps service names to their interface types.
 */
export interface ServiceMap {
  eventBus: TypedEventBus<HDRCanvasEventMap>;
  logger: Logger;
  renderer: Renderer;
  settings: RenderAPI;
  viewport: InteractionTarget;
  layoutService: ViewportLayoutService;
  commands: ViewportCommandService;
  interactions: InteractionAPI;
  resizer: ResizeService;
  uploadService: ImageUploadService;
  readbackService: PixelReadbackService;
  loading: LoadingAPI;
  export: ExportAPI;
}

/**
 * Convert user options to core config
 */
export function normalizeConfig(options: HDRCanvasOptions): CoreConfig {
  return {
    debug: options.debug ?? false,
    transparent: options.transparent ?? false,
    renderOptions: {
      exposure: options.exposure ?? 0,
      toneMapping: options.toneMapping ?? 'aces',
      hdrMode: options.hdrMode ?? false,
      colorSpace: options.colorSpace ?? 'srgb',
      visualizationMode: options.visualizationMode ?? 'rgb',
      objectFit: options.objectFit ?? 'contain',
    },
  };
}
