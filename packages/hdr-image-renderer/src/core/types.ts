/**
 * Core types for CanvasCore system
 */

import type { ImageUploadService } from '../ImageUploadService';
import type { ViewportFacade } from '../interaction/ViewportFacade';
import type { Logger } from '../logger';
import type { PostProcessingAPI } from '../post-processing/PostProcessingChain';
import type { PixelReadbackService } from '../render/PixelReadbackService';
import type { Renderer, RendererService } from '../render/Renderer';
import type { ResizeService } from '../render/ResizeService';
import type {
  ColorSpace,
  ExportAPI,
  InteractionAPI,
  LoadingAPI,
  ObjectFit,
  RenderAPI,
  ToneMappingOperator,
  VisualizationMode,
} from '../types';
import type { ViewportLayoutService } from '../viewport/LayoutService';
import type { ViewportCommandService } from '../viewport/ViewportCommandService';
import type { DomainEventMap, RuntimeEventMap } from './EventTypes';
import type { TypedEventBus } from './TypedEventBus';

/**
 * Internal configuration derived from HDRCanvasOptions.
 * All renderOptions fields are required — fully resolved by ConfigResolver before use.
 */
export interface CoreConfig {
  debug: boolean;
  transparent: boolean;
  renderer?: RendererService;
  renderOptions: {
    exposure: number;
    toneMapping: ToneMappingOperator;
    hdrMode: boolean;
    colorSpace: ColorSpace;
    visualizationMode: VisualizationMode;
    objectFit: ObjectFit;
  };
  /**
   * Render-state fields explicitly provided by the user in HDRCanvasOptions.
   * Used to initialize SettingsController's userState so user intent survives
   * applyImageDefaults() calls on image load.
   */
  userRenderOptions: {
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
  eventBus: TypedEventBus<DomainEventMap>;
  runtimeEventBus: TypedEventBus<RuntimeEventMap>;
  logger: Logger;
  renderer: Renderer;
  settings: RenderAPI;
  viewport: ViewportFacade;
  layoutService: ViewportLayoutService;
  commands: ViewportCommandService;
  interactions: InteractionAPI;
  resizer: ResizeService;
  uploadService: ImageUploadService;
  readbackService: PixelReadbackService;
  loading: LoadingAPI;
  export: ExportAPI;
  postProcessing: PostProcessingAPI;
}
