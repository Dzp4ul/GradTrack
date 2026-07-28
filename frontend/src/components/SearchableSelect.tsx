import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search } from 'lucide-react';

export interface SearchableSelectOption {
  code: string;
  name: string;
}

interface SearchableSelectProps {
  id: string;
  options: SearchableSelectOption[];
  value: string;
  selectedName?: string;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  onChange: (code: string) => void;
}

const normalizeText = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export default function SearchableSelect({
  id,
  options,
  value,
  selectedName = '',
  placeholder,
  disabled = false,
  loading = false,
  required = false,
  onChange,
}: SearchableSelectProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.code === value) || null;
  const displayName = selectedOption?.name || selectedName;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(displayName);

  useEffect(() => {
    setQuery(displayName);
  }, [displayName]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery(displayName);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [displayName]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return options.slice(0, 80);

    return options
      .filter((option) => normalizeText(option.name).includes(normalizedQuery))
      .slice(0, 80);
  }, [options, query]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          id={id}
          type="text"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            if (value && nextQuery.trim() === '') {
              onChange('');
            }
          }}
          onFocus={() => !disabled && setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setQuery(displayName);
            }, 120);
          }}
          placeholder={loading ? 'Loading...' : placeholder}
          className={`w-full rounded-lg border px-9 py-2.5 text-sm transition focus:outline-none focus:ring-2 ${
            disabled
              ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500 focus:ring-0'
              : 'border-gray-300 bg-white text-gray-900 focus:border-transparent focus:ring-blue-500'
          }`}
          disabled={disabled}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        )}
      </div>

      {open && !disabled && (
        <div
          id={`${id}-options`}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-blue-100 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.code}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                  option.code === value ? 'bg-blue-100 text-blue-900' : 'text-gray-700'
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.code);
                  setQuery(option.name);
                  setOpen(false);
                }}
                role="option"
                aria-selected={option.code === value}
              >
                {option.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}
