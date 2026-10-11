'use client';

import { useRef, useState } from 'react';
import { WORLD, WORLD_VIEW } from '@/components/dashboard/worldMap';

export type MapCountry = { code: string; visits: number; visitsLabel: string; accounts: string; revenue: string; scopes: string };

/** A world map. Hovering a country shows its visits, accounts, revenue and scopes. */
export default function DashMap({ countries, labels, locale, zero }: {
  countries: MapCountry[];
  labels: { visits: string; accounts: string; revenue: string; scopes: string };
  locale: string;
  zero: { visits: string; accounts: string; revenue: string; scopes: string };
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const byCode = new Map(countries.map((country) => [country.code, country]));
  const max = Math.max(1, ...countries.map((country) => country.visits));
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
          const visits = hit?.visits || 0;
          return (
            <path key={country.id} d={country.d} className={hover?.code === country.id ? 'on' : undefined}
              style={visits ? { fill: 'var(--accent)', opacity: 0.35 + 0.65 * (visits / max) } : undefined}
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
          <span>{labels.visits} {row?.visitsLabel || zero.visits}</span>
          <span>{labels.accounts} {row?.accounts || zero.accounts}</span>
          <span>{labels.revenue} {row?.revenue || zero.revenue}</span>
          <span>{labels.scopes} {row?.scopes || zero.scopes}</span>
        </div>
      )}
    </div>
  );
}
