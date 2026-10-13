import { describe, expect, it } from 'vitest';
import { formatTime, playerCss, readParams } from '../src/ui';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9.9)).toBe('0:09');
    expect(formatTime(75)).toBe('1:15');
  });
  it('formats hours', () => {
    expect(formatTime(3725)).toBe('1:02:05');
  });
  it('treats invalid input as zero', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});

describe('readParams', () => {
  it('reads text options', () => {
    const p = readParams('?src=https%3A%2F%2Fa.test%2Fx.mp3&title=Song&subtitle=Artist&eyebrow=Label&poster=%2Fc.jpg&accent=%23f97316');
    expect(p.src).toBe('https://a.test/x.mp3');
    expect(p.title).toBe('Song');
    expect(p.subtitle).toBe('Artist');
    expect(p.eyebrow).toBe('Label');
    expect(p.poster).toBe('/c.jpg');
    expect(p.accent).toBe('#f97316');
  });
  it('accepts only known type and theme values', () => {
    expect(readParams('?type=video&theme=light').type).toBe('video');
    expect(readParams('?type=video&theme=light').theme).toBe('light');
    expect(readParams('?type=evil&theme=neon').type).toBeUndefined();
    expect(readParams('?type=evil&theme=neon').theme).toBeUndefined();
  });
  it('reads boolean flags', () => {
    expect(readParams('?autoplay=1&loop=true').autoplay).toBe(true);
    expect(readParams('?autoplay=1&loop=true').loop).toBe(true);
    expect(readParams('?autoplay=0').autoplay).toBeUndefined();
  });
  it('ignores unknown keys and empty values', () => {
    expect(readParams('?src=&foo=bar')).toEqual({});
  });
});

describe('playerCss', () => {
  it('exposes the theming variables', () => {
    expect(playerCss).toContain('--pf-accent');
    expect(playerCss).toContain('.pf-root');
  });
});
