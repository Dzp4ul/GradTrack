import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

interface MessageBoxProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  confirmText?: string;
  cancelText?: string;
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
      iconWrap: 'bg-emerald-50',
      icon: 'text-emerald-500',
      button: 'bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-400 text-white',
    },
    error: {
      Icon: AlertCircle,
      iconWrap: 'bg-red-50',
      icon: 'text-red-500',
      button: 'bg-red-500 hover:bg-red-600 focus:ring-red-400 text-white',
    },
    warning: {
      Icon: AlertTriangle,
      iconWrap: 'bg-yellow-50',
      icon: 'text-yellow-500',
      button: 'bg-yellow-400 hover:bg-yellow-500 focus:ring-yellow-300 text-slate-900',
    },
    info: {
      Icon: Info,
      iconWrap: 'bg-blue-50',
      icon: 'text-blue-500',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-400 text-white',
    },
    confirm: {
      Icon: AlertTriangle,
      iconWrap: 'bg-yellow-50',
      icon: 'text-yellow-500',
      button: 'bg-yellow-400 hover:bg-yellow-500 focus:ring-yellow-300 text-slate-900',
    },
  };

  const current = styles[type];
  const Icon = current.Icon;
  const primaryText = confirmText || (type === 'confirm' ? 'Confirm' : 'OK');

  const handleConfirm = () => {
    onClose();
    onConfirm?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/35 px-4 py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white px-7 py-7 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-box-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-full ${current.iconWrap}`}>
            <Icon className={`h-6 w-6 ${current.icon}`} />
          </div>

          <h3 id="message-box-title" className="text-base font-bold text-slate-900">
            {modalTitle}
          </h3>

          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-500">
            {message}
          </p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          {type === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`rounded px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${current.button}`}
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
