/// <reference types="jest" />
import { proxyGait } from './gaitProxy';
afterEach(() => jest.restoreAllMocks());
test('forwards the CSV body to localhost and retains backend validation errors', async () => {
  const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'Too short' }, { status: 400 }));
  const result = await proxyGait(new Request('http://localhost/api/gait/score', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: 't_ns\n0' }), 'score');
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({ error: 'Too short' });
  expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8787/score', expect.objectContaining({ method: 'POST' }));
  const body = fetcher.mock.calls[0][1]?.body as Uint8Array;
  expect(new TextDecoder().decode(body)).toBe('t_ns\n0');
});
test('health reports an unavailable Python process as a recoverable 503', async () => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
  const result = await proxyGait(new Request('http://localhost/api/gait/health'), 'health');
  expect(result.status).toBe(503);
  expect((await result.json()).error).toContain('offline');
});
test('rejects unexpected content types and excessive payload lengths before forwarding', async () => {
  const fetcher = jest.spyOn(globalThis, 'fetch');
  expect((await proxyGait(new Request('http://localhost/api/gait/score', { method: 'POST', body: '{}' }), 'score')).status).toBe(415);
  expect((await proxyGait(new Request('http://localhost/api/gait/score', { method: 'POST', headers: { 'Content-Type': 'text/csv', 'Content-Length': '30000000' }, body: 'x' }), 'score')).status).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
});
