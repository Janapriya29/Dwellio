import { Request, Response } from 'express';
import { ApiResponse, AuthResponseData, SafeUser } from '@dwellio/shared';
import { User } from '../models/User';
import {
  hashPassword,
  comparePassword,
  generateToken,
  toSafeUser,
} from '../utils/auth';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Customer Registration
 * POST /api/auth/register
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;

  // 1. Input presence validation
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    const response: ApiResponse = {
      success: false,
      message: 'Name must be a valid string between 2 and 100 characters.',
    };
    res.status(400).json(response);
    return;
  }

  if (!email || typeof email !== 'string') {
    const response: ApiResponse = {
      success: false,
      message: 'Email address is required.',
    };
    res.status(400).json(response);
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    const response: ApiResponse = {
      success: false,
      message: 'Please provide a valid email address.',
    };
    res.status(400).json(response);
    return;
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    const response: ApiResponse = {
      success: false,
      message: 'Password must be at least 8 characters long.',
    };
    res.status(400).json(response);
    return;
  }

  // 2. Prevent role elevation: Public registrations MUST strictly default to 'customer'
  // Regardless of what role was passed in req.body, role is forced to 'customer'
  const assignedRole = 'customer';

  // 3. Check for duplicate email
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const response: ApiResponse = {
      success: false,
      message: 'An account with this email address already exists.',
    };
    res.status(409).json(response);
    return;
  }

  // 4. Hash password
  const passwordHash = await hashPassword(password);

  // 5. Create new user in database
  const newUser = new User({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: assignedRole,
    isActive: true,
  });

  await newUser.save();

  // 6. Generate JWT token
  const token = generateToken({
    userId: newUser._id.toString(),
    role: newUser.role,
  });

  const response: ApiResponse<AuthResponseData> = {
    success: true,
    message: 'Customer registration successful.',
    data: {
      user: toSafeUser(newUser),
      token,
    },
  };

  res.status(201).json(response);
};

/**
 * User Login
 * POST /api/auth/login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    const response: ApiResponse = {
      success: false,
      message: 'Email and password are required.',
    };
    res.status(400).json(response);
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Find user by normalized email
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    // Generic error message to prevent user enumeration
    const response: ApiResponse = {
      success: false,
      message: 'Invalid email or password.',
    };
    res.status(401).json(response);
    return;
  }

  // 2. Check if user is active
  if (!user.isActive) {
    const response: ApiResponse = {
      success: false,
      message: 'Account is deactivated. Please contact customer support.',
    };
    res.status(401).json(response);
    return;
  }

  // 3. Verify password against hash
  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    // Generic error message to prevent password guessing insights
    const response: ApiResponse = {
      success: false,
      message: 'Invalid email or password.',
    };
    res.status(401).json(response);
    return;
  }

  // 4. Generate JWT
  const token = generateToken({
    userId: user._id.toString(),
    role: user.role,
  });

  const response: ApiResponse<AuthResponseData> = {
    success: true,
    message: 'Login successful.',
    data: {
      user: toSafeUser(user),
      token,
    },
  };

  res.status(200).json(response);
};

/**
 * Current User Profile
 * GET /api/auth/me
 */
export const getMe = (req: Request, res: Response): void => {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      message: 'User authentication required.',
    };
    res.status(401).json(response);
    return;
  }

  const response: ApiResponse<{ user: SafeUser }> = {
    success: true,
    message: 'User profile retrieved successfully.',
    data: {
      user: toSafeUser(req.user),
    },
  };

  res.status(200).json(response);
};
