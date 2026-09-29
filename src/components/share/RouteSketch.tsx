import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import type { Stop } from '@/geo/cluster';

// Tile-free route drawing for share images (equirectangular projection)
export function RouteSketch({ stops, width, height }: { stops: Stop[]; width: number; height: number }) {
  if (!stops.length) return null;
  const pad = 22;
  const kx = Math.cos((stops.reduce((s, p) => s + p.lat, 0) / stops.length) * (Math.PI / 180));
  const xs = stops.map((s) => s.lng * kx);
  const ys = stops.map((s) => s.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY, 1e-4);
  const scale = Math.min((width - pad * 2) / span, (height - pad * 2) / span);
  const ox = (width - (maxX - minX) * scale) / 2;
  const oy = (height - (maxY - minY) * scale) / 2;
  const pts = stops.map((_, i) => ({ x: ox + (xs[i] - minX) * scale, y: height - (oy + (ys[i] - minY) * scale) }));

  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill="#EFE8D8" />
      {pts.slice(0, -1).map((a, i) => {
        const b = pts[i + 1];
        const t = stops[i].toNext?.transport ?? 'transit';
        if (t === 'flight') {
          const cx = (a.x + b.x) / 2 - (b.y - a.y) * 0.25;
          const cy = (a.y + b.y) / 2 + (b.x - a.x) * 0.25;
          return <Path key={i} d={`M${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`} stroke={Colors.accent} strokeWidth={2.5} fill="none" strokeDasharray="2 5" strokeLinecap="round" />;
        }
        return (
          <Path
            key={i}
            d={`M${a.x} ${a.y} L${b.x} ${b.y}`}
            stroke={Colors.teal}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={t === 'transit' ? '6 6' : undefined}
          />
        );
      })}
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 7 : 5} fill={Colors.accent} stroke={Colors.card} strokeWidth={2} />
      ))}
    </Svg>
  );
}
