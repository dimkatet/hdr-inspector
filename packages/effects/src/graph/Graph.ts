import type {
  BlendParams,
  BlockWarpParams,
  ChannelMixParams,
  ChannelOffsetParams,
  ColorTransformParams,
  DomainWarpParams,
  EffectNode,
  FBMParams,
  GradientMapParams,
  LumaMaskParams,
  MaskParams,
  MathParams,
  MixParams,
  NodeTypeTag,
  Noise2DParams,
  PixelateParams,
  TextureInputParams,
  TransformParams,
  VignetteParams,
  WarpParams,
} from '../nodes/types';
import { type Connection, makeNodeId, type NodeId } from '../types';

// ---- Validation ----

export interface ValidationError {
  readonly kind: 'cycle' | 'missing-required-input' | 'no-output';
  readonly message: string;
  readonly nodeId?: NodeId;
  readonly port?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

// ---- Serialization schema ----

export interface SerializedNode {
  readonly id: string;
  readonly type: NodeTypeTag;
  readonly params: Record<string, unknown>;
  readonly outputType: string;
}

export interface SerializedConnection {
  readonly fromNode: string;
  readonly toNode: string;
  readonly toPort: string;
}

export interface EffectGraphData {
  readonly nodes: readonly SerializedNode[];
  readonly connections: readonly SerializedConnection[];
  readonly outputId: string | null;
}

// ---- Required ports per node type ----
// A port is "required" if the node cannot produce a meaningful result without it.
// Optional ports (e.g. utility.mix:factor) are not listed here.

const REQUIRED_PORTS: Partial<Record<NodeTypeTag, readonly string[]>> = {
  'geometry.warp': ['image', 'field'],
  'geometry.transform': ['image'],
  'color.transform': ['image'],
  'color.gradientMap': ['luminance'],
  'channel.offset': ['image'],
  'channel.mix': ['a', 'b'],
  'utility.mix': ['a', 'b'],
  'utility.mask': ['image', 'mask'],
  'utility.math': ['a', 'b'],
  'effect.vignette': ['image'],
  'utility.blend': ['a', 'b'],
  'utility.lumaMask': ['image'],
  'geometry.domainWarp': ['image'],
  'utility.pixelate': ['image'],
  'geometry.blockWarp': ['image'],
};

// ---- Node factory registry (used by fromJSON) ----

type NodeFactory = (params: Record<string, unknown>) => EffectNode;

const NODE_FACTORIES = new Map<NodeTypeTag, NodeFactory>([
  [
    'source',
    (p) => ({
      type: 'source',
      outputType: 'rgba',
      inputPorts: [] as const,
      params: p as unknown as TextureInputParams,
    }),
  ],
  [
    'noise.2d',
    (p) => ({
      type: 'noise.2d',
      outputType: 'scalar',
      inputPorts: [] as const,
      params: p as unknown as Noise2DParams,
    }),
  ],
  [
    'noise.fbm',
    (p) => ({
      type: 'noise.fbm',
      outputType: 'scalar',
      inputPorts: [] as const,
      params: p as unknown as FBMParams,
    }),
  ],
  [
    'geometry.warp',
    (p) => ({
      type: 'geometry.warp',
      outputType: 'rgba',
      inputPorts: ['image', 'field'] as const,
      params: p as unknown as WarpParams,
    }),
  ],
  [
    'geometry.transform',
    (p) => ({
      type: 'geometry.transform',
      outputType: 'rgba',
      inputPorts: ['image'] as const,
      params: p as unknown as TransformParams,
    }),
  ],
  [
    'color.transform',
    (p) => ({
      type: 'color.transform',
      outputType: 'rgba',
      inputPorts: ['image'] as const,
      params: p as unknown as ColorTransformParams,
    }),
  ],
  [
    'color.gradientMap',
    (p) => ({
      type: 'color.gradientMap',
      outputType: 'rgba',
      inputPorts: ['luminance'] as const,
      params: p as unknown as GradientMapParams,
    }),
  ],
  [
    'channel.offset',
    (p) => ({
      type: 'channel.offset',
      outputType: 'rgba',
      inputPorts: ['image'] as const,
      params: p as unknown as ChannelOffsetParams,
    }),
  ],
  [
    'channel.mix',
    (p) => ({
      type: 'channel.mix',
      outputType: 'rgba',
      inputPorts: ['a', 'b'] as const,
      params: p as unknown as ChannelMixParams,
    }),
  ],
  [
    'utility.mix',
    (p) => ({
      type: 'utility.mix',
      outputType: 'rgba',
      inputPorts: ['a', 'b', 'factor'] as const,
      params: p as unknown as MixParams,
    }),
  ],
  [
    'utility.mask',
    (p) => ({
      type: 'utility.mask',
      outputType: 'rgba',
      inputPorts: ['image', 'mask'] as const,
      params: p as unknown as MaskParams,
    }),
  ],
  [
    'utility.math',
    (p) => ({
      type: 'utility.math',
      outputType: 'scalar',
      inputPorts: ['a', 'b'] as const,
      params: p as unknown as MathParams,
    }),
  ],
  [
    'effect.vignette',
    (p) => ({
      type: 'effect.vignette',
      outputType: 'rgba',
      inputPorts: ['image'] as const,
      params: p as unknown as VignetteParams,
    }),
  ],
  [
    'utility.blend',
    (p) => ({
      type: 'utility.blend',
      outputType: 'rgba',
      inputPorts: ['a', 'b'] as const,
      params: p as unknown as BlendParams,
    }),
  ],
  [
    'utility.lumaMask',
    (p) => ({
      type: 'utility.lumaMask',
      outputType: 'scalar',
      inputPorts: ['image'] as const,
      params: p as unknown as LumaMaskParams,
    }),
  ],
  [
    'geometry.domainWarp',
    (p) => ({
      type: 'geometry.domainWarp',
      outputType: 'rgba',
      inputPorts: ['image'] as const,
      params: p as unknown as DomainWarpParams,
    }),
  ],
  [
    'utility.pixelate',
    (p) => ({
      type: 'utility.pixelate',
      outputType: 'rgba',
      inputPorts: ['image'] as const,
      params: p as unknown as PixelateParams,
    }),
  ],
  [
    'geometry.blockWarp',
    (p) => ({
      type: 'geometry.blockWarp',
      outputType: 'rgba',
      inputPorts: ['image'] as const,
      params: p as unknown as BlockWarpParams,
    }),
  ],
]);

// ---- EffectGraph ----

export class EffectGraph {
  private readonly nodes = new Map<NodeId, EffectNode>();
  private readonly connections: Connection[] = [];
  private outputId: NodeId | null = null;
  private nextId = 0;

