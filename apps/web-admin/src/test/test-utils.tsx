import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmProvider } from '@/hooks/useConfirm';
import i18n from '@/i18n';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  withRouter?: boolean;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', withRouter = true, ...rest }: Options = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    const tree = (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </I18nextProvider>
    );
    return withRouter ? <MemoryRouter initialEntries={[route]}>{tree}</MemoryRouter> : tree;
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...rest }) };
}
