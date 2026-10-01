import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

interface MessageBoxProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export default function MessageBox({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'info',
  confirmText,
  cancelText = 'Cancel',
  destructive = false,
}: MessageBoxProps) {
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalTitle = title || {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Information',
    confirm: 'Confirmation',
  }[type];

  const styles = {
    success: {
      Icon: CheckCircle,
      iconWrap: 'bg-emerald-50 dark:bg-emerald-950/50',
      icon: 'text-emerald-500',
      button: 'bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-400 text-white',
    },
    error: {
      Icon: AlertCircle,
      iconWrap: 'bg-red-50 dark:bg-red-950/50',
      icon: 'text-red-500',
      button: 'bg-red-500 hover:bg-red-600 focus:ring-red-400 text-white',
    },
    warning: {
      Icon: AlertTriangle,
      iconWrap: 'bg-yellow-50 dark:bg-yellow-950/50',
      icon: 'text-yellow-500',
      button: 'bg-yellow-400 hover:bg-yellow-500 focus:ring-yellow-300 text-slate-900',
    },
    info: {
      Icon: Info,
      iconWrap: 'bg-blue-50 dark:bg-blue-950/50',
      icon: 'text-blue-500',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-400 text-white',
    },
    confirm: {
      Icon: AlertTriangle,
      iconWrap: 'bg-yellow-50 dark:bg-yellow-950/50',
      icon: 'text-yellow-500',
      button: 'bg-yellow-400 hover:bg-yellow-500 focus:ring-yellow-300 text-slate-900',
    },
  };

  const current = styles[type];
  const Icon = current.Icon;
  const primaryText = confirmText || (type === 'confirm' ? 'Confirm' : 'OK');
  const messageSections = message
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  const handleConfirm = () => {
    onClose();
    onConfirm?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-2xl sm:px-7 sm:py-7 dark:border-slate-700 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-box-title"
        aria-describedby="message-box-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Close message"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${current.iconWrap}`}>
            <Icon className={`h-6 w-6 ${current.icon}`} />
          </div>

          <h3 id="message-box-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {modalTitle}
          </h3>

          <div
            id="message-box-description"
            className="mt-4 max-h-[50vh] w-full space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left dark:border-slate-700 dark:bg-slate-950/70"
          >
            {messageSections.map((section, sectionIndex) => {
              const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
              const hasList = lines.length > 1 && lines.slice(1).every((line) => /^[•*-]\s*/.test(line));

              if (hasList) {
                const heading = lines[0].replace(/:$/, '');
                const items = lines.slice(1).map((line) => line.replace(/^[•*-]\s*/, ''));
                const isRequiredColumns = heading.toLowerCase() === 'required columns';

                return (
                  <section key={`${heading}-${sectionIndex}`}>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                      {heading}
                    </h4>
                    {isRequiredColumns ? (
                      <div className="flex flex-wrap gap-2">
                        {items.map((item, itemIndex) => (
                          <span key={`${item}-${itemIndex}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {items.map((item, itemIndex) => (
                          <li key={`${item}-${itemIndex}`} className="flex gap-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
                            <span className="break-words">{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              }

              return (
                <p key={`${section}-${sectionIndex}`} className="whitespace-pre-line break-words text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {section}
                </p>
              );
            })}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          {type === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`rounded px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  destructive
                    ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-400'
                    : current.button
                }`}
              >
                {primaryText}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={`col-span-2 rounded px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${current.button}`}
            >
              {primaryText}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
