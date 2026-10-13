import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase';

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const SCOPE = 'account';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function mcpResource(origin: string) {
  return `${origin}/api/mcp`;
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [SCOPE],
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResource(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    resource_documentation: `${origin}/mcp.md`,
    bearer_methods_supported: ['header'],
  };
}

export type AuthorizeClient = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  resource: string | null;
  scope: string;
  clientName: string;
};

export type AuthorizeResult =
  | { ok: true; client: AuthorizeClient }
  | { ok: false; redirect: string | null };

function paramsOf(input: URLSearchParams) {
  return {
    responseType: input.get('response_type') || '',
    clientId: input.get('client_id') || '',
    redirectUri: input.get('redirect_uri') || '',
    state: input.get('state'),
    challenge: input.get('code_challenge') || '',
    method: input.get('code_challenge_method') || '',
    resource: input.get('resource'),
    scope: input.get('scope') || '',
  };
}

function privateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '0.0.0.0' || host === '::1') return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || a === 0;
}

function httpsUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.protocol !== 'https:' || privateHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function redirectAllowed(raw: string) {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:' && !privateHost(url.hostname)) return true;
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
    return false;
  } catch {
    return false;
  }
}

function sameResource(origin: string, resource: string | null) {
  if (!resource) return true;
  const bare = resource.replace(/\/$/, '');
  return bare === mcpResource(origin) || bare === origin;
}

function errorRedirect(redirectUri: string, state: string | null, issuer: string, error: string) {
  const back = new URL(redirectUri);
  back.searchParams.set('error', error);
  back.searchParams.set('iss', issuer);
  if (state) back.searchParams.set('state', state);
  return back.toString();
}

type ClientDoc = { client_id?: string; client_name?: string; redirect_uris?: unknown; token_endpoint_auth_method?: string };

async function clientDocument(clientId: string): Promise<ClientDoc | null> {
  const url = httpsUrl(clientId);
  if (!url) return null;
  const res = await fetch(url, {
    redirect: 'manual',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res || res.status !== 200) return null;
  const text = await res.text();
  if (text.length > 32768) return null;
  try {
    return JSON.parse(text) as ClientDoc;
  } catch {
    return null;
  }
}

/** Check the authorization request. Redirect only when the client and redirect URI are real. */
export async function resolveAuthorize(origin: string, input: URLSearchParams): Promise<AuthorizeResult> {
  const p = paramsOf(input);
  const trusted = redirectAllowed(p.redirectUri);
  const fail = (error: string): AuthorizeResult => ({
    ok: false,
    redirect: trusted ? errorRedirect(p.redirectUri, p.state, origin, error) : null,
  });
  if (!p.clientId || p.clientId.length > 512 || !p.redirectUri || p.redirectUri.length > 512) return fail('invalid_request');
  if (p.state && p.state.length > 512) return fail('invalid_request');
  if (p.responseType !== 'code') return fail('unsupported_response_type');
  if (p.method !== 'S256' || p.challenge.length < 43 || p.challenge.length > 128) return fail('invalid_request');
  if (!sameResource(origin, p.resource)) return fail('invalid_target');
  const doc = await clientDocument(p.clientId);
  const uris = Array.isArray(doc?.redirect_uris) ? doc.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!doc || (doc.client_id && doc.client_id !== p.clientId) || !uris.includes(p.redirectUri)) return { ok: false, redirect: null };
  if (doc.token_endpoint_auth_method && doc.token_endpoint_auth_method !== 'none') return fail('invalid_client');
  return {
    ok: true,
    client: {
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      state: p.state,
      codeChallenge: p.challenge,
      resource: p.resource,
      scope: SCOPE,
      clientName: (doc.client_name || '').trim().slice(0, 80),
    },
  };
}

export function successRedirect(origin: string, client: AuthorizeClient, code: string) {
  const back = new URL(client.redirectUri);
  back.searchParams.set('code', code);
  back.searchParams.set('iss', origin);
  if (client.state) back.searchParams.set('state', client.state);
  return back.toString();
}

