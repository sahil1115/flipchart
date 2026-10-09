import type { Dataset } from '../data/types';
export async function loadDemo(): Promise<Dataset> {
  const { createDemoDataset } = await import('./dataset');
  return createDemoDataset(new Date().toISOString());
}
