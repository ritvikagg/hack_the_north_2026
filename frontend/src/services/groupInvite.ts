const INVITE_SCHEME = 'pledgefit:';
const INVITE_HOST = 'groups';
const INVITE_VERSION = '1';
const INVITE_CODE = /^[A-Z0-9]{1,20}$/;

function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase();
}

export function buildGroupInvitePayload(code: string) {
  const normalized = normalizeInviteCode(code);
  if (!INVITE_CODE.test(normalized)) {
    throw new Error('Cannot create a QR code for an invalid group invite code.');
  }

  return `pledgefit://groups?v=${INVITE_VERSION}&invite=${encodeURIComponent(normalized)}`;
}

export function parseGroupInvitePayload(payload: string): string | null {
  try {
    const invite = new URL(payload.trim());
    if (
      invite.protocol !== INVITE_SCHEME
      || invite.hostname !== INVITE_HOST
      || (invite.pathname !== '' && invite.pathname !== '/')
      || invite.searchParams.get('v') !== INVITE_VERSION
    ) {
      return null;
    }

    const code = normalizeInviteCode(invite.searchParams.get('invite') ?? '');
    return INVITE_CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}
