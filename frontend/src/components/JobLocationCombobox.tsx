import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, MapPin, X } from 'lucide-react';

export interface JobLocationOption {
  code: string;
  name: string;
}

interface JobLocationComboboxProps {
  id: string;
  value: string;
  options: JobLocationOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  inputClassName?: string;
}

const normalizeText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export default function JobLocationCombobox({
  id,
  value,
  options,
  onChange,
  placeholder = 'City, province, or remote',
  loading = false,
  inputClassName = '',
}: JobLocationComboboxProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const visibleOptions = useMemo(() => {
    const query = normalizeText(value);
    if (!query) return options.slice(0, 80);
    const terms = query.split(' ').filter(Boolean);
    return options
      .filter((option) => {
        const candidate = normalizeText(option.name);
        return terms.every((term) => candidate.includes(term));
      })
      .slice(0, 80);
  }, [options, value]);

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              window.requestAnimationFrame(() => {
                wrapperRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
              });
            }
          }}
          placeholder={loading ? 'Loading Philippine locations...' : placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          className={inputClassName || 'h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'}
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" />
        ) : value ? (
          <button type="button" onClick={() => { onChange(''); setOpen(true); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Clear location"><X className="h-3.5 w-3.5" /></button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        )}
      </div>

      {open && (
        <div id={`${id}-options`} role="listbox" className="absolute z-50 mt-1 max-h-72 w-full min-w-[260px] overflow-y-auto rounded-xl border border-blue-100 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {visibleOptions.length > 0 ? visibleOptions.map((option) => (
            <button
              key={option.code}
              type="button"
              role="option"
              aria-selected={normalizeText(option.name) === normalizeText(value)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(option.name); setOpen(false); }}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-blue-200"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
              <span className="min-w-0 break-words">{option.name}</span>
            </button>
          )) : (
            <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No Philippine locations match your search.</div>
          )}
        </div>
      )}
    </div>
  );
}
