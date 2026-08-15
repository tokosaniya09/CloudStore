import React, { useState } from 'react';
import {
  LogIn,
  UserPlus,
  Cloud,
  Lock,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { User, Organization } from '../types/index.ts';
import { apiClient } from '../api/client.ts';
import { auth, googleProvider } from '../lib/firebase.ts';
import { signInWithPopup } from 'firebase/auth';

interface AuthModalProps {
  users: User[];
  orgs: Organization[];
  onSelectUser: (user: User) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  users,
  onSelectUser,
  isOpen,
  onClose,
}) => {
  const [activeAuthTab, setActiveAuthTab] = useState<'firebase' | 'signup'>('firebase');
  
  // Auth form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'ADMIN' | 'ORGANIZATION_ADMIN' | 'USER'>('USER');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleFirebaseGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      
      const nameParts = (firebaseUser.displayName || 'Google User').split(' ');
      const fName = nameParts[0] || 'Google';
      const lName = nameParts.slice(1).join(' ') || 'User';
      const userEmail = firebaseUser.email || 'user@cloudstore.io';

      let matchedUser = users.find((u) => u.email.toLowerCase() === userEmail.toLowerCase());

      if (!matchedUser) {
        matchedUser = await apiClient.register(userEmail, fName, lName, 'USER');
      } else {
        apiClient.setActiveUser(matchedUser.id);
      }

      onSelectUser(matchedUser);
      onClose();
    } catch (err: any) {
      console.error('Google Sign in error:', err);
      setErrorMsg(err.message || 'Google Sign-In failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      if (activeAuthTab === 'signup') {
        if (!email || !firstName || !lastName) {
          throw new Error('Please fill out all required fields.');
        }
        const newUser = await apiClient.register(email, firstName, lastName, selectedRole);
        onSelectUser(newUser);
        onClose();
      } else {
        if (!email) {
          throw new Error('Please enter your email address.');
        }
        try {
          const authResult = await apiClient.login(email, password);
          onSelectUser(authResult.user);
          onClose();
        } catch (err: any) {
          throw new Error('Account not found with this email. If you do not have an account, please click "Register Account".');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden text-gray-800">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-8 py-8 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
                <Cloud className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">CloudStore Drive</h2>
                <p className="text-xs text-blue-100 mt-0.5">Enterprise Multi-Tenant Storage</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors cursor-pointer"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-6 bg-black/20 p-1 rounded-2xl text-xs font-semibold backdrop-blur-md">
            <button
              onClick={() => {
                setActiveAuthTab('firebase');
                setErrorMsg('');
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeAuthTab === 'firebase'
                  ? 'bg-white text-gray-900 shadow-md font-bold'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              onClick={() => {
                setActiveAuthTab('signup');
                setErrorMsg('');
              }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeAuthTab === 'signup'
                  ? 'bg-white text-gray-900 shadow-md font-bold'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Account</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-8">
          {errorMsg && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: Sign In Form */}
          {activeAuthTab === 'firebase' && (
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <button
                type="button"
                onClick={handleFirebaseGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-2xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-xs cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="flex items-center my-4">
                <div className="flex-1 border-t border-gray-200" />
                <span className="px-3 text-xs text-gray-400 uppercase tracking-wider font-semibold">Or with Email</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="user@organization.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer mt-2"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* TAB 2: Register Account Form */}
          {activeAuthTab === 'signup' && (
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  placeholder="jane.doe@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Enterprise Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer font-medium"
                >
                  <option value="USER">Standard Member (Upload & Manage Files)</option>
                  <option value="ORGANIZATION_ADMIN">Organization Admin (Manage Members & Quotas)</option>
                  <option value="ADMIN">System Administrator (Global Control & Audit Logs)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer mt-2"
              >
                {loading ? 'Creating Account...' : 'Register & Log In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
