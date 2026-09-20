import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/error/ErrorBoundary';
import { ConfirmProvider } from '@/hooks/useConfirm';
import i18n from '@/i18n';
import { queryClient } from '@/lib/queryClient';
import { MaintenancePage } from '@/pages/system/MaintenancePage';

/** Single composition point for every app-wide provider (design.md infra §1). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary fallback={(_err, reset) => <MaintenancePage onRetry={reset} />}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            <ConfirmProvider>
              {children}
              <Toaster />
            </ConfirmProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </I18nextProvider>
  );
}
