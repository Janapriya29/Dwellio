import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AuthTokenPayload, SafeUser, UserRole } from '@dwellio/shared';
import { config } from '../config/env';
import { IUser } from '../models/User';

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hash a plain text password using bcrypt.
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
};

/**
 * Compare a plain text password with a hashed password.
 */
export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Generate a signed JWT token for an authenticated user.
 */
export const generateToken = (payload: AuthTokenPayload): string => {
  const options: SignOptions = {
    expiresIn: config.jwtExpiresIn as any,
  };
  return jwt.sign(
    {
      userId: payload.userId,
      role: payload.role,
    },
    config.jwtSecret,
    options
  );
};

/**
 * Verify and decode a JWT token.
 * Throws an error if the token is invalid, expired, or signature does not match.
 */
export const verifyAuthToken = (token: string): AuthTokenPayload => {
  return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
};

/**
 * Transform a database User document into a safe user representation.
 * Explicitly excludes passwordHash and internal Mongoose fields.
 */
export const toSafeUser = (user: IUser): SafeUser => {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || undefined,
    isActive: user.isActive,
    createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: user.updatedAt ? user.updatedAt.toISOString() : new Date().toISOString(),
  };
};
