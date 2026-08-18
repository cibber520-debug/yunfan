import { describe, expect, it } from 'vitest';
import { selectRouterMode } from './RuntimeRouter';

describe('运行时路由选择', () => {
  it('file 协议使用 hash 路由以支持离线页面内导航', () => {
    expect(selectRouterMode('file:')).toBe('hash');
  });

  it.each(['http:', 'https:'])('%s 协议保留 browser 路由深链', (protocol: string) => {
    expect(selectRouterMode(protocol)).toBe('browser');
  });
});