  // ---- Mutation API ----

  addNode(node: EffectNode): NodeId {
    const id = makeNodeId(`node-${this.nextId++}`);
    this.nodes.set(id, node);
    return id;
  }

  /**
   * Connect the output of `from` to the named input port of `to`.
   * Throws immediately if `to` does not declare the given port.
   * Replaces any existing connection to the same (to, port) pair.
   */
  connect(from: NodeId, to: NodeId, port: string): void {
    this.assertNodeExists(from, 'connect (from)');
    this.assertNodeExists(to, 'connect (to)');

    const toNode = this.nodes.get(to)!;
    if (!(toNode.inputPorts as readonly string[]).includes(port)) {
      throw new Error(
        `[EffectGraph] Node "${to}" (${toNode.type}) has no input port "${port}". ` +
          `Available: [${toNode.inputPorts.join(', ')}]`
      );
    }

    // One-to-one input rule: replace any existing connection to the same port
    const existing = this.connections.findIndex((c) => c.toNode === to && c.toPort === port);
    if (existing !== -1) this.connections.splice(existing, 1);

    this.connections.push({ fromNode: from, toNode: to, toPort: port });
  }

  setOutput(nodeId: NodeId): void {
    this.assertNodeExists(nodeId, 'setOutput');
    this.outputId = nodeId;
  }

