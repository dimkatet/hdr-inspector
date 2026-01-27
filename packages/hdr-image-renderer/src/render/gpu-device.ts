/**
 * Shared WebGPU Device Singleton
 *
 * Provides a single GPUDevice instance for all renderers to share.
 * This prevents "too many devices" errors when creating multiple canvases.
 */

import type { Logger } from '../logger';
import { silentLogger } from '../logger';

let sharedDevice: GPUDevice | null = null;
let sharedAdapter: GPUAdapter | null = null;
let initPromise: Promise<GPUDevice> | null = null;
let deviceLogger: Logger = silentLogger;

/**
 * Set the logger for GPU device initialization messages.
 * Must be called before getSharedDevice() for logging to take effect.
 */
export function setGPUDeviceLogger(logger: Logger): void {
  deviceLogger = logger;
}

/**
 * Get the shared GPUDevice instance.
 * Creates one if it doesn't exist yet.
 */
export async function getSharedDevice(): Promise<GPUDevice> {
  // Return existing device if available
  if (sharedDevice && !sharedDevice.lost) {
    return sharedDevice;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = initializeDevice();
  return initPromise;
}

/**
 * Get the shared GPUAdapter instance.
 */
export async function getSharedAdapter(): Promise<GPUAdapter> {
  if (!sharedAdapter) {
    await getSharedDevice();
  }
  return sharedAdapter!;
}

/**
 * Initialize the shared device
 */
async function initializeDevice(): Promise<GPUDevice> {
  deviceLogger.log('[GPUDevice] Initializing shared device...');

  if (!navigator.gpu) {
    throw new Error('WebGPU not supported in this browser');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to get WebGPU adapter');
  }
  sharedAdapter = adapter;

  // Request device with optional features
  const requiredFeatures: GPUFeatureName[] = ['texture-formats-tier1'];

  const device = await adapter.requestDevice({
    requiredFeatures,
  });

  // Handle device loss
  device.lost.then((info) => {
    console.error('[GPUDevice] Device lost:', info.message);
    sharedDevice = null;
    initPromise = null;
    // Could auto-recreate here if needed
  });

  sharedDevice = device;
  deviceLogger.log('[GPUDevice] Shared device initialized');

  return device;
}

/**
 * Destroy the shared device (for cleanup/testing)
 */
export function destroySharedDevice(): void {
  if (sharedDevice) {
    deviceLogger.log('[GPUDevice] Destroying shared device');
    sharedDevice.destroy();
    sharedDevice = null;
    sharedAdapter = null;
    initPromise = null;
  }
}
