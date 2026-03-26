import React from 'react';

interface MobileTextareaProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  rows?: number;
}

export const MobileTextarea: React.FC<MobileTextareaProps> = ({
  label,
  error,
  helperText,
  required = false,
  placeholder,
  value,
  onChange,
  className = '',
  disabled = false,
  id,
  rows = 3
}) => {
  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
  
  const baseClasses = 'w-full px-4 py-3 text-base sm:text-lg border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-500 resize-none';
  const errorClasses = error ? 'border-red-500 focus:ring-red-500' : '';
  
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };
  
  return (
    <div className="space-y-2">
      {label && (
        <label 
          htmlFor={textareaId}
          className="block text-sm font-medium text-slate-700"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <textarea
        id={textareaId}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        rows={rows}
        className={`${baseClasses} ${errorClasses} ${className}`}
        style={{ minHeight: '48px' }}
      />
      
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      
      {helperText && !error && (
        <p className="text-sm text-slate-600">{helperText}</p>
      )}
    </div>
  );
};
