import { config, validateConfig } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { User } from '../models/User';
import { hashPassword } from '../utils/auth';

/**
 * Controlled Administrator Account Provisioning CLI Script
 * Never exposed via HTTP. Requires local CLI access or secure environment secrets.
 */
const seedAdmin = async (): Promise<void> => {
  try {
    validateConfig();
    await connectDatabase();

    const isProduction = config.nodeEnv === 'production';
    const email = (process.env.ADMIN_EMAIL || (isProduction ? '' : 'admin@dwellio.local')).trim().toLowerCase();
    const rawPassword = process.env.ADMIN_PASSWORD || (isProduction ? '' : 'DwellioAdmin2026!');
    const name = (process.env.ADMIN_NAME || 'Dwellio Administrator').trim();

    if (isProduction) {
      if (!email || !rawPassword) {
        throw new Error(
          '[Security Error] In production, ADMIN_EMAIL and ADMIN_PASSWORD environment variables are mandatory to run seed:admin.'
        );
      }
      if (rawPassword.length < 12) {
        throw new Error(
          '[Security Error] In production, ADMIN_PASSWORD must be at least 12 characters long.'
        );
      }
    }

    if (!email || !rawPassword) {
      throw new Error('[Error] Missing email or password for admin provisioning.');
    }

    const existingAdmin = await User.findOne({ email });

    if (existingAdmin) {
      if (existingAdmin.role === 'admin') {
        console.log(`[Admin Seed] Admin user "${email}" already exists with role "admin". No changes needed.`);
      } else {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log(`[Admin Seed] Existing user "${email}" elevated to "admin" role.`);
      }
    } else {
      const passwordHash = await hashPassword(rawPassword);
      const newAdmin = new User({
        name,
        email,
        passwordHash,
        role: 'admin',
        isActive: true,
      });

      await newAdmin.save();
      console.log(`[Admin Seed] Initial administrator account created successfully: ${email}`);
    }

    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    console.error('[Admin Seed Error]', error instanceof Error ? error.message : error);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }
};

seedAdmin();
