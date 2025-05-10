import React, { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import './Header.css';

const Header = () => {
  const [user, setUser] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        setUser(user);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, [auth]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleAccountSettings = () => {
    navigate('/account');
    setShowMenu(false);
  };

  return (
    <>
      <div className="header-trigger"></div>
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1>School Radio</h1>
            <p className="subtitle">Your School's Music Platform</p>
          </div>
          {user && (
            <div className="header-right">
              <div 
                className="user-info"
                onClick={() => setShowMenu(!showMenu)}
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="profile-picture" />
                ) : (
                  <div className="profile-picture-placeholder">
                    {user.displayName ? user.displayName[0].toUpperCase() : user.email[0].toUpperCase()}
                  </div>
                )}
                <span className="user-name">
                  {user.displayName || user.email}
                </span>
              </div>
              {showMenu && (
                <div className="user-menu">
                  <div className="menu-item" onClick={handleAccountSettings}>
                    <i className="fas fa-cog"></i>
                    Account Settings
                  </div>
                  <div className="menu-item" onClick={handleLogout}>
                    <i className="fas fa-sign-out-alt"></i>
                    Logout
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
    </>
  );
};

export default Header; 