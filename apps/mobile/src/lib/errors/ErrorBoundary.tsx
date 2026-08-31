import { Button, ErrorState, Screen } from '@cal/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { logError } from '../logger';

interface Props {
  children: ReactNode;
  /** Shown instead of the default error screen. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a single broken screen does not take the whole
 * app down. Data-fetching failures are handled by TanStack Query instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, { componentStack: info.componentStack ?? undefined });
  }

  private reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <Screen scrollable={false}>
        <ErrorState
          title="This screen ran into a problem"
          message="We have logged what happened. You can try loading it again."
          onRetry={this.reset}
        />
        <Button label="Reload" variant="secondary" onPress={this.reset} />
      </Screen>
    );
  }
}
