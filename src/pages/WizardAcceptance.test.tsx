import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { uiConfig } from '../config';
import { App } from '../app/App';
import { readyProvince, createReadyDraft } from '../test/mockDraft';
import { saveState } from '../state/store';
import { AppProvider } from '../state/AppContext';

function renderApp(path = '/wizard/1'): void {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppProvider><App /></AppProvider>
    </MemoryRouter>,
  );
}

function seedDraft(completedStep = 0): void {
  saveState({
    wizardDraft: createReadyDraft(),
    completedStep,
    selectedVolunteerIds: [],
    recommendationResult: null,
    schemaVersion: 1,
  });
}

async function finishWizard(user: UserEvent): Promise<void> {
  seedDraft();
  renderApp();
  await screen.findByRole('heading', { name: '你在哪个省高考？' });
  await user.click(screen.getByRole('button', { name: /下一步/ }));
  const score = await screen.findByRole('spinbutton', { name: new RegExp(`总分（满分 ${readyProvince.maxScore}`) });
  expect(score).toHaveValue(612);
  expect(await screen.findByText(/省位次 15,230/)).toBeInTheDocument();
  for (const heading of ['你的选科是？', '有专项 / 加分身份吗？', '想去哪类学校 / 专业？', '你更看重什么？']) {
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  }
  await user.click(screen.getByRole('button', { name: '生成志愿方案' }));
  expect(await screen.findByRole('heading', { name: '你的志愿方案已生成' })).toBeInTheDocument();
}

describe('配置与引用数据驱动的向导验收', () => {
  it('可走完配置的所有步骤，并输出配置梯度和免责', async () => {
    const user = userEvent.setup();
    await finishWizard(user);

    for (const tier of uiConfig.recommendation.tiers) {
      expect(screen.getByRole('tab', { name: new RegExp(tier.name) })).toBeInTheDocument();
    }
    const firstTier = uiConfig.recommendation.tiers[0];
    const secondTier = uiConfig.recommendation.tiers[1];
    const firstTab = screen.getByRole('tab', { name: new RegExp(firstTier.name) });
    firstTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: new RegExp(secondTier.name) })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('预测数据')).toBeInTheDocument();
    expect(screen.getByText(/最终以省考试院投档结果为准/)).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent(readyProvince.name);
    expect(screen.getByRole('banner')).toHaveTextContent('3+1+2（新高考）');
  });

  it('引用数据中的地区与专业作为可选项写入偏好', async () => {
    const user = userEvent.setup();
    seedDraft(4);
    renderApp('/wizard/5');
    const majorGroup = await screen.findByRole('group', { name: '具体专业偏好' });
    const regionGroup = screen.getByRole('group', { name: '期望地区 / 经济圈' });
    const major = within(majorGroup).getByRole('checkbox', { name: '计算机科学与技术' });
    const region = within(regionGroup).getByRole('checkbox', { name: '大湾区' });
    await user.click(major);
    await user.click(region);
    expect(major).toBeChecked();
    expect(region).toBeChecked();
  });

  it('非法选科阻止前进并把焦点移到首个错误控件', async () => {
    const user = userEvent.setup();
    seedDraft(2);
    renderApp('/wizard/3');
    const chemistry = await screen.findByRole('checkbox', { name: '化学' });
    await user.click(chemistry);
    await user.click(screen.getByRole('button', { name: /下一步/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('3+1+2');
    expect(screen.getByRole('radio', { name: '物理' })).toHaveFocus();
  });

  it('每个权重滑块每次更新后均为整数且总和为静态配置值', async () => {
    const user = userEvent.setup();
    seedDraft(5);
    renderApp('/wizard/6');
    await screen.findByRole('slider', { name: '保专业权重' });
    const sliders = [
      screen.getByRole('slider', { name: '保专业权重' }),
      screen.getByRole('slider', { name: '保学校权重' }),
      screen.getByRole('slider', { name: '冲城市权重' }),
    ];
    for (const slider of sliders) {
      for (const value of [0, 50, 100]) {
        await user.click(slider);
        fireEvent.change(slider, { target: { value: String(value) } });
        const weights = sliders.map((item) => Number((item as HTMLInputElement).value));
        expect(weights.every(Number.isInteger)).toBe(true);
        expect(weights.reduce((sum, item) => sum + item, 0)).toBe(100);
      }
    }
  });

  it('未就绪省份由引用数据明确拦截，不生成伪造推荐', async () => {
    const user = userEvent.setup();
    renderApp();
    const option = await screen.findAllByRole('option');
    const waiting = option.find((item) => item.textContent?.includes('数据建设中')) as HTMLOptionElement | undefined;
    expect(waiting).toBeDefined();
    await user.selectOptions(screen.getByRole('combobox', { name: /^生源省份/ }), waiting!.value);
    await user.click(screen.getByRole('button', { name: /下一步/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('数据建设中');
    expect(screen.getByRole('heading', { name: '你在哪个省高考？' })).toBeInTheDocument();
  });
});
