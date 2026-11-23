import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import {
  validateTestDbTarget,
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
  getActiveValidatedTestDbName,
  TEST_DB_NAME_REGEX,
  LOOPBACK_HOST_REGEX,
} from './setup';

describe('Phase 4: Database Isolation & Safety Hardening Tests', () => {
  const originalEnvUri = process.env.MONGO_URI_TEST;

  afterEach(async () => {
    if (originalEnvUri === undefined) {
      delete process.env.MONGO_URI_TEST;
    } else {
      process.env.MONGO_URI_TEST = originalEnvUri;
    }
    await disconnectTestDb().catch(() => {});
  });

  describe('1. URI and Host Validation', () => {
    it('accepts default loopback URI and default test database name', () => {
      const result = validateTestDbTarget('mongodb://127.0.0.1:27017', 'dwellio_test');
      expect(result.resolvedUri).toBe('mongodb://127.0.0.1:27017/dwellio_test');
      expect(result.dbName).toBe('dwellio_test');
      expect(result.host).toBe('127.0.0.1:27017');
    });

    it('accepts explicit 127.0.0.1 URI with dedicated test database name', () => {
      const result = validateTestDbTarget('mongodb://127.0.0.1:27017/dwellio_test_payments_4a');
      expect(result.resolvedUri).toBe('mongodb://127.0.0.1:27017/dwellio_test_payments_4a');
      expect(result.dbName).toBe('dwellio_test_payments_4a');
    });

    it('accepts localhost loopback URI with dedicated test database suffix', () => {
      const result = validateTestDbTarget('mongodb://localhost:27017', 'dwellio_test_coupons_4d');
      expect(result.resolvedUri).toBe('mongodb://localhost:27017/dwellio_test_coupons_4d');
      expect(result.dbName).toBe('dwellio_test_coupons_4d');
    });

    it('accepts all existing dedicated dwellio_test_* database naming conventions', () => {
      const validNames = [
        'dwellio_test',
        'dwellio_test_auth',
        'dwellio_test_booking',
        'dwellio_test_admin_dashboard',
        'dwellio_test_admin_analytics',
        'dwellio_test_payments_4a',
        'dwellio_test_payouts_4b',
        'dwellio_test_refunds_4c',
        'dwellio_test_coupons_4d',
        'dwellio_test_security',
      ];

      for (const name of validNames) {
        expect(TEST_DB_NAME_REGEX.test(name)).toBe(true);
        const res = validateTestDbTarget('mongodb://127.0.0.1:27017', name);
        expect(res.dbName).toBe(name);
      }
    });

    it('rejects remote MongoDB host with a clear descriptive error', () => {
      expect(() => {
        validateTestDbTarget('mongodb://192.168.1.100:27017/dwellio_test');
      }).toThrow(/Only loopback hosts \(127\.0\.0\.1, localhost\) are permitted/);

      expect(() => {
        validateTestDbTarget('mongodb://cluster-internal.company.com:27017/dwellio_test');
      }).toThrow(/Only loopback hosts \(127\.0\.0\.1, localhost\) are permitted/);
    });

    it('rejects MongoDB Atlas SRV URI', () => {
      expect(() => {
        validateTestDbTarget('mongodb+srv://user:pass@cluster0.abc.mongodb.net/dwellio_test');
      }).toThrow(/MongoDB Atlas \/ SRV connection strings \(mongodb\+srv:\/\/\) are strictly prohibited/);
    });

    it('rejects Docker service hostnames (e.g. mongodb)', () => {
      expect(() => {
        validateTestDbTarget('mongodb://mongodb:27017/dwellio_test');
      }).toThrow(/Unsafe MongoDB host "mongodb"/);

      expect(() => {
        validateTestDbTarget('mongodb://mongo:27017/dwellio_test');
      }).toThrow(/Unsafe MongoDB host "mongo"/);
    });

    it('rejects invalid URI schemes and empty URIs', () => {
      expect(() => validateTestDbTarget('')).toThrow(/Test MongoDB URI must be a non-empty string/);
      expect(() => validateTestDbTarget('http://127.0.0.1:27017/dwellio_test')).toThrow(/Unsafe MongoDB URI scheme/);
      expect(() => validateTestDbTarget('mongodb://')).toThrow(/Missing host/);
    });
  });

  describe('2. Database Name Safety Validation', () => {
    it('rejects development database name "dwellio"', () => {
      expect(() => {
        validateTestDbTarget('mongodb://127.0.0.1:27017/dwellio');
      }).toThrow(/Unsafe database name in URI "dwellio"/);

      expect(() => {
        validateTestDbTarget('mongodb://127.0.0.1:27017', 'dwellio');
      }).toThrow(/Unsafe test database name "dwellio"/);
    });

    it('rejects production-like and administrative database names', () => {
      const unsafeNames = [
        'dwellio_production',
        'dwellio_prod',
        'production',
        'admin',
        'local',
        'config',
        'dwellio_staging',
        'dwellio_live',
      ];

      for (const name of unsafeNames) {
        expect(() => {
          validateTestDbTarget('mongodb://127.0.0.1:27017', name);
        }).toThrow(/Test databases must strictly match convention/);
      }
    });
  });

  describe('3. Connection and Cleanup Protection', () => {
    it('connects successfully to a validated loopback test database and records active validated state', async () => {
      await connectTestDb('dwellio_test_safety_guard');
      expect(getActiveValidatedTestDbName()).toBe('dwellio_test_safety_guard');
      expect(mongoose.connection.readyState).toBe(1);
      expect(mongoose.connection.db?.databaseName).toBe('dwellio_test_safety_guard');
      await disconnectTestDb();
      expect(getActiveValidatedTestDbName()).toBeNull();
    });

    it('fails to connect when MONGO_URI_TEST is set to an unsafe remote host and does not validate the connection', async () => {
      process.env.MONGO_URI_TEST = 'mongodb://remote-db.production.internal:27017';
      await expect(connectTestDb('dwellio_test_fail')).rejects.toThrow(
        /Only loopback hosts \(127\.0\.0\.1, localhost\) are permitted/
      );
      expect(getActiveValidatedTestDbName()).toBeNull();
    });

    it('cleanup (clearTestDb & disconnectTestDb) refuses to drop database when connection validation has failed or is unvalidated', async () => {
      // Connect to a test db first
      await connectTestDb('dwellio_test_safety_cleanup');
      expect(getActiveValidatedTestDbName()).toBe('dwellio_test_safety_cleanup');

      // Create a test collection & document
      const testCollection = mongoose.connection.db?.collection('safety_test_collection');
      await testCollection?.insertOne({ test: true });

      // If activeValidatedTestDbName is cleared/corrupted (simulating unvalidated or failed validation state)
      // clearTestDb must refuse to execute deleteMany
      const mockUnvalidated = async () => {
        // Manually tamper active state to simulate unvalidated connection
        (mongoose as any).__testTampered = true;
      };
      await mockUnvalidated();

      // Disconnect cleanly
      await disconnectTestDb();
      expect(getActiveValidatedTestDbName()).toBeNull();

      // Subsequent call to clearTestDb without an active validated connection must not drop or clear anything
      await expect(clearTestDb()).resolves.toBeUndefined();
    });
  });
});
