import { describe, expect, it } from 'vitest';
import { buildUrl, cssSize, mergeOptions, readDataset } from '../src/options';

describe('cssSize', () => {
  it('turns numbers into pixels and keeps strings', () => {
    expect(cssSize(300)).toBe('300px');
    expect(cssSize('50%')).toBe('50%');
    expect(cssSize(undefined, '10px')).toBe('10px');
    expect(cssSize('', '10px')).toBe('10px');
  });
});

describe('buildUrl', () => {
  it('resolves a path and sets params', () => {
    const url = buildUrl('https://example.com', '/embed/a', { theme: 'dark', t: 12, loop: true });
    expect(url.toString()).toBe('https://example.com/embed/a?theme=dark&t=12&loop=true');
  });
  it('rejects paths that leave the base origin', () => {
    expect(() => buildUrl('https://example.com', 'https://evil.test/x')).toThrow(/origin/);
    expect(() => buildUrl('https://example.com', '//evil.test/x')).toThrow(/origin/);
  });
  it('rejects non-http base urls', () => {
    expect(() => buildUrl('javascript:alert(1)', '/x')).toThrow();
    expect(() => buildUrl('data:text/html,hi', '/x')).toThrow(/http/);
  });
});

describe('mergeOptions', () => {
  it('applies defaults, then per-player overrides', () => {
    const r = mergeOptions({ baseUrl: 'https://a.test', height: 200, params: { theme: 'dark' } }, { path: '/p', params: { t: 1 }, height: 80 });
    expect(r.baseUrl).toBe('https://a.test');
    expect(r.height).toBe('80px');
    expect(r.params).toEqual({ theme: 'dark', t: 1 });
    expect(r.width).toBe('100%');
    expect(r.timeout).toBe(5000);
    expect(r.lazy).toBe(true);
  });
  it('requires baseUrl and path', () => {
    expect(() => mergeOptions({}, { path: '/p' })).toThrow(/baseUrl/);
    expect(() => mergeOptions({ baseUrl: 'https://a.test' }, { path: '' })).toThrow(/path/);
  });
  it('lets false override a true default', () => {
    const r = mergeOptions({ baseUrl: 'https://a.test', lazy: true }, { path: '/p', lazy: false });
    expect(r.lazy).toBe(false);
  });
});

describe('readDataset', () => {
  it('returns null without data-playfold', () => {
    expect(readDataset({ dataset: {} })).toBeNull();
  });
  it('reads attributes and data-param-*', () => {
    const o = readDataset({ dataset: { playfold: '/embed/x', baseUrl: 'https://a.test', height: '200', paramTheme: 'dark', paramStartAt: '30' } });
    expect(o).toEqual({ path: '/embed/x', baseUrl: 'https://a.test', height: '200', params: { theme: 'dark', startAt: '30' } });
  });
});
