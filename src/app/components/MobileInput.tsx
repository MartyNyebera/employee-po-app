import React from 'react';

interface MobileInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  type?: 'text' | 'number' | 'email' | 'tel' | 'date';
  placeholder?: string;
  value?: string | number;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}

export const MobileInput: React.FC<MobileInputProps> = ({
  label,
  error,
  helperText,
  required = false,
  type = 'text',
  placeholder,
  value,
  onChange,
  className = '',
  disabled = false,
  id,
  min,
  max,
  step
}) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  const baseClasses = 'w-full px-4 py-3 text-base sm:text-lg border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-500';
  const errorClasses = error ? 'border-red-500 focus:ring-red-500' : '';
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };
  
  return (
    <div className="space-y-2">
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <input
        id={inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
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
