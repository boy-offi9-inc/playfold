import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, isMessage } from '../src/protocol';

describe('isMessage', () => {
  it('accepts well-formed messages of the current version', () => {
    expect(isMessage({ playfold: PROTOCOL_VERSION, kind: 'event', name: 'ready' })).toBe(true);
    expect(isMessage({ playfold: PROTOCOL_VERSION, kind: 'command', id: '1', name: 'play' })).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage('x')).toBe(false);
    expect(isMessage({})).toBe(false);
    expect(isMessage({ playfold: 999, kind: 'event' })).toBe(false);
    expect(isMessage({ playfold: PROTOCOL_VERSION, kind: 'nope' })).toBe(false);
  });
});
