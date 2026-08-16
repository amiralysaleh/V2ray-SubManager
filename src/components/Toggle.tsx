import React from 'react';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange, description }) => {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-neutral-200">{label}</span>
        {description && <span className="text-xs text-neutral-500">{description}</span>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-400 focus:ring-offset-1 focus:ring-offset-neutral-950 ${
          checked ? 'bg-neutral-200' : 'bg-neutral-800'
        }`}
      >
        <span
          className={`${
            checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
          } inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform`}
        />
      </button>
    </div>
  );
};

export default Toggle;
