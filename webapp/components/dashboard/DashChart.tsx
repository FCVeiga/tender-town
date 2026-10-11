'use client';

import { useState } from 'react';

export type ChartPoint = { t: number; [key: string]: number };
export type ChartSeries = { key: string; color: string };

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
export default function DashChart({ points, series, labels, totals, locale, hourly }: {
  points: ChartPoint[];
  series: ChartSeries[];
  labels: Record<string, string>;
  totals: Record<string, string>;
  locale: string;
  hourly: boolean;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const shown = series.filter((item) => !hidden.includes(item.key));
  if (!points.length) {
    return (
      <div className="dash-legend">
        {series.map((item) => (
          <span key={item.key}><i className="dash-swatch" style={{ background: item.color }} />{labels[item.key]} <strong>{totals[item.key]}</strong></span>
        ))}
      </div>
    );
  }
  const max = niceMax(Math.max(1, ...points.flatMap((point) => shown.map((item) => point[item.key]))));
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
        {series.map((item) => (
          <button key={item.key} type="button" aria-pressed={!hidden.includes(item.key)} className={hidden.includes(item.key) ? 'off' : undefined} onClick={() => {
            setHidden((cur) => cur.includes(item.key) ? cur.filter((key) => key !== item.key) : cur.length === series.length - 1 ? cur : [...cur, item.key]);
          }}>
            <i className="dash-swatch" style={{ background: item.color }} />
            {labels[item.key]} <strong>{totals[item.key]}</strong>
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
        {shown.map((item) => {
          const d = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(point[item.key]).toFixed(1)}`).join(' ');
          return <path key={item.key} d={d} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {index != null && <line x1={x(index)} x2={x(index)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--border-strong)" strokeDasharray="3 3" />}
        {index != null && shown.map((item) => (
          <circle key={item.key} cx={x(index)} cy={y(points[index][item.key])} r="3.5" fill={item.color} />
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
          {shown.map((item) => <div key={item.key}><em>{labels[item.key]}</em> {active[item.key]}</div>)}
        </div>
      )}
      </div>
    </div>
  );
}
