import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HouseCutaway } from '../HouseCutaway';

describe('HouseCutaway Component', () => {
  it('renders all rooms with accessible labels', () => {
    const onSelectRoom = vi.fn();
    render(<HouseCutaway selectedRoom="living" onSelectRoom={onSelectRoom} />);

    expect(screen.getByRole('button', { name: /roof/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bathroom/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /living room/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kitchen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /garden/i })).toBeInTheDocument();
  });

  it('marks the currently selected room with aria-pressed="true"', () => {
    const onSelectRoom = vi.fn();
    render(<HouseCutaway selectedRoom="bath" onSelectRoom={onSelectRoom} />);

    const bathButton = screen.getByRole('button', { name: /bathroom/i });
    expect(bathButton).toHaveAttribute('aria-pressed', 'true');

    const roofButton = screen.getByRole('button', { name: /roof/i });
    expect(roofButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('triggers onSelectRoom callback on click', () => {
    const onSelectRoom = vi.fn();
    render(<HouseCutaway selectedRoom="living" onSelectRoom={onSelectRoom} />);

    const kitchenButton = screen.getByRole('button', { name: /kitchen/i });
    fireEvent.click(kitchenButton);

    expect(onSelectRoom).toHaveBeenCalledTimes(1);
    expect(onSelectRoom).toHaveBeenCalledWith('kitchen');
  });

  it('triggers onSelectRoom callback on Enter or Space key press', () => {
    const onSelectRoom = vi.fn();
    render(<HouseCutaway selectedRoom="living" onSelectRoom={onSelectRoom} />);

    const roofButton = screen.getByRole('button', { name: /roof/i });
    fireEvent.keyDown(roofButton, { key: 'Enter' });
    expect(onSelectRoom).toHaveBeenCalledWith('roof');

    fireEvent.keyDown(roofButton, { key: ' ' });
    expect(onSelectRoom).toHaveBeenCalledWith('roof');
  });
});
