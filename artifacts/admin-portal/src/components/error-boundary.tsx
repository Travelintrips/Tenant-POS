import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold text-destructive">Terjadi Kesalahan</h1>
            <p className="text-muted-foreground">
              Halaman ini mengalami error yang tidak terduga. Silakan muat ulang aplikasi.
            </p>
            <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded">
              {this.state.error?.message}
            </p>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
              onClick={() => window.location.reload()}
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
