import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, fetchSignInMethodsForEmail } from 'firebase/auth';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    // TODO: Implement email/password login
  };

  const handleSocialLogin = async (provider) => {
    setError('');
    try {
      const authProvider = provider === 'google' ? new GoogleAuthProvider() : new GithubAuthProvider();
      const result = await signInWithPopup(auth, authProvider);
      if (result.user) {
        // Get the return URL from location state or default to home
        const from = location.state?.from?.pathname || '/';
        navigate(from, { replace: true });
      }
    } catch (error) {
      if (error.code === 'auth/account-exists-with-different-credential') {
        // Get the email from the error
        const email = error.customData?.email;
        if (email) {
          // Get the sign-in methods for this email
          const methods = await fetchSignInMethodsForEmail(auth, email);
          let message = 'This email is already registered with ';
          if (methods.includes('password')) {
            message += 'email and password';
          } else if (methods.includes('google.com')) {
            message += 'Google';
          } else if (methods.includes('github.com')) {
            message += 'GitHub';
          }
          message += '. Please use that method to sign in.';
          setError(message);
        }
      } else {
        setError(error.message);
      }
    }
  };

  return (
    <div className="login-container">
      <div className="login-content">
        <div className="login-left">
          <h1>Welcome Back</h1>
          <p className="subtitle">Sign in to continue to School Radio</p>
          
          <form onSubmit={handleEmailLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            
            <button type="submit" className="login-button">
              Sign In
            </button>
          </form>

          <div className="social-login">
            <p>Or continue with</p>
            <div className="social-buttons">
              <button
                onClick={() => handleSocialLogin('google')}
                className="social-button google"
              >
                <img src="/google-icon.svg" alt="Google" />
                Google
              </button>
              <button
                onClick={() => handleSocialLogin('github')}
                className="social-button github"
              >
                <img src="/github-icon.svg" alt="GitHub" />
                GitHub
              </button>
            </div>
          </div>
        </div>

        <div className="login-right">
          <h2>School Radio</h2>
          <p className="description">
            Your school's own radio station. Listen to curated playlists, discover new music,
            and enjoy a seamless listening experience.
          </p>
          <div className="features">
            <div className="feature">
              <h3>Curated Playlists</h3>
              <p>Carefully selected music for every mood and occasion</p>
            </div>
            <div className="feature">
              <h3>Real-time Sync</h3>
              <p>Everyone listens to the same song at the same time</p>
            </div>
            <div className="feature">
              <h3>High Quality</h3>
              <p>Enjoy crystal clear audio quality</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login; 