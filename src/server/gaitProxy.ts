const MAX_BYTES = 20 * 1024 * 1024;
const unavailable = 'Gait scoring is offline. Start the Python scoring service on the computer running Expo, then retry.';

/** Server-only bridge: the Python service keeps its localhost-only binding. */
export async function proxyGait(request: Request, endpoint: 'health' | 'score') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    let body: Uint8Array | undefined;
    if (endpoint === 'score') {
      if (!request.headers.get('content-type')?.startsWith('text/csv')) return Response.json({ error: 'Send a text/csv recording.' }, { status: 415 });
      if (Number(request.headers.get('content-length')) > MAX_BYTES) return Response.json({ error: 'Recording exceeds the 20 MB limit.' }, { status: 413 });
      const reader = request.body?.getReader();
      if (!reader) return Response.json({ error: 'Recording is empty.' }, { status: 400 });
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); return Response.json({ error: 'Recording exceeds the 20 MB limit.' }, { status: 413 }); }
        chunks.push(value);
      }
      if (!size) return Response.json({ error: 'Recording is empty.' }, { status: 400 });
      body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    }
    const base = process.env.GAIT_SERVICE_URL || 'http://127.0.0.1:8787';
    const response = await fetch(base.replace(/\/$/, '') + '/' + endpoint, {
      method: endpoint === 'score' ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'text/csv' } : undefined,
      body: body as BodyInit | undefined, signal: controller.signal,
    });
    const payload = await response.json();
    return Response.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: unavailable }, { status: 503 }); }
  finally { clearTimeout(timer); }
}