  removeNode(id: NodeId): void {
    this.assertNodeExists(id, 'removeNode');
    this.nodes.delete(id);
    for (let i = this.connections.length - 1; i >= 0; i--) {
      const c = this.connections[i];
      if (c.fromNode === id || c.toNode === id) this.connections.splice(i, 1);
    }
    if (this.outputId === id) this.outputId = null;
  }

  // ---- Read API (used by compiler) ----

  getNodes(): ReadonlyMap<NodeId, EffectNode> {
    return this.nodes;
  }

  getConnections(): readonly Connection[] {
    return this.connections;
  }

  getOutputId(): NodeId | null {
    return this.outputId;
  }

  // ---- Validation ----

  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    if (this.outputId === null) {
      errors.push({ kind: 'no-output', message: 'No output node has been set via setOutput()' });
    }

    for (const [id, node] of this.nodes) {
      const required = REQUIRED_PORTS[node.type] ?? [];
      for (const port of required) {
        const connected = this.connections.some((c) => c.toNode === id && c.toPort === port);
        if (!connected) {
          errors.push({
            kind: 'missing-required-input',
            message: `Node "${id}" (${node.type}) is missing required input "${port}"`,
            nodeId: id,
            port,
          });
        }
      }
    }

    if (this.hasCycle()) {
      errors.push({ kind: 'cycle', message: 'Graph contains a cycle' });
    }

    return { valid: errors.length === 0, errors };
  }

  // ---- Serialization ----

  toJSON(): EffectGraphData {
    const nodes: SerializedNode[] = [];
    for (const [id, node] of this.nodes) {
      nodes.push({
        id,
        type: node.type,
        params: node.params as Record<string, unknown>,
        outputType: node.outputType,
      });
    }
    return {
      nodes,
      connections: this.connections.map((c) => ({
        fromNode: c.fromNode,
        toNode: c.toNode,
        toPort: c.toPort,
      })),
      outputId: this.outputId,
    };
  }

  static fromJSON(data: EffectGraphData): EffectGraph {
    const g = new EffectGraph();

    for (const sn of data.nodes) {
      const factory = NODE_FACTORIES.get(sn.type);
      if (!factory) throw new Error(`[EffectGraph] fromJSON: unknown node type "${sn.type}"`);
      const node = factory(sn.params);
      g.nodes.set(sn.id as NodeId, node);
    }

    for (const sc of data.connections) {
      g.connections.push({
        fromNode: sc.fromNode as NodeId,
        toNode: sc.toNode as NodeId,
        toPort: sc.toPort,
      });
    }

    if (data.outputId !== null) {
      g.outputId = data.outputId as NodeId;
    }

    // Update counter to avoid ID collisions on subsequent addNode() calls
    let maxIndex = -1;
    for (const sn of data.nodes) {
      const match = /^node-(\d+)$/.exec(sn.id);
      if (match) {
        const idx = Number.parseInt(match[1], 10);
        if (idx > maxIndex) maxIndex = idx;
      }
    }
    g.nextId = maxIndex + 1;

    return g;
  }

  // ---- Private ----

  private assertNodeExists(id: NodeId, context: string): void {
    if (!this.nodes.has(id)) {
      throw new Error(`[EffectGraph] ${context}: unknown NodeId "${id}"`);
    }
  }

  /**
   * DFS-based cycle detection.
   * Returns true if any cycle exists in the directed graph.
   */
  private hasCycle(): boolean {
    // Build adjacency list: fromNode → [toNode, ...]
    const adj = new Map<NodeId, NodeId[]>();
    for (const id of this.nodes.keys()) adj.set(id, []);
    for (const c of this.connections) {
      adj.get(c.fromNode)!.push(c.toNode);
    }

    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<NodeId, number>();
    for (const id of this.nodes.keys()) color.set(id, WHITE);

    const dfs = (u: NodeId): boolean => {
      color.set(u, GRAY);
      for (const v of adj.get(u) ?? []) {
        if (color.get(v) === GRAY) return true;
        if (color.get(v) === WHITE && dfs(v)) return true;
      }
      color.set(u, BLACK);
      return false;
    };

    for (const id of this.nodes.keys()) {
      if (color.get(id) === WHITE && dfs(id)) return true;
    }
    return false;
  }
}
