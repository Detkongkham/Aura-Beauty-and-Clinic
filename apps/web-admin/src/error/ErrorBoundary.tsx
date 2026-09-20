import { Component, type ErrorInfo, type ReactNode } from 'react';

import { analytics } from '@/lib/analytics';

interface Props {
  fallback: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** App-level error boundary (design.md infra §17). Route errors use RouteError instead. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    analytics.track('ui_error_boundary', { message: error.message, stack: info.componentStack });
    console.error('ErrorBoundary caught', error, info);
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
