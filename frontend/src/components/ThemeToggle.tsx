import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme, type ThemeMode } from '../contexts/theme';

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

const themeOptions: Array<{ value: ThemeMode; label: string; Icon: LucideIcon }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export default function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = themeOptions.find((option) => option.value === themeMode) || themeOptions[2];
  const CurrentIcon = themeMode === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (mode: ThemeMode) => {
    setThemeMode(mode);
    setOpen(false);
  };

  return (
    <div className={`theme-toggle-wrap ${className}`} ref={wrapperRef}>
      <button
        type="button"
        className={`theme-toggle ${compact ? 'theme-toggle--compact' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Theme: ${selectedOption.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CurrentIcon className="theme-toggle__icon" aria-hidden="true" />
        <span className="theme-toggle__label">{selectedOption.label}</span>
        <ChevronDown className={`theme-toggle__chevron ${open ? 'theme-toggle__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="theme-toggle__menu" role="listbox" aria-label="Choose color theme">
          {themeOptions.map(({ value, label, Icon }) => {
            const selected = value === themeMode;

            return (
              <button
                key={value}
                type="button"
                className={`theme-toggle__option ${selected ? 'theme-toggle__option--selected' : ''}`}
                onClick={() => handleSelect(value)}
                role="option"
                aria-selected={selected}
              >
                <Icon className="theme-toggle__option-icon" aria-hidden="true" />
                <span>{label}</span>
                {selected && <Check className="theme-toggle__check" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
