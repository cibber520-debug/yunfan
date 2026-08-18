import { createServices, selectedDataSource } from './factory';

const services = createServices();

export const dataSource = selectedDataSource();
export const { referenceDataService, rankService, recommendationService } = services;
export { createApiServices } from './api';
export { createMockServices } from './mock';
export { createServices, selectedDataSource } from './factory';
export type { DataServices } from './types';
