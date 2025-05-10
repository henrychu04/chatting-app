import { useState, useCallback } from 'react';

export function useErrorBoundary() {
  const [error, setError] = useState<Error | null>(null);

  const handleError = useCallback((error: Error) => {
    setError(error);
    // Log error to your error reporting service
    console.error('Error caught by boundary:', error);
  }, []);

  return {
    error,
    handleError,
    resetError: () => setError(null),
  };
}
