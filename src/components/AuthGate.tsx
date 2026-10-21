import React, { useState } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Sparkles
} from 'lucide-react';
import { authService } from '../services/authService';
import type { LauncherUser } from '../types/launcher';
import { getAssetUrl } from '../utils/assets';

interface AuthGateProps {
  gatewayUrl?: string;
  onAuthenticated: (user: LauncherUser) => void;
}

type AuthMode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';

export const AuthGate: React.FC<AuthGateProps> = ({ gatewayUrl, onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [senderAddress, setSenderAddress] = useState<string>('Inaayah Studio <noreply@inaayah.dev>');
  const [devPreviewCode, setDevPreviewCode] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setError(null);
    setInfoMessage(null);
    setDevPreviewCode(null);
    setOtpCode('');
    setMode(nextMode);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const result = await authService.login(email, password, gatewayUrl);
      if (result.status === 'VERIFICATION_REQUIRED') {
        if (result.sender) setSenderAddress(result.sender);
        setDevPreviewCode(result.devOtpCode || null);
        setInfoMessage(
          result.message || `Please enter the 6-digit verification code sent to ${result.email || email}.`
        );
        setMode('verify');
        return;
      }
      if (result.user) {
        onAuthenticated(result.user);
      }
    } catch (err: any) {
      setError(err?.message || 'Sign in failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const result = await authService.register(email, password, displayName, gatewayUrl);
      if (result.sender) setSenderAddress(result.sender);
      setDevPreviewCode(result.devOtpCode || null);
      setInfoMessage(
        result.message || `We sent a 6-digit verification code to ${result.email || email}.`
      );
      setMode('verify');
    } catch (err: any) {
      setError(err?.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authService.verifyEmail(email, otpCode, gatewayUrl);
      if (result.user) {
        onAuthenticated(result.user);
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid 6-digit verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async (purpose: 'verify_email' | 'reset_password') => {
    setError(null);
    setResending(true);
    try {
      const res = await authService.resendCode(email, purpose, gatewayUrl);
      if (res.sender) setSenderAddress(res.sender);
      setDevPreviewCode(res.devOtpCode || null);
      setInfoMessage(res.message || `A fresh 6-digit code was sent to ${email}.`);
    } catch (err: any) {
      setError(err?.message || 'Could not resend verification code.');
    } finally {
      setResending(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      const res = await authService.forgotPassword(email, gatewayUrl);
      if (res.sender) setSenderAddress(res.sender);
      setDevPreviewCode(res.devOtpCode || null);
      setInfoMessage(res.message || `A 6-digit reset code was sent to ${email}.`);
      setMode('reset');
    } catch (err: any) {
      setError(err?.message || 'Could not send password reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authService.resetPassword(email, otpCode, password, gatewayUrl);
      if (res.user) {
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-gate-screen">
      <div className="auth-gate-backdrop" />

      <div className="auth-gate-card">
        <div className="auth-brand-header">
          <div className="auth-brand-icon-wrap">
            <img
              src={getAssetUrl('icon.png')}
              alt="Inaayah Studio"
              style={{ width: 42, height: 42, borderRadius: 10 }}
            />
          </div>
          <div>
            <div className="auth-brand-kicker">INAAYAH STUDIO NETWORK</div>
            <h1 className="auth-brand-title">
              {mode === 'signin' && 'Sign In to Inaayah Launcher'}
              {mode === 'signup' && 'Create Your Inaayah Account'}
              {mode === 'verify' && 'Verify Your Email Address'}
              {mode === 'forgot' && 'Reset Your Password'}
              {mode === 'reset' && 'Set a New Password'}
            </h1>
          </div>
        </div>

        {(mode === 'signin' || mode === 'signup') && (
          <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={`auth-mode-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => switchMode('signin')}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={`auth-mode-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => switchMode('signup')}
            >
              Create Account
            </button>
          </div>
        )}

        {error && (
          <div className="auth-alert error" role="alert">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="auth-alert info" role="status">
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{infoMessage}</span>
          </div>
        )}

        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="auth-form">
            <div className="form-group">
              <label htmlFor="signin-email" className="form-label">
                Email Address
              </label>
              <div className="auth-input-wrap">
                <Mail size={16} className="auth-input-icon" />
                <input
                  type="email"
                  id="signin-email"
                  name="email"
                  className="form-input with-icon"
                  placeholder="player@example.com"
                  autoComplete="username"
                  spellCheck={false}
                  enterKeyHint="next"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="current-password" className="form-label" style={{ marginBottom: 0 }}>
                  Password
                </label>
                <button
                  type="button"
                  className="auth-text-link"
                  onClick={() => switchMode('forgot')}
                >
                  Forgot password?
                </button>
              </div>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="current-password"
                  name="password"
                  className="form-input with-icon with-action"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  enterKeyHint="done"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary-action play auth-submit-btn"
              disabled={loading}
            >
              <span>{loading ? 'Signing In...' : 'Sign In'}</span>
              <ArrowRight size={16} />
            </button>

            <div className="auth-footer-note">
              <ShieldCheck size={14} color="var(--accent-cyan)" />
              <span>Verified account required to download and play Inaayah Studio games.</span>
            </div>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="auth-form">
            <div className="form-group">
              <label htmlFor="signup-name" className="form-label">
                Player Display Name
              </label>
              <div className="auth-input-wrap">
                <User size={16} className="auth-input-icon" />
                <input
                  type="text"
                  id="signup-name"
                  name="name"
                  className="form-input with-icon"
                  placeholder="e.g. CyberKnight"
                  autoComplete="name"
                  spellCheck={false}
                  enterKeyHint="next"
                  minLength={2}
                  maxLength={64}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-email" className="form-label">
                Email Address
              </label>
              <div className="auth-input-wrap">
                <Mail size={16} className="auth-input-icon" />
                <input
                  type="email"
                  id="signup-email"
                  name="email"
                  className="form-input with-icon"
                  placeholder="you@example.com"
                  autoComplete="username"
                  spellCheck={false}
                  enterKeyHint="next"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="new-password" className="form-label">
                Create Password (8+ characters)
              </label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="new-password"
                  name="new-password"
                  className="form-input with-icon with-action"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  enterKeyHint="done"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary-action play auth-submit-btn"
              disabled={loading}
            >
              <span>{loading ? 'Sending Verification Code...' : 'Create Account'}</span>
              <ArrowRight size={16} />
            </button>

            <div className="auth-footer-note">
              <Mail size={14} color="var(--accent-cyan)" />
              <span>We will send a 6-digit verification code to confirm your email address.</span>
            </div>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerifyOtp} className="auth-form">
            <div className="form-group">
              <label htmlFor="otp-input" className="form-label">
                6-Digit Verification Code
              </label>
              <p id="otp-format-hint" className="auth-field-hint">
                Enter the 6-digit code sent to <strong>{email}</strong> from{' '}
                <code style={{ color: 'var(--accent-cyan)' }}>{senderAddress}</code>.
              </p>

              {devPreviewCode && (
                <div className="auth-dev-otp-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} color="var(--accent-cyan)" />
                    <span>
                      Preview OTP Code: <strong className="mono">{devPreviewCode}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                    onClick={() => setOtpCode(devPreviewCode)}
                  >
                    Fill Code
                  </button>
                </div>
              )}

              <input
                type="text"
                id="otp-input"
                name="otp"
                className="form-input auth-otp-single-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                aria-describedby="otp-format-hint"
                enterKeyHint="done"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary-action play auth-submit-btn"
              disabled={loading || otpCode.length !== 6}
            >
              <ShieldCheck size={16} />
              <span>{loading ? 'Verifying Account...' : 'Verify & Launch'}</span>
            </button>

            <div className="auth-verify-actions">
              <button
                type="button"
                className="auth-text-link"
                disabled={resending}
                onClick={() => handleResendOtp('verify_email')}
              >
                <RefreshCw size={12} className={resending ? 'spin-fast' : ''} />
                <span>{resending ? 'Sending new code...' : 'Resend 6-digit code'}</span>
              </button>
              <button
                type="button"
                className="auth-text-link"
                onClick={() => switchMode('signin')}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor="forgot-email" className="form-label">
                Account Email Address
              </label>
              <div className="auth-input-wrap">
                <Mail size={16} className="auth-input-icon" />
                <input
                  type="email"
                  id="forgot-email"
                  name="email"
                  className="form-input with-icon"
                  placeholder="you@example.com"
                  autoComplete="username"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary-action play auth-submit-btn"
              disabled={loading}
            >
              <KeyRound size={16} />
              <span>{loading ? 'Sending Reset Code...' : 'Send 6-Digit Reset Code'}</span>
            </button>

            <div className="auth-verify-actions" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="auth-text-link"
                onClick={() => switchMode('signin')}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor="reset-otp-input" className="form-label">
                6-Digit Reset Code
              </label>
              <p id="reset-otp-hint" className="auth-field-hint">
                Enter the 6-digit code sent to <strong>{email}</strong>.
              </p>

              {devPreviewCode && (
                <div className="auth-dev-otp-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} color="var(--accent-cyan)" />
                    <span>
                      Preview Reset Code: <strong className="mono">{devPreviewCode}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                    onClick={() => setOtpCode(devPreviewCode)}
                  >
                    Fill Code
                  </button>
                </div>
              )}

              <input
                type="text"
                id="reset-otp-input"
                name="otp"
                className="form-input auth-otp-single-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                aria-describedby="reset-otp-hint"
                enterKeyHint="next"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reset-new-password" className="form-label">
                New Password (8+ characters)
              </label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reset-new-password"
                  name="new-password"
                  className="form-input with-icon with-action"
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  enterKeyHint="done"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary-action play auth-submit-btn"
              disabled={loading || otpCode.length !== 6}
            >
              <ShieldCheck size={16} />
              <span>{loading ? 'Updating Password...' : 'Save New Password & Sign In'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
