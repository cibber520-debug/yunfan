import { createApiServices } from './api';
import { createMockServices } from './mock';
import type { DataServices } from './types';

export type DataSource = 'mock' | 'api';

export function selectedDataSource(value: string | undefined = import.meta.env.VITE_DATA_SOURCE): DataSource {
  return value === 'api' ? 'api' : 'mock';
}

export function createServices(source: DataSource = selectedDataSource()): DataServices {
  return source === 'api' ? createApiServices() : createMockServices();
}
