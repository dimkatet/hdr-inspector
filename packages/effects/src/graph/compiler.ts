import type { NodeId } from '../types';
import type { EffectGraph } from './Graph';

// ---- Output types ----

export interface ExecutionStep {
  /** = NodeId */
  readonly id: string;
  /** = EffectNode['type'] */
  readonly type: string;
  /**
   * The node's concrete params object.
   * Phase 2 WebGPU adapter switches on `type` and casts to the specific params interface.
   */
  readonly params: Record<string, unknown>;
  /**
   * Map from input port name to the id of the step that produces that input.
   * Only ports with an active connection are present.
   * Ports absent here either use default values or belong to source nodes.
   */
  readonly inputs: Readonly<Record<string, string>>;
  /** Useful for Phase 2 type dispatch without re-importing EffectNode */
  readonly outputType: string;
}

export interface ExecutionPlan {
  /** Steps in dependency-first (topological) order */
  readonly steps: readonly ExecutionStep[];
  /** Id of the step whose output is the final graph result */
  readonly outputId: string;
}

// ---- Error ----

export class CompileError extends Error {
  constructor(message: string) {
    super(`[EffectGraph compiler] ${message}`);
    this.name = 'CompileError';
  }
}

// ---- compile() ----

/**
 * Compiles an EffectGraph into a topologically sorted ExecutionPlan.
 *
 * Steps:
 * 1. Validate the graph (throws CompileError if invalid)
 * 2. Build adjacency list and in-degree map
 * 3. Kahn's algorithm for topological sort
 * 4. Emit ExecutionSteps with resolved input references
 */
export function compile(graph: EffectGraph): ExecutionPlan {
  const validation = graph.validate();
  if (!validation.valid) {
    const messages = validation.errors.map((e) => e.message).join('; ');
    throw new CompileError(`Graph is invalid: ${messages}`);
  }

  const outputId = graph.getOutputId()!;
  const nodes = graph.getNodes();
  const connections = graph.getConnections();

  // Build:
  // - in-degree map (how many nodes feed into each node)
  // - adjacency list (node → nodes it feeds into)
  // - per-node input map (toNode → { portName: fromNode })
  const inDegree = new Map<NodeId, number>();
  const adj = new Map<NodeId, NodeId[]>();
  const inputsByNode = new Map<NodeId, Record<string, string>>();

  for (const id of nodes.keys()) {
    inDegree.set(id, 0);
    adj.set(id, []);
    inputsByNode.set(id, {});
  }

  for (const conn of connections) {
    adj.get(conn.fromNode)!.push(conn.toNode);
    inDegree.set(conn.toNode, (inDegree.get(conn.toNode) ?? 0) + 1);
    inputsByNode.get(conn.toNode)![conn.toPort] = conn.fromNode;
  }

  // Kahn's algorithm — BFS topological sort
  // Seed queue with all zero-in-degree nodes, sorted by node index for determinism
  const queue: NodeId[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  queue.sort((a, b) => nodeIndex(a) - nodeIndex(b));

  const sorted: NodeId[] = [];

  while (queue.length > 0) {
    const u = queue.shift()!;
    sorted.push(u);

    const neighbors = adj.get(u) ?? [];
    // Sort neighbors for determinism
    neighbors.sort((a, b) => nodeIndex(a) - nodeIndex(b));

    for (const v of neighbors) {
      const newDeg = inDegree.get(v)! - 1;
      inDegree.set(v, newDeg);
      if (newDeg === 0) queue.push(v);
    }
  }

  // Cycle guard (shouldn't happen after validate(), but be defensive)
  if (sorted.length !== nodes.size) {
    throw new CompileError('Cycle detected during topological sort');
  }

  const steps: ExecutionStep[] = sorted.map((id) => {
    const node = nodes.get(id)!;
    return {
      id,
      type: node.type,
      params: node.params as Record<string, unknown>,
      inputs: inputsByNode.get(id)!,
      outputType: node.outputType,
    };
  });

  return { steps, outputId };
}

/** Extract the numeric index from a `node-N` id for deterministic ordering. */
function nodeIndex(id: string): number {
  const match = /^node-(\d+)$/.exec(id);
  return match ? Number.parseInt(match[1], 10) : 0;
}
