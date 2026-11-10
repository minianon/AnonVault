import React from 'react';

/* The AnonVault mark: a vault door reduced to a dial and a handle. */
export default function Logo({ size = 22, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#EDEDEF" />
      <circle cx="16" cy="16" r="7.25" stroke="#0B0B0D" strokeWidth="2.5" />
      <path d="M16 16 L20.2 11.8" stroke="#0B0B0D" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.9" fill="#0B0B0D" />
    </svg>
  );
}
