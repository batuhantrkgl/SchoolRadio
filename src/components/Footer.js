import React from 'react';
import './Footer.css';

/**
 * Component to display the footer
 */
const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3>About This Radio</h3>
          <p>
            This web-based radio station provides a synchronized listening experience
            using YouTube videos as the source. Enjoy music together with others in real-time.
          </p>
        </div>
        
        <div className="footer-section">
          <h3>Quick Links</h3>
          <ul className="footer-links">
            <li><a href="#top">Back to Top</a></li>
            <li><a href="#faq">FAQ</a></li>
            <li><a href="#playlist">Playlist</a></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h3>Legal</h3>
          <p>
            This service uses YouTube's API and content. All music rights belong to their
            respective owners. This is a non-commercial project.
          </p>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p>&copy; {currentYear} Web Radio. All rights reserved.</p>
        <p>
          <small>
            Made with <span className="heart">♥</span> by students
          </small>
        </p>
      </div>
    </footer>
  );
};

export default Footer;