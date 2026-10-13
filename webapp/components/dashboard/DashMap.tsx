'use client';

import { useRef, useState } from 'react';
import { WORLD, WORLD_VIEW } from '@/components/dashboard/worldMap';

export type MapCountry = { code: string; value: number; lines: { label: string; text: string }[] };

/** A world map. Colour follows one number; the hover lists the lines for that page. */
export default function DashMap({ countries, locale }: { countries: MapCountry[]; locale: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const byCode = new Map(countries.map((country) => [country.code, country]));
  const max = Math.max(1, ...countries.map((country) => country.value));
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const row = hover ? byCode.get(hover.code) : null;
  const width = box.current?.clientWidth || 1;
  const placeLeft = !!hover && hover.x > width * 0.62;
  const placeBelow = !!hover && hover.y < 88;

  return (
    <div className="dash-map" ref={box}>
      <svg viewBox={WORLD_VIEW} role="img" onPointerLeave={() => setHover(null)}>
        {WORLD.map((country) => {
          const hit = byCode.get(country.id);
          const value = hit?.value || 0;
          return (
            <path key={country.id} d={country.d} className={hover?.code === country.id ? 'on' : undefined}
              style={value ? { fill: 'var(--accent)', opacity: 0.35 + 0.65 * (value / max) } : undefined}
              onPointerEnter={(event) => {
                const bounds = box.current?.getBoundingClientRect();
                if (!bounds) return;
                setHover({ code: country.id, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
              }}
              onPointerMove={(event) => {
                const bounds = box.current?.getBoundingClientRect();
                if (!bounds) return;
                setHover({ code: country.id, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
              }}>
              <title>{names.of(country.id) || country.id}</title>
            </path>
          );
        })}
      </svg>
      {hover && (
        <div className="dash-tip dash-map-tip" style={{
          left: hover.x, top: hover.y,
          transform: `${placeLeft ? 'translateX(-100%)' : 'translateX(12px)'} ${placeBelow ? 'translateY(12px)' : 'translateY(-100%)'}`,
        }}>
          <strong>{names.of(hover.code) || hover.code}</strong>
          {(row?.lines || []).map((line) => <span key={line.label}>{line.label} {line.text}</span>)}
        </div>
      )}
    </div>
  );
}
