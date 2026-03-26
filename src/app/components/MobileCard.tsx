import React from 'react';

interface MobileCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const MobileCard: React.FC<MobileCardProps> = ({ 
  children, 
  className = '', 
  onClick 
}) => {
  return (
    <div 
      className={`bg-white border border-slate-200 rounded-xl p-4 mobile:p-3 shadow-sm sm:shadow-lg transition-all duration-200 hover:shadow-md ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
