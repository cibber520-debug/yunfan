import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { AppProvider } from '../state/AppContext';
import { recommendationService } from '../services';
import { createReadyDraft } from '../test/mockDraft';
import { initialState, saveState, STORAGE_KEY } from '../state/store';

function renderApp(path: string): void {
  render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <AppProvider><App /></AppProvider>
    </MemoryRouter>,
  );
}

async function seedRecommendation(selectedIds: string[] = []): Promise<void> {
  const draft = createReadyDraft();
  const result = await recommendationService.generate(draft);
  saveState({
    ...initialState,
    wizardDraft: draft,
    completedStep: 6,
    selectedVolunteerIds: selectedIds,
    recommendationResult: result,
  });
}

describe('路由、恢复与持久化验收', () => {
  it.each([
    ['/', '乘风破浪，直挂云帆'],
    ['/wizard/1', '你在哪个省高考？'],
    ['/results', '还没有可展示的志愿方案'],
    ['/volunteers', '我的志愿表'],
    ['/profile', '准大学生'],
    ['/does-not-exist', '页面走丢了'],
  ])('%s 路由安全渲染并提供预期标题', async (path, heading) => {
    renderApp(path);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    if (path === '/wizard/1') {
      expect(await screen.findByText(/请选择省份以加载对应规则/)).toBeInTheDocument();
    }
  });

  it('非法向导步骤恢复到第一步', async () => {
    renderApp('/wizard/99');
    expect(await screen.findByRole('heading', { name: '你在哪个省高考？' })).toBeInTheDocument();
  });

  it('规划中能力只显示通知，不进入购买流程', async () => {
    const user = userEvent.setup();
    renderApp('/profile');
    await user.click(screen.getByRole('button', { name: '规划中' }));
    expect(screen.getByRole('status')).toHaveTextContent('正在规划中');
    expect(screen.queryByText(/¥|￥|立即购买|支付/)).not.toBeInTheDocument();
  });

  it('已选志愿可从 localStorage 白名单恢复、删除及清空', async () => {
    const user = userEvent.setup();
    const result = await recommendationService.generate(createReadyDraft());
    const selectedIds = [result.items[0].id, result.items[result.items.length - 1].id];
    await seedRecommendation(selectedIds);
    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(persisted).sort()).toEqual([
      'completedStep',
      'schemaVersion',
      'selectedVolunteerIds',
      'wizardDraft',
    ]);

    renderApp('/volunteers');
    expect(screen.getByRole('heading', { name: /已保存 2 个志愿/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '恢复推荐详情' }));
    expect(await screen.findByText(result.items[0].schoolName)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: new RegExp(`删除 ${result.items[0].schoolName}`) }));
    expect(screen.queryByText(result.items[0].schoolName)).not.toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: '清空全部' });
    await user.click(clearButton);
    expect(screen.getByRole('dialog', { name: '确认清空志愿表？' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(clearButton).toHaveFocus();

    await user.click(clearButton);
    await user.click(screen.getByRole('button', { name: '确认清空' }));
    expect(screen.getByRole('heading', { name: '志愿表还是空的' })).toBeInTheDocument();
    const afterClear = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as { selectedVolunteerIds: string[] };
    expect(afterClear.selectedVolunteerIds).toEqual([]);
  });

  it('Dialog 捕获 Tab 焦点并在取消后归还触发器', async () => {
    const user = userEvent.setup();
    const restored = await recommendationService.generate(createReadyDraft());
    const selectedId = restored.items[0].id;
    await seedRecommendation([selectedId]);
    renderApp('/volunteers');
    await user.click(screen.getByRole('button', { name: '恢复推荐详情' }));
    const trigger = await screen.findByRole('button', { name: '清空全部' });
    await user.click(trigger);
    const cancel = screen.getByRole('button', { name: '取消' });
    const confirm = screen.getByRole('button', { name: '确认清空' });
    expect(cancel).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(confirm).toHaveFocus();
    await user.click(cancel);
    expect(trigger).toHaveFocus();
  });

  it('AppShell 在路由变化后把焦点移到主标题', async () => {
    const user = userEvent.setup();
    renderApp('/');
    expect(screen.getByRole('heading', { name: '乘风破浪，直挂云帆' })).toHaveFocus();
    await user.click(screen.getByRole('link', { name: /开始智能填报/ }));
    expect(await screen.findByRole('heading', { name: '你在哪个省高考？' })).toHaveFocus();
  });

  it('损坏 localStorage 不阻塞应用启动', () => {
    window.localStorage.setItem(STORAGE_KEY, '{invalid-json');
    expect(() => renderApp('/')).not.toThrow();
    expect(screen.getByRole('heading', { name: '乘风破浪，直挂云帆' })).toBeInTheDocument();
  });
});
