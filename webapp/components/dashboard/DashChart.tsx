'use client';

import { useState } from 'react';

export type ChartPoint = { t: number; home: number; community: number; news: number; tenders: number };
type Key = 'home' | 'community' | 'news' | 'tenders';

const SERIES: { key: Key; color: string }[] = [
  { key: 'home', color: 'var(--accent)' },
  { key: 'community', color: 'var(--rfi)' },
  { key: 'news', color: 'var(--grant)' },
  { key: 'tenders', color: 'var(--warn)' },
];

const W = 720;
const H = 220;
const PAD = { l: 32, r: 8, t: 16, b: 28 };

function niceMax(n: number) {
  if (n <= 4) return Math.max(1, n);
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const scaled = n / pow;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * pow;
}

/** Lines for the selected timeframe. The legend toggles a series; hovering a point shows its values. */
export default function DashChart({ points, labels, totals, locale, hourly }: {
  points: ChartPoint[];
  labels: Record<Key, string>;
  totals: Record<Key, string>;
  locale: string;
  hourly: boolean;
}) {
  const [hidden, setHidden] = useState<Key[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const shown = SERIES.filter((series) => !hidden.includes(series.key));
  if (!points.length) {
    return (
      <div className="dash-legend">
        {SERIES.map((series) => (
          <span key={series.key}><i className="dash-swatch" style={{ background: series.color }} />{labels[series.key]} <strong>{totals[series.key]}</strong></span>
        ))}
      </div>
    );
  }
  const max = niceMax(Math.max(1, ...points.flatMap((point) => shown.map((series) => point[series.key]))));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (v / max) * innerH;
  const ticks = max <= 1 ? [0, 1] : [0, Math.round(max / 2), max];
  const labelAt = (i: number) => new Date(points[i].t).toLocaleString(locale, hourly
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short' });
  const axisAt = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((i, n, all) => all.indexOf(i) === n);
  const active = index != null ? points[index] : null;

  return (
    <div className="dash-chart">
      <div className="dash-legend">
        {SERIES.map((series) => (
          <button key={series.key} type="button" aria-pressed={!hidden.includes(series.key)} className={hidden.includes(series.key) ? 'off' : undefined} onClick={() => {
            setHidden((cur) => cur.includes(series.key) ? cur.filter((key) => key !== series.key) : cur.length === SERIES.length - 1 ? cur : [...cur, series.key]);
          }}>
            <i className="dash-swatch" style={{ background: series.color }} />
            {labels[series.key]} <strong>{totals[series.key]}</strong>
          </button>
        ))}
      </div>
      <div className="dash-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ fontFamily: 'inherit' }} onPointerLeave={() => setIndex(null)} onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width) * W;
        let best = 0;
        let dist = Infinity;
        points.forEach((_, i) => {
          const d = Math.abs(x(i) - px);
          if (d < dist) { dist = d; best = i; }
        });
        setIndex(best);
      }}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(tick) + 3} textAnchor="end" fill="var(--subtle)" fontSize="10">{tick}</text>
          </g>
        ))}
        {shown.map((series) => {
          const d = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(point[series.key]).toFixed(1)}`).join(' ');
          return <path key={series.key} d={d} fill="none" stroke={series.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {index != null && <line x1={x(index)} x2={x(index)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--border-strong)" strokeDasharray="3 3" />}
        {index != null && shown.map((series) => (
          <circle key={series.key} cx={x(index)} cy={y(points[index][series.key])} r="3.5" fill={series.color} />
        ))}
        {axisAt.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fill="var(--subtle)" fontSize="10">
            {labelAt(i)}
          </text>
        ))}
      </svg>
      {active && index != null && (
        <div className="dash-tip" style={{ left: `${(x(index) / W) * 100}%`, top: 8, transform: `translate(${x(index) / W < 0.2 ? '0' : x(index) / W > 0.8 ? '-100%' : '-50%'}, 0)` }}>
          <strong>{labelAt(index)}</strong>
          {shown.map((series) => <div key={series.key}><em>{labels[series.key]}</em> {active[series.key]}</div>)}
        </div>
      )}
      </div>
    </div>
  );
}
