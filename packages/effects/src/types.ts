/** Branded NodeId — prevents plain strings from being used where a NodeId is required */
export type NodeId = string & { readonly _brand: 'NodeId' }

/** Creates a typed NodeId. Only Graph.addNode (and fromJSON) should call this. */
export function makeNodeId(raw: string): NodeId {
  return raw as NodeId
}

// ---- Primitive vector types ----

export type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]
export type Vec4 = readonly [number, number, number, number]

/** RGBA color, components in [0, 1] (linear) */
export type ColorRGBA = Vec4

/** A single stop on a gradient, t in [0, 1] */
export interface GradientStop {
  readonly t: number
  readonly color: ColorRGBA
}

/**
 * Every distinct value type a node parameter can hold.
 * Discriminated by `kind` so callers can switch exhaustively.
 * Used when parameters need to be introspected at runtime
 * (e.g. for a future preset serialization layer or node editor).
 */
export type ParamValue =
  | { readonly kind: 'scalar'; readonly value: number }
  | { readonly kind: 'vec2'; readonly value: Vec2 }
  | { readonly kind: 'vec3'; readonly value: Vec3 }
  | { readonly kind: 'vec4'; readonly value: Vec4 }
  | { readonly kind: 'color'; readonly value: ColorRGBA }
  | { readonly kind: 'gradient'; readonly stops: readonly GradientStop[] }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'seed'; readonly value: number }

/**
 * What a node's output port produces.
 * Used by the compiler to validate connections.
 */
export type OutputType = 'rgba' | 'scalar' | 'vec2'

/**
 * A directed connection from one node's output to a named input port of another node.
 * Stored in the graph separately from node data.
 */
export interface Connection {
  readonly fromNode: NodeId
  readonly toNode: NodeId
  readonly toPort: string
}
