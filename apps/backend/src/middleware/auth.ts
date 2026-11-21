import { Request, Response, NextFunction } from 'express';
import { ApiResponse, UserRole } from '@dwellio/shared';
import { verifyAuthToken } from '../utils/auth';
import { User, IUser } from '../models/User';
import { ProviderProfile, IProviderProfile } from '../models/ProviderProfile';

// Extend Express Request interface to include authenticated user and provider profile
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      providerProfile?: IProviderProfile;
    }
  }
}

/**
 * Middleware: Verify JWT Bearer token and populate req.user
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const response: ApiResponse = {
      success: false,
      message: 'Authentication required. Please provide a valid Bearer token.',
    };
    res.status(401).json(response);
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAuthToken(token);

    const user = await User.findById(decoded.userId);
    if (!user) {
      const response: ApiResponse = {
        success: false,
        message: 'User account not found or no longer exists.',
      };
      res.status(401).json(response);
      return;
    }

    if (!user.isActive) {
      const response: ApiResponse = {
        success: false,
        message: 'Account is deactivated. Please contact support.',
      };
      res.status(401).json(response);
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      const response: ApiResponse = {
        success: false,
        message: 'Authentication token has expired. Please log in again.',
      };
      res.status(401).json(response);
      return;
    }

    const response: ApiResponse = {
      success: false,
      message: 'Invalid or malformed authentication token.',
    };
    res.status(401).json(response);
    return;
  }
};

/**
 * Middleware: Authorize specific user roles
 * Enforces permissions on the backend
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        message: 'Authentication required prior to authorization check.',
      };
      res.status(401).json(response);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      const response: ApiResponse = {
        success: false,
        message: 'Access denied: insufficient permissions for this resource.',
      };
      res.status(403).json(response);
      return;
    }

    next();
  };
};

/**
 * Middleware: Require an approved service provider
 * Strictly checks the database approval state on the server, never relying on JWT claims alone.
 */
export const requireApprovedProvider = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      message: 'Authentication required prior to provider authorization.',
    };
    res.status(401).json(response);
    return;
  }

  // Always query database directly to verify current approval state
  const profile = await ProviderProfile.findOne({ userId: req.user._id });

  if (!profile) {
    const response: ApiResponse = {
      success: false,
      message: 'Provider profile not found. Please submit a provider application first.',
    };
    res.status(403).json(response);
    return;
  }

  if (profile.verificationStatus !== 'approved') {
    const response: ApiResponse = {
      success: false,
      message:
        profile.verificationStatus === 'pending'
          ? 'Access denied: provider account is pending administrator approval.'
          : profile.verificationStatus === 'suspended'
          ? `Access denied: provider account is suspended. Reason: ${profile.suspensionReason || 'Account suspended by administration'}`
          : `Access denied: provider application was rejected. Reason: ${profile.rejectionReason || 'Requirements not met'}`,
    };
    res.status(403).json(response);
    return;
  }

  req.providerProfile = profile;
  next();
};
