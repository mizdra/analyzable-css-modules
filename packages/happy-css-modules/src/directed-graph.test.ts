import { DirectedGraph } from './directed-graph.js';

describe('DirectedGraph', () => {
  it('getReachableNodes', () => {
    const graph1 = new DirectedGraph();
    graph1.addNodeAndEdges('a', ['c']);
    graph1.addNodeAndEdges('b', ['c']);
    graph1.addNodeAndEdges('c', []);
    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
    expect(graph1.getReachableNodes('c').sort()).toStrictEqual(['a', 'b']);

    const graph2 = new DirectedGraph();
    graph2.addNodeAndEdges('a', ['b']);
    graph2.addNodeAndEdges('b', ['c']);
    graph2.addNodeAndEdges('c', []);
    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
    expect(graph2.getReachableNodes('c').sort()).toStrictEqual(['a', 'b']);

    const graph3 = new DirectedGraph();
    graph3.addNodeAndEdges('a', []);
    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
    expect(graph3.getReachableNodes('a').sort()).toStrictEqual([]);

    const graph4 = new DirectedGraph();
    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
    expect(graph4.getReachableNodes('a').sort()).toStrictEqual([]);

    const graph5 = new DirectedGraph();
    graph5.addNodeAndEdges('a', ['b']);
    graph5.addNodeAndEdges('b', ['a']);
    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
    expect(graph5.getReachableNodes('b').sort()).toStrictEqual(['a']);
  });
  it('removeNode', () => {
    const graph1 = new DirectedGraph();
    graph1.addNodeAndEdges('a', ['c']);
    graph1.addNodeAndEdges('b', ['c']);
    graph1.addNodeAndEdges('c', []);
    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
    expect(graph1.getReachableNodes('c').sort()).toStrictEqual(['a', 'b']);
    graph1.removeNode('a');
    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
    expect(graph1.getReachableNodes('c').sort()).toStrictEqual(['b']);
  });
});
