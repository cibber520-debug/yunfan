import { describe, expect, it } from 'vitest';
import { createServices, selectedDataSource } from './factory';

describe('数据源工厂', () => {
  it('仅 api 显式选择 API，其他值安全回退 Mock', () => {
    expect(selectedDataSource('api')).toBe('api');
    expect(selectedDataSource('mock')).toBe('mock');
    expect(selectedDataSource(undefined)).toBe('mock');
    expect(selectedDataSource('unexpected')).toBe('mock');
  });

  it('两种数据源均返回完整服务集合', () => {
    for (const source of ['mock', 'api'] as const) {
      const services = createServices(source);
      expect(services).toEqual(expect.objectContaining({
        referenceDataService: expect.any(Object),
        rankService: expect.any(Object),
        recommendationService: expect.any(Object),
      }));
    }
  });
});
