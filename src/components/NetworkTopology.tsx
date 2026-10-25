import {Easing, useCurrentFrame} from 'remotion';
import {easeOutSoft, track} from '../lib/motion';

export const CANVAS = {width: 1920, height: 1080};
export const CENTER = {x: CANVAS.width / 2, y: CANVAS.height / 2};

export type TopologyNode = {
  x: number;
  y: number;
  hub: boolean;
  delay: number;
};

export type TopologyEdge = {
  a: number;
  b: number;
  delay: number;
};

export type Topology = {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  packetEdges: number[];
};

// Small seeded PRNG so the layout is identical in preview and every render.
const seededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const buildTopology = (seed = 1907, columns = 7, rows = 5): Topology => {
  const random = seededRandom(seed);
  const nodes: TopologyNode[] = [];
  const xStep = 1520 / (columns - 1);
  const yStep = 720 / (rows - 1);

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      nodes.push({
        x: 200 + column * xStep + (random() - 0.5) * 90,
        y: 180 + row * yStep + (random() - 0.5) * 80,
        hub: false,
        delay: 0,
      });
    }
  }

  nodes.push({x: CENTER.x, y: CENTER.y, hub: true, delay: 0});

  const distanceFromCenter = (node: TopologyNode) => Math.hypot(node.x - CENTER.x, node.y - CENTER.y);
  const maxDistance = Math.max(...nodes.map(distanceFromCenter));
  // Nodes bloom outward from the hub over roughly the first 1.5 seconds.
  nodes.forEach((node) => {
    node.delay = node.hub ? 4 : 10 + (distanceFromCenter(node) / maxDistance) * 40;
  });

  const edgeMap = new Map<string, TopologyEdge>();
  nodes.forEach((node, index) => {
    const neighbours = nodes
      .map((other, otherIndex) => ({otherIndex, distance: Math.hypot(other.x - node.x, other.y - node.y)}))
      .filter(({otherIndex}) => otherIndex !== index)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, node.hub ? 6 : 2);

    neighbours.forEach(({otherIndex}) => {
      const a = Math.min(index, otherIndex);
      const b = Math.max(index, otherIndex);
      const key = `${a}-${b}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {a, b, delay: Math.max(nodes[a].delay, nodes[b].delay) + 3});
      }
    });
  });

  const edges = [...edgeMap.values()];
  const packetRandom = seededRandom(seed + 7);
  const packetEdges = Array.from({length: 12}, () => Math.floor(packetRandom() * edges.length));

  return {nodes, edges, packetEdges};
};

type NetworkTopologyProps = {
  topology: Topology;
  camera: {x: number; y: number; scale: number};
  // 0 = laid out across the frame, 1 = collapsed toward the centre.
  converge: number;
  opacity: number;
  packetStart: number;
};

export const NetworkTopology: React.FC<NetworkTopologyProps> = ({
  topology,
  camera,
  converge,
  opacity,
  packetStart,
}) => {
  const frame = useCurrentFrame();
  const {nodes, edges, packetEdges} = topology;

  const position = (node: TopologyNode) => ({
    x: node.x + (CENTER.x - node.x) * converge * 0.92,
    y: node.y + (CENTER.y - node.y) * converge * 0.92,
  });

  const reveal = (delay: number) =>
    track(frame, [
      [delay, 0],
      [delay + 16, 1, Easing.out(Easing.cubic)],
    ]);

  const hubIndex = nodes.findIndex((node) => node.hub);
  const hub = position(nodes[hubIndex]);

  return (
    <g opacity={opacity}>
      <defs>
        <radialGradient id="network-halo">
          <stop offset="0" stopColor="#53f6ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#53f6ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform={`translate(${CENTER.x} ${CENTER.y}) scale(${camera.scale}) translate(${-camera.x} ${-camera.y})`}>
        {edges.map((edge) => {
          const from = position(nodes[edge.a]);
          const to = position(nodes[edge.b]);
          const draw = track(frame, [
            [edge.delay, 0],
            [edge.delay + 14, 1, easeOutSoft],
          ]);

          return (
            <path
              key={`${edge.a}-${edge.b}`}
              d={`M${from.x} ${from.y} L${to.x} ${to.y}`}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - draw}
              stroke="rgba(83, 246, 255, 0.4)"
              strokeWidth={1.4}
              fill="none"
            />
          );
        })}

        {packetEdges.map((edgeIndex, packet) => {
          const edge = edges[edgeIndex];
          const start = packetStart + packet * 5;
          const progress = track(frame, [
            [start, 0],
            [start + 22, 1, Easing.inOut(Easing.cubic)],
          ]);
          const visibility = track(frame, [
            [start, 0],
            [start + 4, 1],
            [start + 18, 1],
            [start + 22, 0],
          ]);
          const from = position(nodes[edge.a]);
          const to = position(nodes[edge.b]);

          return (
            <g key={`packet-${packet}`} opacity={visibility}>
              <circle cx={from.x + (to.x - from.x) * progress} cy={from.y + (to.y - from.y) * progress} r={22} fill="url(#network-halo)" />
              <circle cx={from.x + (to.x - from.x) * progress} cy={from.y + (to.y - from.y) * progress} r={4} fill="#00ffc7" />
            </g>
          );
        })}

        {nodes.map((node, index) => {
          const {x, y} = position(node);
          const appear = reveal(node.delay);
          const radius = node.hub ? 9 : 4.5;

          return (
            <g key={index} opacity={appear}>
              <circle cx={x} cy={y} r={node.hub ? 100 : 34} fill="url(#network-halo)" opacity={node.hub ? 0.8 : 0.5} />
              <circle cx={x} cy={y} r={radius} fill="#e9ffff" stroke="#53f6ff" strokeWidth={1.5} />
            </g>
          );
        })}

        <circle
          cx={hub.x}
          cy={hub.y}
          r={46}
          fill="none"
          stroke="#53f6ff"
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeDasharray="6 10"
          transform={`rotate(${frame * 0.9} ${hub.x} ${hub.y})`}
        />
      </g>
    </g>
  );
};
