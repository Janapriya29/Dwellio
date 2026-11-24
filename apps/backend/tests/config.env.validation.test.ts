import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { config, validateConfig } from '../src/config/env';

describe('Milestone 6A & 6D: Environment Validation & Live-Mode Gate', () => {
  const originalEnv = { ...process.env };
  const originalConfig = { ...config };

  beforeEach(() => {
    // Reset config object before each test
    Object.assign(config, originalConfig);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.assign(config, originalConfig);
  });

  it('passes validation under normal development/test configuration', () => {
    config.nodeEnv = 'test';
    config.port = 5000;
    config.jwtSecret = 'test_secret_longer_than_16_chars';
    config.razorpayMode = 'test';
    config.razorpayKeyId = 'rzp_test_placeholder_key_id';

    expect(() => validateConfig()).not.toThrow();
  });

  it('rejects invalid or out-of-range PORT numbers', () => {
    config.port = 999999;
    expect(() => validateConfig()).toThrow(/PORT must be a valid port number/i);
  });

  it('in production, rejects when MONGO_URI is missing or points to localhost', () => {
    config.nodeEnv = 'production';
    delete process.env.MONGO_URI;

    expect(() => validateConfig()).toThrow(/MONGO_URI must be explicitly configured in production/i);

    process.env.MONGO_URI = 'mongodb://localhost:27017/dwellio';
    config.mongoUri = 'mongodb://localhost:27017/dwellio';
    expect(() => validateConfig()).toThrow(/MONGO_URI cannot target localhost/i);
  });

  it('in production, rejects when CLIENT_URL is missing or points to localhost', () => {
    config.nodeEnv = 'production';
    process.env.MONGO_URI = 'mongodb://cluster0.dwellio.internal:27017/dwellio';
    config.mongoUri = 'mongodb://cluster0.dwellio.internal:27017/dwellio';
    delete process.env.CLIENT_URL;

    expect(() => validateConfig()).toThrow(/CLIENT_URL must be explicitly configured in production/i);

    process.env.CLIENT_URL = 'http://localhost:5173';
    config.clientUrl = 'http://localhost:5173';
    expect(() => validateConfig()).toThrow(/CLIENT_URL cannot point to localhost in production/i);
  });

  it('in production, strictly rejects insecure or short JWT secrets', () => {
    config.nodeEnv = 'production';
    process.env.MONGO_URI = 'mongodb://cluster0.dwellio.internal:27017/dwellio';
    config.mongoUri = 'mongodb://cluster0.dwellio.internal:27017/dwellio';
    process.env.CLIENT_URL = 'https://app.dwellio.com';
    config.clientUrl = 'https://app.dwellio.com';

    config.jwtSecret = 'dwellio_development_jwt_secret_key_minimum_32_bytes_long';
    expect(() => validateConfig()).toThrow(/JWT_SECRET must be explicitly set to a unique, secure secret/i);

    config.jwtSecret = 'short_secret';
    expect(() => validateConfig()).toThrow(/JWT_SECRET must be at least 32 characters long/i);
  });

  it('strictly blocks Razorpay Live mode if attempted in non-production environments', () => {
    config.nodeEnv = 'development';
    config.razorpayMode = 'live';

    expect(() => validateConfig()).toThrow(/Razorpay LIVE mode can only be activated when NODE_ENV is set to "production"/i);
  });

  it('in production, blocks Razorpay Live mode unless explicit RAZORPAY_LIVE_ENABLED=true opt-in is provided', () => {
    config.nodeEnv = 'production';
    process.env.MONGO_URI = 'mongodb://cluster0.dwellio.internal:27017/dwellio';
    config.mongoUri = 'mongodb://cluster0.dwellio.internal:27017/dwellio';
    process.env.CLIENT_URL = 'https://app.dwellio.com';
    config.clientUrl = 'https://app.dwellio.com';
    config.jwtSecret = 'super_secure_production_secret_key_exceeding_32_characters';

    config.razorpayMode = 'live';
    config.razorpayLiveEnabled = false;

    expect(() => validateConfig()).toThrow(/Razorpay LIVE mode requires explicit opt-in via RAZORPAY_LIVE_ENABLED=true/i);
  });

  it('in production Live mode, strictly enforces live key format (rzp_live_...) and valid non-placeholder secret', () => {
    config.nodeEnv = 'production';
    process.env.MONGO_URI = 'mongodb://cluster0.dwellio.internal:27017/dwellio';
    config.mongoUri = 'mongodb://cluster0.dwellio.internal:27017/dwellio';
    process.env.CLIENT_URL = 'https://app.dwellio.com';
    config.clientUrl = 'https://app.dwellio.com';
    config.jwtSecret = 'super_secure_production_secret_key_exceeding_32_characters';

    config.razorpayMode = 'live';
    config.razorpayLiveEnabled = true;

    // Test key provided in live mode
    config.razorpayKeyId = 'rzp_test_123456';
    expect(() => validateConfig()).toThrow(/RAZORPAY_KEY_ID starting with "rzp_live_"/i);

    // Live key provided but placeholder secret
    config.razorpayKeyId = 'rzp_live_abcdef123456';
    config.razorpayKeySecret = 'rzp_test_placeholder_secret';
    expect(() => validateConfig()).toThrow(/requires a valid, non-placeholder RAZORPAY_KEY_SECRET/i);

    // Valid production live credentials
    config.razorpayKeySecret = 'prod_live_secret_real_key_789';
    expect(() => validateConfig()).not.toThrow();
  });

  it('rejects live Razorpay keys configured when mode is set to test', () => {
    config.nodeEnv = 'development';
    config.razorpayMode = 'test';
    config.razorpayKeyId = 'rzp_live_accidental_leak_in_dev';

    expect(() => validateConfig()).toThrow(/A live Razorpay Key ID.*was provided while RAZORPAY_MODE is set to "test"/i);
  });
});
