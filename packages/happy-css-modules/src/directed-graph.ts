export class DirectedGraph {
  readonly #graph: Map<string, Set<string>> = new Map();
  readonly #reverseGraph: Map<string, Set<string>> = new Map();

  addNodeAndEdges(node: string, edges: string[]) {
    // Update graph
    const edgesSet = this.#graph.get(node) ?? new Set();
    for (const edge of edges) {
      edgesSet.add(edge);
    }
    this.#graph.set(node, edgesSet);

    // Update reverse graph
    for (const edge of edges) {
      const reverseEdgesSet = this.#reverseGraph.get(edge) ?? new Set();
      reverseEdgesSet.add(node);
      this.#reverseGraph.set(edge, reverseEdgesSet);
    }
  }
  removeNode(node: string) {
    // Update graph
    const edgesSet = this.#graph.get(node);
    if (edgesSet === undefined) return;

    this.#graph.delete(node);

    // Update reverse graph
    for (const edge of edgesSet) {
      const reverseSet = this.#reverseGraph.get(edge)!;
      reverseSet.delete(node);
    }
  }
  getReachableNodes(node: string): string[] {
    const visited = new Set<string>();
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.pop()!;
      visited.add(current);
      for (const edge of this.#reverseGraph.get(current) ?? []) {
        if (!visited.has(edge)) {
          queue.push(edge);
        }
      }
    }
    visited.delete(node);
    return [...visited];
  }
}
