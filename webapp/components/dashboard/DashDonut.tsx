'use client';

import { useState } from 'react';

export type DonutSlice = { key: string; label: string; display: string; value: number; color: string; href?: string };

const R = 68;
const C = 2 * Math.PI * R;

/** A distribution ring. The centre is the total; the legend is each slice's value. */
export default function DashDonut({ slices, center }: { slices: DonutSlice[]; center: string }) {
  const [active, setActive] = useState<string | null>(null);
  const drawn = slices.filter((slice) => slice.value > 0);
  const sum = drawn.reduce((total, slice) => total + slice.value, 0);
  let offset = 0;
  const gap = drawn.length > 1 ? 3 : 0;

  return (
    <div className="dash-donut">
      <svg viewBox="0 0 180 180" role="img">
        <g transform="rotate(-90 90 90)">
          {sum === 0 ? <circle cx="90" cy="90" r={R} fill="none" stroke="var(--border)" strokeWidth="22" /> : drawn.map((slice) => {
            const len = Math.max(0, (slice.value / sum) * C - gap);
            const start = offset;
            offset += (slice.value / sum) * C;
            const circle = (
              <circle cx="90" cy="90" r={R} fill="none" stroke={slice.color} strokeWidth={active === slice.key ? 26 : 22}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-start} strokeLinecap="butt"
                opacity={active && active !== slice.key ? 0.35 : 1}
                onPointerEnter={() => setActive(slice.key)} onPointerLeave={() => setActive(null)}>
                <title>{`${slice.label} ${slice.display}`}</title>
              </circle>
            );
            return slice.href ? <a key={slice.key} href={slice.href}>{circle}</a> : <g key={slice.key}>{circle}</g>;
          })}
        </g>
        <text x="90" y="96" textAnchor="middle" fill="var(--ink)" fontSize="22" fontWeight="700">{center}</text>
      </svg>
      <ul className="dash-donut-legend">
        {slices.map((slice) => {
          const body = (<><i className="dash-swatch" style={{ background: slice.color }} /><span>{slice.label}</span><strong>{slice.display}</strong></>);
          return (
            <li key={slice.key} className={active === slice.key ? 'on' : undefined} onPointerEnter={() => setActive(slice.key)} onPointerLeave={() => setActive(null)}>
              {slice.href ? <a href={slice.href}>{body}</a> : body}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
