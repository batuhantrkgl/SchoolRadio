import React, { useState } from 'react';
import './FAQ.css';

/**
 * Component to display frequently asked questions
 */
const FAQ = () => {
  // State to track which FAQ items are expanded
  const [expandedItems, setExpandedItems] = useState({});
  
  // FAQ data
  const faqItems = [
    {
      id: 1,
      question: "What is this radio station?",
      answer: "This is a web-based radio station that plays music from a curated YouTube playlist. It's designed to provide a synchronized listening experience for all users."
    },
    {
      id: 2,
      question: "How does the radio work?",
      answer: "The radio plays songs from a YouTube playlist in a synchronized manner. This means everyone tuning in at the same time will hear the same song at the same position, creating a shared listening experience."
    },
    {
      id: 3,
      question: "Can I request songs?",
      answer: "Currently, song requests are not supported directly through the interface. The playlist is curated by the radio administrators."
    },
    {
      id: 4,
      question: "Why does the player start muted?",
      answer: "Due to browser autoplay policies, the player starts muted. You need to click the 'Unmute' button to hear the audio. This is a requirement from browsers to prevent unwanted audio playback."
    },
    {
      id: 5,
      question: "How often is the playlist updated?",
      answer: "The playlist is checked for updates periodically. New songs may be added at any time, and the system will incorporate them into the rotation."
    },
    {
      id: 6,
      question: "Is my listening data being tracked?",
      answer: "We only track anonymous statistics like the number of listeners. No personal information is collected or stored."
    }
  ];
  
  // Toggle expanded state for an item
  const toggleItem = (id) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  return (
    <div className="faq-container">
      <h2>Frequently Asked Questions</h2>
      
      <div className="faq-list">
        {faqItems.map(item => (
          <div 
            key={item.id} 
            className={`faq-item ${expandedItems[item.id] ? 'expanded' : ''}`}
          >
            <div 
              className="faq-question"
              onClick={() => toggleItem(item.id)}
            >
              <span>{item.question}</span>
              <span className="faq-toggle">{expandedItems[item.id] ? '−' : '+'}</span>
            </div>
            
            {expandedItems[item.id] && (
              <div className="faq-answer">
                {item.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FAQ;