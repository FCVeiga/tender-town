import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ID = /^[a-f0-9]{16,64}-[a-f0-9]{8,16}$/i;

function contentType(name: string, bytes: Uint8Array) {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (/\.doc$/i.test(name)) return 'application/msword';
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return /\.xlsx$/i.test(name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : /\.docx$/i.test(name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/zip';
  }
  return 'application/octet-stream';
}

/** A buyer file stored for a signed-in reader. The evaluation agent reads the same object directly. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const id = params.id || '';
  if (!ID.test(id)) return new NextResponse('Not found', { status: 404 });
  const user = await getCurrentUser();
  if (!user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `/files/${id}`);
    return NextResponse.redirect(login);
  }
  const db = getSupabaseServerClient();
  const { data } = await db.from('documents').select('name, storage_path').eq('document_id', id).maybeSingle();
  if (!data?.storage_path) return new NextResponse('Not found', { status: 404 });
  const { data: blob, error } = await db.storage.from('company-files').download(data.storage_path);
  if (error || !blob) return new NextResponse('Not found', { status: 404 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const name = (data.name || 'document').replace(/[\r\n"]/g, ' ').slice(0, 180);
  const ascii = name.replace(/[^\w.\- ]+/g, '_').trim() || 'document';
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType(name, bytes),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
