import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderScheduleView } from '../ProviderScheduleView';
import { AuthProvider } from '../../../context/AuthContext';
import * as providerService from '../../../services/providerService';

vi.mock('../../../services/providerService', () => ({
  fetchProviderSchedule: vi.fn(),
  updateProviderSchedule: vi.fn(),
  updateProviderAvailabilityStatus: vi.fn(),
}));

const mockScheduleData = {
  isAcceptingJobs: true,
  workingSchedule: [
    { dayOfWeek: 1, activeSlotIndices: [0, 1, 2, 3] }, // Mon
    { dayOfWeek: 2, activeSlotIndices: [0, 1] },       // Tue
    { dayOfWeek: 3, activeSlotIndices: [0, 1, 2, 3] }, // Wed
    { dayOfWeek: 4, activeSlotIndices: [0, 1, 2, 3] }, // Thu
    { dayOfWeek: 5, activeSlotIndices: [0, 1, 2, 3] }, // Fri
    { dayOfWeek: 6, activeSlotIndices: [] },             // Sat off
    { dayOfWeek: 0, activeSlotIndices: [] },             // Sun off
  ],
  blockedDates: [{ date: '2026-12-25', reason: 'Holiday' }],
};

describe('ProviderScheduleView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(
      'dwellio_user',
      JSON.stringify({
        id: 'user-prov-1',
        name: 'Karthik Raja',
        email: 'karthik.roofing@example.com',
        role: 'provider',
        isActive: true,
      })
    );
    localStorage.setItem('dwellio_token', 'valid-provider-jwt');
    vi.mocked(providerService.fetchProviderSchedule).mockResolvedValue(mockScheduleData);
  });

  it('renders schedule matrix with days, slots, and intake toggle', async () => {
    render(
      <AuthProvider>
        <ProviderScheduleView />
      </AuthProvider>
    );

    expect(await screen.findByText(/weekly operating hours/i)).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Tuesday')).toBeInTheDocument();
    expect(screen.getByText('Sunday')).toBeInTheDocument();
    expect(screen.getByText('Accepting New Jobs')).toBeInTheDocument();
    expect(screen.getByText('📅 2026-12-25')).toBeInTheDocument();
    expect(screen.getByText('Holiday')).toBeInTheDocument();
  });

  it('toggles isAcceptingJobs status on switch click', async () => {
    vi.mocked(providerService.updateProviderAvailabilityStatus).mockResolvedValue({
      isAcceptingJobs: false,
    });

    render(
      <AuthProvider>
        <ProviderScheduleView />
      </AuthProvider>
    );

    const toggleBtn = await screen.findByTestId('toggle-accepting-jobs');
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(providerService.updateProviderAvailabilityStatus).toHaveBeenCalledWith(
        false,
        'valid-provider-jwt'
      );
      expect(screen.getByText('Job Intake Paused')).toBeInTheDocument();
    });
  });

  it('adds and removes blocked dates correctly', async () => {
    render(
      <AuthProvider>
        <ProviderScheduleView />
      </AuthProvider>
    );

    await screen.findByText('📅 2026-12-25');

    // Add new blocked date
    const dateInput = screen.getByLabelText(/select date/i);
    const reasonInput = screen.getByLabelText(/reason \(optional\)/i);
    const addBtn = screen.getByRole('button', { name: /\+ block date/i });

    fireEvent.change(dateInput, { target: { value: '2026-12-31' } });
    fireEvent.change(reasonInput, { target: { value: 'New Year Eve' } });
    fireEvent.click(addBtn);

    expect(await screen.findByText('📅 2026-12-31')).toBeInTheDocument();
    expect(screen.getByText('New Year Eve')).toBeInTheDocument();

    // Remove blocked date
    const removeBtn = screen.getByLabelText('Unblock date 2026-12-25');
    fireEvent.click(removeBtn);

    expect(screen.queryByText('📅 2026-12-25')).not.toBeInTheDocument();
  });

  it('saves updated weekly schedule to the backend', async () => {
    vi.mocked(providerService.updateProviderSchedule).mockResolvedValue(mockScheduleData);

    render(
      <AuthProvider>
        <ProviderScheduleView />
      </AuthProvider>
    );

    await screen.findByText(/weekly operating hours/i);

    const saveBtns = screen.getAllByRole('button', { name: /save weekly schedule/i });
    fireEvent.click(saveBtns[0]);

    await waitFor(() => {
      expect(providerService.updateProviderSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          workingSchedule: expect.any(Array),
          blockedDates: expect.any(Array),
        }),
        'valid-provider-jwt'
      );
      expect(screen.getByText(/working schedule and time-off saved successfully/i)).toBeInTheDocument();
    });
  });
});
