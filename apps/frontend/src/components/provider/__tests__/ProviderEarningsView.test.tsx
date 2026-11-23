import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderEarningsView } from '../ProviderEarningsView';
import { AuthProvider } from '../../../context/AuthContext';
import * as payoutService from '../../../services/providerPayoutService';

vi.mock('../../../services/providerPayoutService');

const mockSummary = {
  availableBalanceRupees: 3400,
  totalGrossEarningsRupees: 4000,
  totalCommissionDeductedRupees: 600,
  totalNetEarningsRupees: 3400,
  settledAmountRupees: 1700,
  payoutAccount: {
    isConfigured: true,
    accountType: 'bank_account' as const,
    accountHolderName: 'Vikram Joshi',
    bankName: 'HDFC Bank',
    maskedAccountNumber: '••••4567',
    ifscCode: 'HDFC0001234',
  },
};

const mockLedger = {
  entries: [
    {
      id: 'led-1',
      entryType: 'job_earning_credit' as const,
      creditAmountRupees: 850,
      debitAmountRupees: 0,
      netAmountRupees: 850,
      resultingBalanceRupees: 3400,
      status: 'available' as const,
      description: 'Completed electrical inspection',
      createdAt: '2026-11-21T10:00:00.000Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 15,
    total: 1,
    totalPages: 1,
  },
};

describe('ProviderEarningsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(payoutService.fetchProviderEarningsSummary).mockResolvedValue(mockSummary);
    vi.mocked(payoutService.fetchProviderLedger).mockResolvedValue(mockLedger);
  });

  it('renders earnings metrics and ledger transactions', async () => {
    render(
      <AuthProvider>
        <ProviderEarningsView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Earnings & Payouts')).toBeInTheDocument();
      expect(screen.getAllByText('₹3,400').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('₹4,000')).toBeInTheDocument(); // Gross
      expect(screen.getByText('₹600')).toBeInTheDocument(); // Commission
    });

    expect(screen.getByText('Beneficiary: Vikram Joshi • IFSC: HDFC0001234')).toBeInTheDocument();
    expect(screen.getByText('Completed electrical inspection')).toBeInTheDocument();
    expect(screen.getAllByText('+₹850').length).toBe(2);
  });

  it('opens payout account configuration modal and saves details', async () => {
    vi.mocked(payoutService.updateProviderPayoutAccount).mockResolvedValue({
      message: 'Updated',
      payoutAccount: { isConfigured: true },
    });

    render(
      <AuthProvider>
        <ProviderEarningsView />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /configure payout account/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /configure payout account/i }));
    expect(screen.getByText('Payout & Banking Details')).toBeInTheDocument();

    const accInput = screen.getByPlaceholderText(/enter full bank account number/i);
    fireEvent.change(accInput, { target: { value: '987654321012' } });

    fireEvent.click(screen.getByRole('button', { name: /save payout details/i }));

    await waitFor(() => {
      expect(payoutService.updateProviderPayoutAccount).toHaveBeenCalled();
    });
  });
});
