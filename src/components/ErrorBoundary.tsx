import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '20px',
          margin: '20px',
          border: '1px solid #f44336',
          borderRadius: '4px',
          backgroundColor: '#ffebee',
          color: '#c62828'
        }}>
          <h2>Something went wrong</h2>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>
            <summary>Error Details</summary>
            {this.state.error?.toString()}
          </details>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              cursor: 'pointer',
              backgroundColor: '#c62828',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface AsyncBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
}

interface AsyncBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AsyncErrorBoundary extends Component<AsyncBoundaryProps, AsyncBoundaryState> {
  constructor(props: AsyncBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): AsyncBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('AsyncErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error);
  }

  reset(): void {
    this.setState({ hasError: false, error: null });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '20px',
          margin: '20px',
          border: '1px solid #f44336',
          borderRadius: '4px',
          backgroundColor: '#ffebee',
          color: '#c62828'
        }}>
          <h2>Failed to load content</h2>
          <p>{this.state.error?.message}</p>
          <button
            onClick={() => this.reset()}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              cursor: 'pointer',
              backgroundColor: '#c62828',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
