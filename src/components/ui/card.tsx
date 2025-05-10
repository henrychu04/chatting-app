import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'message';
}

export const Card: React.FC<CardProps> = ({ className = '', variant = 'default', ...props }) => {
  const baseStyles = 'rounded-lg border border-[#2d2d2d] bg-[#18181b]';
  const variantStyles = {
    default: 'p-4',
    message: 'px-2 hover:bg-[#1f1f23] transition-colors border-0',
  };

  return (
    <div className={`${variant === 'message' ? '' : baseStyles} ${variantStyles[variant]} ${className}`} {...props} />
  );
};