export function denyRedirect(origin: string, client: AuthorizeClient) {
  return errorRedirect(client.redirectUri, client.state, origin, 'access_denied');
}

async function insertGrant(row: Record<string, unknown>) {
  const { error } = await getSupabaseServerClient().from('oauth_grants').insert(row);
  if (error) throw new Error('Could not store the grant.');
}

export async function issueCode(userId: string, client: AuthorizeClient) {
  const code = randomBytes(32).toString('base64url');
  await insertGrant({
    kind: 'code',
    token_hash: hash(code),
    client_id: client.clientId,
    user_id: userId,
    redirect_uri: client.redirectUri,
    code_challenge: client.codeChallenge,
    scope: client.scope,
    resource: client.resource,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return code;
}

function s256(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

function pkceMatches(challenge: string, verifier: string) {
  if (verifier.length < 43 || verifier.length > 128 || !/^[A-Za-z0-9\-._~]+$/.test(verifier)) return false;
  const got = Buffer.from(s256(verifier));
  const want = Buffer.from(challenge);
  return got.length === want.length && timingSafeEqual(got, want);
}

type GrantRow = {
  user_id: string; client_id: string; redirect_uri: string | null; code_challenge: string | null;
  scope: string | null; resource: string | null;
};

async function consume(kind: 'code' | 'refresh', token: string): Promise<GrantRow | null> {
  const { data } = await getSupabaseServerClient().from('oauth_grants')
    .update({ used_at: new Date().toISOString() })
    .eq('kind', kind)
    .eq('token_hash', hash(token))
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id, client_id, redirect_uri, code_challenge, scope, resource')
    .maybeSingle();
  return data;
}

async function issuePair(row: GrantRow) {
  const access = `tto_${randomBytes(32).toString('base64url')}`;
  const refresh = `ttr_${randomBytes(32).toString('base64url')}`;
  const now = Date.now();
  await insertGrant({
    kind: 'access', token_hash: hash(access), client_id: row.client_id, user_id: row.user_id,
    scope: row.scope || SCOPE, resource: row.resource, expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
  });
  await insertGrant({
    kind: 'refresh', token_hash: hash(refresh), client_id: row.client_id, user_id: row.user_id,
    scope: row.scope || SCOPE, resource: row.resource, expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
  });
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_MS / 1000,
    refresh_token: refresh,
    scope: row.scope || SCOPE,
  };
}

function formValue(body: URLSearchParams, key: string) {
  return body.get(key) || '';
}

/** Exchange an authorization code or a refresh token. The raw tokens are returned once. */
export async function exchangeToken(body: URLSearchParams): Promise<Record<string, unknown> | { error: string }> {
  const grant = formValue(body, 'grant_type');
  const clientId = formValue(body, 'client_id');
  if (grant === 'authorization_code') {
    const row = await consume('code', formValue(body, 'code'));
    if (!row || row.client_id !== clientId || row.redirect_uri !== formValue(body, 'redirect_uri')) return { error: 'invalid_grant' };
    if (!row.code_challenge || !pkceMatches(row.code_challenge, formValue(body, 'code_verifier'))) return { error: 'invalid_grant' };
    return issuePair(row);
  }
  if (grant === 'refresh_token') {
    const row = await consume('refresh', formValue(body, 'refresh_token'));
    if (!row || (clientId && row.client_id !== clientId)) return { error: 'invalid_grant' };
    return issuePair(row);
  }
  return { error: 'unsupported_grant_type' };
}

/** The account id behind a ChatGPT access token, or null when it is missing, expired or already revoked. */
export async function oauthUserId(token: string): Promise<string | null> {
  if (!token.startsWith('tto_')) return null;
  const { data } = await getSupabaseServerClient().from('oauth_grants')
    .select('user_id, expires_at')
    .eq('kind', 'access')
    .eq('token_hash', hash(token))
    .is('revoked_at', null)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data.user_id;
}
