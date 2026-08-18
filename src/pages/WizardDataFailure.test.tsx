import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  getReferenceData: vi.fn(),
}));

vi.mock('../services', () => ({
  referenceDataService: { getReferenceData: serviceMocks.getReferenceData },
  rankService: { reverseLookup: vi.fn() },
  recommendationService: { generate: vi.fn() },
}));

import { App } from '../app/App';
import { AppProvider } from '../state/AppContext';

function renderWizard(): void {
  render(
    <MemoryRouter initialEntries={['/wizard/1']}>
      <AppProvider><App /></AppProvider>
    </MemoryRouter>,
  );
}

describe('向导引用数据失败态', () => {
  beforeEach(() => {
    serviceMocks.getReferenceData.mockReset();
  });

  it('API 引用数据不可用时显式报错、禁止继续并可重试', async () => {
    const user = userEvent.setup();
    serviceMocks.getReferenceData.mockRejectedValue({
      code: 'TEMPORARY_FAILURE',
      message: '服务暂时不可用，请稍后重试',
    });

    renderWizard();

    expect(await screen.findByRole('alert')).toHaveTextContent('服务暂时不可用，请稍后重试');
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '重试加载' }));
    await waitFor(() => expect(serviceMocks.getReferenceData).toHaveBeenCalledTimes(2));
  });
});
