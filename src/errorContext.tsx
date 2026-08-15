import { Component, createContext, useContext, useState, type ReactNode } from "react";
import ErrorTab from "../components/ErrorTab";

interface ErrorContextValue {
  /** Report an error anywhere — opens the global empty error tab. */
  reportError: (error: unknown) => void;
}

const ErrorContext = createContext<ErrorContextValue>({ reportError: () => {} });

/** Hook for any component to open the error tab: `const { reportError } = useErrorHandler();` */
export function useErrorHandler(): ErrorContextValue {
  return useContext(ErrorContext);
}

/**
 * Global error provider.
 *
 * - `reportError(message)` — call from any `catch` block: opens the empty tab.
 * - `ErrorBoundary` — wraps children, catches render errors and opens the tab too.
 */
export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errorTabOpen, setErrorTabOpen] = useState(false);

  const reportError = (message: unknown) => {
    console.error(message);
    setErrorTabOpen(true);
  };

  return (
    <ErrorContext.Provider value={{ reportError }}>
      <ErrorBoundary reportError={reportError}>
        {children}
      </ErrorBoundary>
      {/* The global empty tab that opens on ANY error in the app */}
      <ErrorTab isOpen={errorTabOpen} onClose={() => setErrorTabOpen(false)} />
    </ErrorContext.Provider>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  reportError: (message: unknown) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches uncaught render/lifecycle errors and funnels them into the
 * global error tab so the user always sees the empty tab on a "big bug".
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: unknown) {
    this.props.reportError(error);
  }

  render() {
    if (this.state.hasError) {
      // Keep rendering a minimal shell so the app doesn't white-screen.
      return null;
    }
    return this.props.children;
  }
}