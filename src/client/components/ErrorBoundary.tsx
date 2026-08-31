import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Changing this value resets the boundary - used to recover on route change. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions.
 *
 * Without this, a single throw anywhere in the tree white-screens the whole Electron window with
 * no reload affordance and nothing on screen to explain it.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-red-500/40 bg-[#161f30] p-6 text-center"
        >
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" aria-hidden="true" />
          <h2 className="mb-2 text-lg font-bold text-white">This view crashed</h2>
          <p className="mb-4 break-words font-mono text-xs text-slate-300">{this.state.error.message}</p>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-[#1e293b]"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
