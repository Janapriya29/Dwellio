import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

// Faulty component that throws an error during render
const ProblemChild = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Simulated component rendering crash');
  }
  return <div>Healthy Child Content</div>;
};

describe('Milestone 6B: React ErrorBoundary Component', () => {
  const originalError = console.error;

  beforeEach(() => {
    // Suppress console.error in test output for intentional render errors
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('renders healthy children when no rendering error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Healthy Child Content')).toBeInTheDocument();
  });

  it('catches rendering errors and displays the friendly recovery screen', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred while rendering this page/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Dwellio — Your Home, in Good Hands/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload Page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Return to Home/i })).toBeInTheDocument();
  });

  it('triggers the onError reporting callback with error and info', () => {
    const onErrorMock = vi.fn();

    render(
      <ErrorBoundary onError={onErrorMock}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock.mock.calls[0][0].message).toBe('Simulated component rendering crash');
    expect(onErrorMock.mock.calls[0][1]).toHaveProperty('componentStack');
  });

  it('supports custom fallback UI if supplied', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Failure Screen</div>}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Failure Screen')).toBeInTheDocument();
  });

  it('resets error state when Return to Home button is clicked', () => {
    const onResetMock = vi.fn();

    render(
      <ErrorBoundary onReset={onResetMock}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const homeButton = screen.getByRole('button', { name: /Return to Home/i });
    fireEvent.click(homeButton);

    expect(onResetMock).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/');
  });
});
