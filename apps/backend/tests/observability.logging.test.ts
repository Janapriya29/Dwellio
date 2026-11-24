import { describe, it, expect, vi } from 'vitest';
import { redactSensitive, logger } from '../src/utils/logger';

describe('Milestone 6B: Structured Logging & Credential Redaction', () => {
  it('redacts sensitive fields such as passwords, tokens, secrets, and auth headers', () => {
    const rawPayload = {
      user: {
        id: 'usr_123',
        email: 'customer@dwellio.com',
        password: 'SuperSecretPassword123!',
        passwordHash: '$2a$12$e0MYz4Wj.Z5Yl/Kk414uNu',
      },
      auth: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMifQ',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      },
      gateway: {
        keySecret: 'rzp_live_secret_456',
        webhookSecret: 'whsec_789',
        accountNumber: '123456789012',
      },
      safeField: 'This is visible operational context',
    };

    const redacted = redactSensitive(rawPayload);

    expect(redacted.safeField).toBe('This is visible operational context');
    expect(redacted.user.id).toBe('usr_123');
    expect(redacted.user.email).toBe('customer@dwellio.com');

    // Sensitive items must be strictly redacted
    expect(redacted.user.password).toBe('[REDACTED]');
    expect(redacted.user.passwordHash).toBe('[REDACTED]');
    expect(redacted.auth.token).toBe('[REDACTED]');
    expect(redacted.auth.authorization).toBe('[REDACTED]');
    expect(redacted.gateway.keySecret).toBe('[REDACTED]');
    expect(redacted.gateway.webhookSecret).toBe('[REDACTED]');
    expect(redacted.gateway.accountNumber).toBe('[REDACTED]');
  });

  it('handles nested arrays and deep objects without crashing', () => {
    const nested = {
      transactions: [
        { id: 1, amount: 500, cardNumber: '4111111111111111' },
        { id: 2, amount: 1000, cardNumber: '4222222222222222' },
      ],
    };

    const sanitized = redactSensitive(nested);

    expect(sanitized.transactions[0].cardNumber).toBe('[REDACTED]');
    expect(sanitized.transactions[1].cardNumber).toBe('[REDACTED]');
    expect(sanitized.transactions[0].amount).toBe(500);
  });

  it('emits structured logs without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => {
      logger.info('Test operational event', {
        action: 'BOOKING_DISPATCH',
        bookingId: 'book_999',
        password: 'should_be_hidden',
      });
    }).not.toThrow();

    consoleSpy.mockRestore();
  });
});
