import { describe, expect, it } from 'vitest';
import { appReducer, clearState, initialState, loadState, saveState, STORAGE_KEY } from './store';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length(): number { return values.size; },
    clear: (): void => values.clear(),
    getItem: (key: string): string | null => values.get(key) ?? null,
    key: (index: number): string | null => [...values.keys()][index] ?? null,
    removeItem: (key: string): void => { values.delete(key); },
    setItem: (key: string, value: string): void => { values.set(key, value); },
  };
}

describe('reducer 与持久化', () => {
  it('加入操作幂等切换且完成步骤只前进', () => {
    const one = appReducer(initialState, { type: 'TOGGLE_VOLUNTEER', payload: 'a' });
    expect(one.selectedVolunteerIds).toEqual(['a']);
    const two = appReducer(one, { type: 'TOGGLE_VOLUNTEER', payload: 'a' });
    expect(two.selectedVolunteerIds).toEqual([]);
    const progressed = appReducer(appReducer(initialState, { type: 'COMPLETE_STEP', payload: 4 }), { type: 'COMPLETE_STEP', payload: 2 });
    expect(progressed.completedStep).toBe(4);
  });

  it('只持久化草稿、完成步骤和已选 ID', () => {
    const storage = memoryStorage();
    const state = { ...initialState, completedStep: 3, selectedVolunteerIds: ['gd-a'], recommendationResult: null };
    saveState(state, storage);
    const raw = storage.getItem(STORAGE_KEY) ?? '';
    expect(raw).not.toContain('recommendationResult');
    expect(loadState(storage).completedStep).toBe(3);
    expect(loadState(storage).selectedVolunteerIds).toEqual(['gd-a']);
  });

  it('损坏或版本不符的数据安全回退', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{bad json');
    expect(loadState(storage)).toEqual(initialState);
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 2 }));
    expect(loadState(storage)).toEqual(initialState);
  });

  it('可清除本地草稿', () => {
    const storage = memoryStorage();
    saveState({ ...initialState, completedStep: 2 }, storage);
    clearState(storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});
