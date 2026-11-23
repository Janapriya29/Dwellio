import { Request, Response } from 'express';
import { ProviderProfile } from '../models/ProviderProfile';
import { ProviderLedger } from '../models/ProviderLedger';
import { payoutService } from '../services/payoutService';
import { sendInternalError } from '../utils/security';
import {
  ApiResponse,
  PaginationMeta,
  ProviderEarningsSummaryData,
  ProviderLedgerEntryData,
  UpdateProviderPayoutAccountPayload,
} from '@dwellio/shared';

/**
 * Helper to mask sensitive bank account numbers
 * E.g. "123456789012" -> "••••••••9012"
 */
export const maskAccountNumber = (acc: string): string => {
  const clean = acc.replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  return `••••••••${clean.slice(-4)}`;
};

/**
 * Helper to mask sensitive UPI VPA IDs
 * E.g. "rajesh.kumar@okaxis" -> "r•••••••r@okaxis"
 */
export const maskUpiId = (upi: string): string => {
  const parts = upi.split('@');
  if (parts.length !== 2) return '••••@upi';
  const handle = parts[0];
  const domain = parts[1];
  if (handle.length <= 2) return `•@${domain}`;
  return `${handle[0]}••••${handle.slice(-1)}@${domain}`;
};

/**
 * Provider: Get Aggregated Earnings Summary and Payout Balances
 * GET /api/provider/earnings/summary
 */
export const getProviderEarningsSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const summary = await payoutService.getProviderEarningsSummary(req.providerProfile._id);

    const response: ApiResponse<ProviderEarningsSummaryData> = {
      success: true,
      message: 'Provider earnings summary retrieved successfully.',
      data: summary,
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderPayout.getProviderEarningsSummary', error, 'Failed to fetch earnings summary.');
  }
};

/**
 * Provider: Get Paginated Earnings Ledger History
 * GET /api/provider/earnings/ledger
 */
export const getProviderEarningsLedger = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 15));
    const entryType = req.query.entryType as string | undefined;

    const filter: any = { providerId: req.providerProfile._id };
    if (entryType) {
      filter.entryType = entryType;
    }

    const total = await ProviderLedger.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const entries = await ProviderLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const formattedEntries: ProviderLedgerEntryData[] = entries.map((e) => ({
      id: e._id.toString(),
      providerId: e.providerId.toString(),
      bookingId: e.bookingId?.toString(),
      paymentId: e.paymentId?.toString(),
      entryType: e.entryType,
      creditAmount: e.creditAmount,
      debitAmount: e.debitAmount,
      netAmount: e.netAmount,
      currency: e.currency,
      resultingBalance: e.resultingBalance,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
    }));

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    const response: ApiResponse<{ entries: ProviderLedgerEntryData[]; pagination: PaginationMeta }> = {
      success: true,
      message: 'Provider ledger retrieved successfully.',
      data: {
        entries: formattedEntries,
        pagination,
      },
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderPayout.getProviderEarningsLedger', error, 'Failed to fetch provider ledger.');
  }
};

/**
 * Provider: Get Payout Profile / Account Details
 * GET /api/provider/payout-account
 */
export const getProviderPayoutAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const profile = await ProviderProfile.findById(req.providerProfile._id);
    if (!profile) {
      res.status(404).json({ success: false, message: 'Provider profile not found.' });
      return;
    }

    const data = {
      payoutMethod: profile.payoutMethod || 'none',
      payoutAccount: profile.payoutAccount
        ? {
            beneficiaryName: profile.payoutAccount.beneficiaryName,
            accountNumberMasked: profile.payoutAccount.accountNumberMasked,
            ifsc: profile.payoutAccount.ifsc,
            bankName: profile.payoutAccount.bankName,
            upiIdMasked: profile.payoutAccount.upiIdMasked,
          }
        : undefined,
      kycStatus: profile.kycStatus || 'pending',
    };

    res.status(200).json({
      success: true,
      message: 'Payout account details retrieved.',
      data,
    });
  } catch (error: any) {
    sendInternalError(res, 'ProviderPayout.getProviderPayoutAccount', error, 'Failed to get payout account.');
  }
};

/**
 * Provider: Configure or Update Payout Method & Bank/UPI Details
 * POST /api/provider/payout-account
 * PUT /api/provider/payout-account
 */
export const updateProviderPayoutAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const {
      payoutMethod,
      beneficiaryName,
      accountNumber,
      ifsc,
      bankName,
      upiId,
    }: UpdateProviderPayoutAccountPayload = req.body || {};

    if (!payoutMethod || !['bank_transfer', 'upi'].includes(payoutMethod)) {
      res.status(400).json({
        success: false,
        message: 'Invalid payout method. Supported options are "bank_transfer" or "upi".',
      });
      return;
    }

    if (!beneficiaryName || beneficiaryName.trim().length < 3) {
      res.status(400).json({
        success: false,
        message: 'Beneficiary name is required (minimum 3 characters).',
      });
      return;
    }

    const profile = await ProviderProfile.findById(req.providerProfile._id);
    if (!profile) {
      res.status(404).json({ success: false, message: 'Provider profile not found.' });
      return;
    }

    profile.payoutMethod = payoutMethod;

    if (payoutMethod === 'bank_transfer') {
      if (!accountNumber || accountNumber.trim().length < 8) {
        res.status(400).json({
          success: false,
          message: 'Valid bank account number is required for bank transfer payout.',
        });
        return;
      }

      const cleanIfsc = (ifsc || '').trim().toUpperCase();
      if (!cleanIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
        res.status(400).json({
          success: false,
          message: 'Valid 11-character Indian Financial System Code (IFSC) is required.',
        });
        return;
      }

      profile.payoutAccount = {
        beneficiaryName: beneficiaryName.trim(),
        accountNumber: accountNumber.trim(),
        accountNumberMasked: maskAccountNumber(accountNumber),
        ifsc: cleanIfsc,
        bankName: bankName?.trim() || 'Indian Commercial Bank',
      };
    } else if (payoutMethod === 'upi') {
      const cleanUpi = (upiId || '').trim();
      if (!cleanUpi || !cleanUpi.includes('@')) {
        res.status(400).json({
          success: false,
          message: 'Valid UPI Virtual Payment Address (e.g. name@bank) is required.',
        });
        return;
      }

      profile.payoutAccount = {
        beneficiaryName: beneficiaryName.trim(),
        upiId: cleanUpi,
        upiIdMasked: maskUpiId(cleanUpi),
      };
    }

    // Move KYC status to submitted upon providing payout details
    if (profile.kycStatus === 'pending') {
      profile.kycStatus = 'submitted';
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Payout account updated successfully.',
      data: {
        payoutMethod: profile.payoutMethod,
        payoutAccount: {
          beneficiaryName: profile.payoutAccount?.beneficiaryName,
          accountNumberMasked: profile.payoutAccount?.accountNumberMasked,
          ifsc: profile.payoutAccount?.ifsc,
          bankName: profile.payoutAccount?.bankName,
          upiIdMasked: profile.payoutAccount?.upiIdMasked,
        },
        kycStatus: profile.kycStatus,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'ProviderPayout.updateProviderPayoutAccount', error, 'Failed to update payout account.');
  }
};
