import React, { useState } from 'react';
import { SafeUser } from '@dwellio/shared';
import { useAuth, DEMO_CREDENTIALS } from '../../context/AuthContext';
import { submitProviderApplication } from '../../services/providerService';

export type AuthModalMode = 'login' | 'register-customer' | 'apply-provider';

export type AuthDestination = 'landing' | 'discover' | 'my-bookings' | 'provider-portal' | 'admin-dashboard';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: AuthModalMode;
  onClose: () => void;
  onSuccess?: (user: SafeUser, destination?: AuthDestination) => void;
  postLoginRedirect?: AuthDestination;
}

const AVAILABLE_SKILLS = [
  'Waterproofing',
  'Roof repair',
  'Gutter cleaning',
  'Plumbing',
  'Tiling',
  'Leak repair',
  'Electrician',
  'AC service',
  'Painting',
  'Appliance repair',
  'Chimney cleaning',
  'Pest control',
  'Gardening',
  'Pressure washing',
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
  postLoginRedirect,
}) => {
  const { user: currentUser, token: currentToken, login, register } = useAuth();
  const [mode, setMode] = useState<AuthModalMode>(initialMode);

  // Common credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');

  // Provider application fields
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>(['Plumbing']);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setDisplayName('');
    setPhone('');
    setServiceArea('');
    setSelectedSkills(['Plumbing']);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleModeChange = (newMode: AuthModalMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please provide both your email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const loggedInUser = await login(email.trim(), password);
      setSuccessMessage('Welcome back! Logging you in...');

      let targetDestination: AuthDestination = 'discover';
      if (postLoginRedirect) {
        targetDestination = postLoginRedirect;
      } else if (loggedInUser.role === 'admin') {
        targetDestination = 'admin-dashboard';
      } else if (loggedInUser.role === 'provider') {
        targetDestination = 'provider-portal';
      } else {
        targetDestination = 'discover';
      }

      setTimeout(() => {
        onClose();
        resetForm();
        if (onSuccess) onSuccess(loggedInUser, targetDestination);
      }, 500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid email or password.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage('Full name must be at least 2 characters.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const newUser = await register(name.trim(), email.trim(), password);
      setSuccessMessage('Account created successfully! Welcome to Dwellio.');

      setTimeout(() => {
        onClose();
        resetForm();
        if (onSuccess) onSuccess(newUser, 'discover');
      }, 600);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!displayName.trim() || displayName.trim().length < 2) {
      setErrorMessage('Business / display name must be at least 2 characters.');
      return;
    }

    if (!phone.trim() || phone.trim().length < 7) {
      setErrorMessage('Please provide a valid contact phone number (at least 7 digits).');
      return;
    }

    if (!serviceArea.trim() || serviceArea.trim().length < 2) {
      setErrorMessage('Please describe the areas or cities you serve.');
      return;
    }

    if (selectedSkills.length === 0) {
      setErrorMessage('Please select at least one skill or specialty.');
      return;
    }

    setIsLoading(true);
    try {
      let activeToken = currentToken;
      let activeUser = currentUser;

      // If not yet logged in, register customer user first
      if (!activeToken || !activeUser) {
        if (!name.trim() || name.trim().length < 2) {
          setErrorMessage('Full personal name is required for registration.');
          setIsLoading(false);
          return;
        }
        if (!email.trim() || !email.includes('@')) {
          setErrorMessage('Valid email address is required.');
          setIsLoading(false);
          return;
        }
        if (password.length < 8) {
          setErrorMessage('Password must be at least 8 characters.');
          setIsLoading(false);
          return;
        }

        activeUser = await register(name.trim(), email.trim(), password);
        activeToken = localStorage.getItem('dwellio_token');
      }

      if (!activeToken) {
        throw new Error('Authentication session could not be established.');
      }

      await submitProviderApplication(
        {
          displayName: displayName.trim(),
          phone: phone.trim(),
          serviceArea: serviceArea.trim(),
          skills: selectedSkills,
        },
        activeToken
      );

      setSuccessMessage('Application submitted successfully! Our administrative team will review your credentials.');

      setTimeout(() => {
        onClose();
        resetForm();
        if (onSuccess && activeUser) onSuccess(activeUser, 'provider-portal');
      }, 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit application.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-dwellio-mint/40 relative my-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            onClose();
            resetForm();
          }}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-dwellio-ivory flex items-center justify-center text-dwellio-teal/60 hover:text-dwellio-teal hover:bg-dwellio-mint/30 transition"
          aria-label="Close dialog"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-xl bg-dwellio-teal flex items-center justify-center text-dwellio-mint font-bold text-base">
              D
            </span>
            <span className="text-xl font-black text-dwellio-teal">Dwellio</span>
          </div>

          <h2 id="auth-modal-title" className="text-2xl font-black tracking-tight text-dwellio-teal">
            {mode === 'login' && 'Sign in to your account'}
            {mode === 'register-customer' && 'Create your customer account'}
            {mode === 'apply-provider' && 'Join Dwellio as a Verified Provider'}
          </h2>
          <p className="text-xs sm:text-sm text-dwellio-teal/70 mt-1">
            {mode === 'login' && 'Access your bookings, reviews, or administration panel.'}
            {mode === 'register-customer' && 'Discover background-checked specialists and book with confidence.'}
            {mode === 'apply-provider' && 'Offer your trade skills to local homeowners after admin verification.'}
          </p>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="p-3.5 mb-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            <span className="font-bold">Error:</span> {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 mb-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {successMessage}
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-dwellio-teal text-white font-bold text-sm hover:opacity-95 transition shadow-xs disabled:opacity-50"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>

            {/* Quick Demo Pre-fill Links in Development */}
            {import.meta.env.DEV && DEMO_CREDENTIALS && (() => {
              const demo = DEMO_CREDENTIALS;
              if (!demo) return null;
              return (
                <div className="pt-3 border-t border-dwellio-mint/40">
                  <span className="text-[11px] font-bold text-dwellio-teal/60 block mb-1.5 uppercase tracking-wider">
                    Development Demo Quick-Fill:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(demo.customer.email);
                        setPassword(demo.customer.password);
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium bg-dwellio-ivory hover:bg-dwellio-mint/30 text-dwellio-teal border border-dwellio-mint/60"
                    >
                      Customer (Pooja)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(demo.karthik.email);
                        setPassword(demo.karthik.password);
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium bg-dwellio-ivory hover:bg-dwellio-mint/30 text-dwellio-teal border border-dwellio-mint/60"
                    >
                      Provider (Karthik)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(demo.admin.email);
                        setPassword(demo.admin.password);
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300"
                      title="Pre-fill explicitly configured local development admin credentials"
                    >
                      🛡️ Admin ({demo.admin.email})
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Switch Mode Links */}
            <div className="pt-2 text-center text-xs text-dwellio-teal/70 space-y-1">
              <div>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('register-customer')}
                  className="font-bold text-dwellio-teal underline hover:text-[#D9653B]"
                >
                  Sign up as Customer
                </button>
              </div>
              <div>
                Are you a service professional?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('apply-provider')}
                  className="font-bold text-[#D9653B] underline hover:opacity-80"
                >
                  Apply to become a Provider
                </button>
              </div>
            </div>
          </form>
        )}

        {/* 2. CUSTOMER REGISTRATION FORM */}
        {mode === 'register-customer' && (
          <form onSubmit={handleRegisterCustomerSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
                className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                required
                className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-dwellio-teal text-white font-bold text-sm hover:opacity-95 transition shadow-xs disabled:opacity-50 mt-2"
            >
              {isLoading ? 'Creating Account...' : 'Create Customer Account'}
            </button>

            <div className="pt-2 text-center text-xs text-dwellio-teal/70">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => handleModeChange('login')}
                className="font-bold text-dwellio-teal underline hover:text-[#D9653B]"
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {/* 3. PROVIDER ONBOARDING / APPLICATION FORM */}
        {mode === 'apply-provider' && (
          <form onSubmit={handleApplyProviderSubmit} className="space-y-3.5">
            {/* Account Information (if not already logged in) */}
            {!currentUser && (
              <div className="p-3 rounded-2xl bg-dwellio-ivory/60 border border-dwellio-mint/50 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-dwellio-teal/70 block">
                  Step 1: Your Account Credentials
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full Personal Name"
                    required
                    className="w-full px-3 py-1.5 rounded-lg border border-dwellio-mint bg-white text-dwellio-teal text-xs focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email Address"
                    required
                    className="w-full px-3 py-1.5 rounded-lg border border-dwellio-mint bg-white text-dwellio-teal text-xs focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                  />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create Password (min 8 chars)"
                  required
                  className="w-full px-3 py-1.5 rounded-lg border border-dwellio-mint bg-white text-dwellio-teal text-xs focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>
            )}

            {/* Provider Profile Information */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1">
                Business / Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Anand Plumbing &amp; Sanitary"
                required
                className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98400 11223"
                  required
                  className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1">
                  Service Area
                </label>
                <input
                  type="text"
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  placeholder="e.g. Metro West &amp; Suburbs"
                  required
                  className="w-full px-4 py-2 rounded-xl border border-dwellio-mint bg-dwellio-ivory/30 text-dwellio-teal text-sm focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                />
              </div>
            </div>

            {/* Skills selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-dwellio-teal/80 mb-1.5">
                Skills &amp; Trades Offered
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-dwellio-ivory/30 rounded-xl border border-dwellio-mint/50">
                {AVAILABLE_SKILLS.map((skill) => {
                  const isChecked = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                        isChecked
                          ? 'bg-dwellio-teal text-white shadow-xs'
                          : 'bg-white text-dwellio-teal/80 border border-dwellio-mint/70 hover:bg-dwellio-mint/20'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '}
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs">
              🛡️ <strong>Admin Verification Policy:</strong> Your profile will be submitted in <em>Pending</em> status. Our operations team validates identity and trade credentials before enabling booking requests.
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-[#D9653B] text-white font-bold text-sm hover:bg-[#c4562f] transition shadow-xs disabled:opacity-50"
            >
              {isLoading ? 'Submitting Application...' : 'Submit Provider Application'}
            </button>

            <div className="pt-2 text-center text-xs text-dwellio-teal/70">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => handleModeChange('login')}
                className="font-bold text-dwellio-teal underline hover:text-[#D9653B]"
              >
                Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
