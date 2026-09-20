import { proxyGait } from '@/server/gaitProxy';
export function POST(request: Request) { return proxyGait(request, 'score'); }
