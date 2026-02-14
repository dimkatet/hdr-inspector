/**
 * ViewportLayoutService - Layout calculation utilities
 *
 * Provides pure layout calculations for viewport sizing and scaling.
 * Extracted from ViewportCommands to improve testability and reusability.
 */

import type { ObjectFit } from '../types';

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Service for viewport layout calculations
 *
 * Handles aspect ratio calculations, objectFit scaling, and coordinate transformations
 * without depending on specific viewport or renderer implementations.
 */
export class ViewportLayoutService {
  /**
   * Compute the base fit scale for the given objectFit mode
   *
   * This is the ratio of canvas pixels to image pixels at zoom=1.
   * For example, if an image is 1000px wide and canvas is 500px wide,
   * the contain scale would be 0.5.
   *
   * @param imageDims - Image dimensions in pixels
   * @param canvasDims - Canvas dimensions in pixels
   * @param objectFit - Object-fit mode
   * @returns Scale factor (canvasPixels / imagePixels)
   */
  computeFitScale(imageDims: Dimensions, canvasDims: Dimensions, objectFit: ObjectFit): number {
    if (imageDims.width === 0 || imageDims.height === 0) return 1;
    if (canvasDims.width === 0 || canvasDims.height === 0) return 1;

    const imageAspect = imageDims.width / imageDims.height;
    const canvasAspect = canvasDims.width / canvasDims.height;

    const containScale =
      imageAspect > canvasAspect
        ? canvasDims.width / imageDims.width
        : canvasDims.height / imageDims.height;

    switch (objectFit) {
      case 'contain':
        return containScale;

      case 'cover':
        // Cover uses the larger scale (opposite of contain)
        return imageAspect > canvasAspect
          ? canvasDims.height / imageDims.height
          : canvasDims.width / imageDims.width;

      case 'fill':
        // Fill stretches non-uniformly; use contain scale as reasonable baseline
        return containScale;

      case 'none':
        // At zoom=1, image is already at 1:1 pixels (no scaling)
        return 1;

      case 'scale-down':
        // Like contain but never upscale
        return Math.min(containScale, 1);
    }
  }

  /**
   * Compute aspect ratios for image and canvas
   *
   * @returns Object with imageAspect and canvasAspect ratios
   */
  computeAspectRatios(
    imageDims: Dimensions,
    canvasDims: Dimensions
  ): { imageAspect: number; canvasAspect: number } {
    const imageAspect = imageDims.height === 0 ? 1 : imageDims.width / imageDims.height;
    const canvasAspect = canvasDims.height === 0 ? 1 : canvasDims.width / canvasDims.height;

    return { imageAspect, canvasAspect };
  }

  /**
   * Compute the zoom level needed for 1:1 pixel mapping
   *
   * When zoom equals this value, one image pixel = one screen pixel.
   *
   * @param imageDims - Image dimensions in pixels
   * @param canvasDims - Canvas dimensions in pixels
   * @param objectFit - Object-fit mode
   * @returns Zoom level for actual size (1:1 pixels)
   */
  computeActualSizeZoom(
    imageDims: Dimensions,
    canvasDims: Dimensions,
    objectFit: ObjectFit
  ): number {
    const fitScale = this.computeFitScale(imageDims, canvasDims, objectFit);

    // If fitScale is 0.5, it means at zoom=1 the image is shown at 50% of its actual size
    // To get 1:1 pixels, we need zoom=2 (which is 1/0.5)
    return fitScale === 0 ? 1 : 1 / fitScale;
  }

  /**
   * Compute image dimensions in canvas pixels at given zoom level
   *
   * @param imageDims - Image dimensions in pixels
   * @param canvasDims - Canvas dimensions in pixels
   * @param objectFit - Object-fit mode
   * @param zoom - Current zoom level
   * @returns Image dimensions as rendered in canvas
   */
  computeRenderedSize(
    imageDims: Dimensions,
    canvasDims: Dimensions,
    objectFit: ObjectFit,
    zoom: number
  ): Dimensions {
    const fitScale = this.computeFitScale(imageDims, canvasDims, objectFit);
    const effectiveScale = fitScale * zoom;

    return {
      width: imageDims.width * effectiveScale,
      height: imageDims.height * effectiveScale,
    };
  }

  /**
   * Check if image fits entirely within canvas at given zoom
   *
   * @returns true if entire image is visible, false if cropped/overflowing
   */
  imageFullyVisible(
    imageDims: Dimensions,
    canvasDims: Dimensions,
    objectFit: ObjectFit,
    zoom: number
  ): boolean {
    const rendered = this.computeRenderedSize(imageDims, canvasDims, objectFit, zoom);
    return rendered.width <= canvasDims.width && rendered.height <= canvasDims.height;
  }
}
