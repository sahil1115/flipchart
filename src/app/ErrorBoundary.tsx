import { Component } from 'react';
import type { ReactNode } from 'react';
import { GlassPanel } from '../components/GlassPanel';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="app-shell">
          <GlassPanel className="state-panel" role="alert">
            <h1>Something unexpected happened</h1>
            <p>
              The workspace could not be displayed. Reload to start a new
              session.
            </p>
            <button
              className="primary"
              onClick={() => window.location.reload()}
            >
              Reload FlipChart
            </button>
          </GlassPanel>
        </main>
      );
    return this.props.children;
  }
}
