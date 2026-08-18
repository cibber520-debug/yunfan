import { describe, expect, it } from 'vitest';
import { appReducer, initialState, loadState, saveState, STORAGE_KEY } from '../state/store';

const sourceFiles = import.meta.glob('../{app,pages,styles,services}/**/*.{ts,tsx,css}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function source(path: string): string {
  const key = `../${path.replace(/^src\//, '')}`;
  const value = sourceFiles[key];
  if (value === undefined) throw new Error(`未加载源码：${key}`);
  return value;
}

describe('架构约束与样式机制', () => {
  it('页面不直接读取 Mock 或 fixture，数据仅经 services 适配器进入', () => {
    const pageSources = [
      'src/pages/HomePage.tsx',
      'src/pages/WizardPage.tsx',
      'src/pages/ResultsPage.tsx',
      'src/pages/VolunteerListPage.tsx',
      'src/pages/ProfilePage.tsx',
    ].map(source).join('\n');
    expect(pageSources).not.toMatch(/data\/(fixtures|mock)|from ['"].*(fixtures|mock)/);
    expect(source('src/services/index.ts')).toMatch(/from ['"]\.\/factory['"]/);
    expect(source('src/services/index.ts')).not.toMatch(/data\/fixtures|data\/mock/);
    expect(source('src/services/mock/index.ts')).toMatch(/data\/mock/);
    expect(source('src/services/api/index.ts')).toMatch(/isReferenceDataResponse/);
  });

  it('CSS 覆盖 320/440/768/1280 所需的 mobile-first 机制', () => {
    const shell = source('src/app/AppShell.module.css');
    const global = source('src/styles/global.css');
    const results = source('src/pages/ResultsPage.module.css');
    const wizard = source('src/pages/WizardPage.module.css');

    expect(global).toContain('min-width: 320px');
    expect(shell).toContain('width: 100%');
    expect(shell).toContain('max-width: 560px');
    expect(shell).toMatch(/@media \(max-width: 359px\)/);
    expect(shell).toMatch(/@media \(min-width: 768px\)/);
    expect(results).toContain('max-width: 760px');
    expect(results).toMatch(/grid-template-columns: repeat\(2/);
    expect(results).toMatch(/grid-template-columns: repeat\(auto-fit,minmax\(72px,1fr\)\)/);
    expect(wizard).toContain('env(safe-area-inset-bottom)');
  });

  it('全局样式有可见焦点、44px 触控目标与 reduced-motion', () => {
    const global = source('src/styles/global.css');
    expect(global).toMatch(/:focus-visible\s*\{/);
    expect(global).toContain('min-height: 44px');
    expect(global).toContain('@media (prefers-reduced-motion: reduce)');
    expect(global).toContain('animation-duration: 0.01ms !important');
    expect(global).toContain('transition-duration: 0.01ms !important');
  });

  it('志愿表小屏保留触控目标和长文本收缩保护', () => {
    const volunteers = source('src/pages/VolunteerListPage.module.css');
    expect(volunteers).toMatch(/\.item button\s*\{[^}]*flex:\s*0 0 44px;[^}]*width:\s*44px;[^}]*min-height:\s*44px;/);
    expect(volunteers).toMatch(/\.summary > div\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/);
    expect(volunteers).toMatch(/\.summary button\s*\{[^}]*flex:\s*0 0 auto;/);
    expect(volunteers).toMatch(/\.item h3,\s*\.restore h2,\s*\.restore p,\s*\.restore > div\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/);
    expect(volunteers).toMatch(/\.restore p\s*\{[^}]*width:\s*min\(100%,\s*360px\);/);
  });

  it('持久化严格白名单，不保存推荐、Toast 或错误', () => {
    const storage = window.localStorage;
    const state = {
      ...initialState,
      completedStep: 6,
      selectedVolunteerIds: ['safe-id'],
      recommendationResult: {
        profile: { province: 'TEST', provinceName: '测试省', examType: 'NEW_312' as const, examTypeLabel: '3+1+2（新高考）', totalScore: 600, provinceRank: 10000, subjects: ['PHY' as const, 'CHE' as const, 'BIO' as const] },
        items: [], strictItems: [], degradation: null, generatedAt: 'x', disclaimer: 'secret-result',
      },
    };
    saveState(state, storage);
    const raw = storage.getItem(STORAGE_KEY) ?? '';
    expect(raw).not.toContain('recommendationResult');
    expect(raw).not.toContain('secret-result');
    expect(Object.keys(JSON.parse(raw) as object).sort()).toEqual([
      'completedStep', 'schemaVersion', 'selectedVolunteerIds', 'wizardDraft',
    ]);
    expect(loadState(storage).recommendationResult).toBeNull();
  });

  it('志愿 reducer 支持加入、移除与清空且无重复 ID', () => {
    const once = appReducer(initialState, { type: 'TOGGLE_VOLUNTEER', payload: 'a' });
    const twice = appReducer(once, { type: 'TOGGLE_VOLUNTEER', payload: 'a' });
    const selected = appReducer(twice, { type: 'TOGGLE_VOLUNTEER', payload: 'a' });
    expect(selected.selectedVolunteerIds).toEqual(['a']);
    expect(appReducer(selected, { type: 'REMOVE_VOLUNTEER', payload: 'a' }).selectedVolunteerIds).toEqual([]);
    expect(appReducer(selected, { type: 'CLEAR_VOLUNTEERS' }).selectedVolunteerIds).toEqual([]);
  });
});
