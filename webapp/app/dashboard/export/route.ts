import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/admin';
import { diagnosisReport } from '@/lib/productReport';
import type { Row } from '@/lib/productFunnel';

export const dynamic = 'force-dynamic';

function csv(rows: Row[]) {
  if (!rows.length) return 'empty\n';
  const keys = Object.keys(rows[0]);
  const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return `${keys.join(',')}\n${rows.map((row) => keys.map((key) => cell(row[key])).join(',')).join('\n')}\n`;
}

export async function GET(request: Request) {
  if (!(await isSuperAdmin())) return new NextResponse('Not found', { status: 404 });
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const { filters, report } = await diagnosisReport(query);
  const table = filters.tab === 'acquisition' ? report.acquisition
    : filters.tab === 'journeys' ? report.content
      : filters.tab === 'signup' ? report.signup.validation
        : filters.tab === 'health' ? report.legacy.pages
          : report.funnel.map((step) => ({ step: step.label, count: step.count, from_previous: step.fromPrev, from_start: step.fromFirst, lost: step.lost }));
  return new NextResponse(csv(table), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tender-town-analytics.csv"' },
  });
}
