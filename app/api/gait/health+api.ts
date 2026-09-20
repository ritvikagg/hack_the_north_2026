import { proxyGait } from '@/server/gaitProxy';
export function GET(request: Request) { return proxyGait(request, 'health'); }
