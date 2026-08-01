import React from 'react';

/**
 * Brand mark: three ascending bars (growth/data + a nod to a campus skyline)
 * inside a rounded Violet Pulse gradient badge, with a small "pulse" dot
 * above the tallest bar. Self-contained (own background), so it reads
 * cleanly on both dark and light surfaces down to ~20px.
 */
export const LogoMark: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} role="img" aria-label="PeopleIT SMS">
    <defs>
      <linearGradient id="logoMarkGradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#7C6AF2" />
        <stop offset="1" stopColor="#10B981" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#logoMarkGradient)" />
    <rect x="7" y="17" width="4" height="8" rx="1.5" fill="white" />
    <rect x="14" y="12" width="4" height="13" rx="1.5" fill="white" />
    <rect x="21" y="8" width="4" height="17" rx="1.5" fill="white" />
    <circle cx="23" cy="5" r="1.8" fill="white" fillOpacity="0.9" />
  </svg>
);
