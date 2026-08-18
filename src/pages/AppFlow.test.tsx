import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { createReadyDraft } from '../test/mockDraft';
import { saveState } from '../state/store';
import { AppProvider } from '../state/AppContext';

function renderApp(path = '/'): void {
  render(<MemoryRouter initialEntries={[path]}><AppProvider><App /></AppProvider></MemoryRouter>);
}

describe('关键主流程', () => {
  it('从首页进入向导，基于已保存的动态草稿进入成绩步骤', async () => {
    const user = userEvent.setup();
    saveState({
      wizardDraft: createReadyDraft(),
      completedStep: 1,
      selectedVolunteerIds: [],
      recommendationResult: null,
      schemaVersion: 1,
    });
    renderApp();
    await user.click(screen.getByRole('link', { name: /继续智能填报/ }));
    expect(await screen.findByRole('heading', { name: '考了多少分？' })).toBeInTheDocument();
    expect(await screen.findByText(/省位次 15,230/)).toBeInTheDocument();
  });

  it('非法选科提交后将焦点移到选科组首个控件', async () => {
    const user = userEvent.setup();
    saveState({
      wizardDraft: createReadyDraft(),
      completedStep: 2,
      selectedVolunteerIds: [],
      recommendationResult: null,
      schemaVersion: 1,
    });
    renderApp('/wizard/3');
    const chemistry: HTMLInputElement = await screen.findByRole('checkbox', { name: '化学' });
    await user.click(chemistry);
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    await waitFor(() => expect(screen.getByRole('radio', { name: '物理' })).toHaveFocus());
    expect(chemistry.closest('fieldset')).toHaveAttribute('aria-describedby', 'subjects-feedback');
  });

  it('无结果直达结果页有明确恢复路径', () => {
    renderApp('/results');
    expect(screen.getByRole('heading', { name: '还没有可展示的志愿方案' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '继续填写并生成' })).toHaveAttribute('href', '/wizard/1');
  });
});
