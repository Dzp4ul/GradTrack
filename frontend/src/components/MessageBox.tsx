import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

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
  confirmText = 'OK',
  cancelText = 'Cancel',
}: MessageBoxProps) {
  if (!isOpen) return null;

  const icons = {
    success: <CheckCircle className="w-12 h-12 text-green-600" />,
    error: <AlertCircle className="w-12 h-12 text-red-600" />,
    warning: <AlertTriangle className="w-12 h-12 text-yellow-600" />,
    info: <Info className="w-12 h-12 text-blue-600" />,
    confirm: <AlertTriangle className="w-12 h-12 text-yellow-600" />,
  };

  const colors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
    confirm: 'bg-yellow-50 border-yellow-200',
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md m-4">
        <div className={`flex items-center justify-center p-6 border-b rounded-t-2xl ${colors[type]}`}>
          {icons[type]}
        </div>
        <div className="p-6">
          {title && <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>}
          <p className="text-gray-700 whitespace-pre-line">{message}</p>
        </div>
        <div className="flex gap-3 p-6 border-t bg-gray-50 rounded-b-2xl">
          {type === 'confirm' ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-100 transition"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm?.();
                  onClose();
                }}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
              >
                {confirmText}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
