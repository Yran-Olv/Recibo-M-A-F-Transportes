import React from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../utils/useBodyScrollLock";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

export type AppDialogVariant = "success" | "error" | "info" | "confirm";

interface AppDialogProps {
  open: boolean;
  variant?: AppDialogVariant;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm?: () => void;
}

const styles: Record<AppDialogVariant, { icon: typeof Info; ring: string; btn: string }> = {
  success: { icon: CheckCircle2, ring: "bg-emerald-50 text-emerald-600", btn: "bg-emerald-600 hover:bg-emerald-500" },
  error: { icon: AlertCircle, ring: "bg-red-50 text-red-600", btn: "bg-red-600 hover:bg-red-500" },
  info: { icon: Info, ring: "bg-blue-50 text-blue-600", btn: "bg-blue-600 hover:bg-blue-500" },
  confirm: { icon: Info, ring: "bg-amber-50 text-amber-600", btn: "bg-blue-600 hover:bg-blue-500" },
};

export function AppDialog({
  open,
  variant = "info",
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancelar",
  onClose,
  onConfirm,
}: AppDialogProps) {
  useBodyScrollLock(open);

  if (!open || typeof document === "undefined") return null;

  const { icon: Icon, ring, btn } = styles[variant];
  const isConfirm = variant === "confirm" && onConfirm;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-black/45 backdrop-blur-[2px] overscroll-none"
      role="presentation"
      onClick={onClose}
    >
      <div className="flex flex-1 min-h-0 items-center justify-center p-4 overflow-y-auto overscroll-contain">
        <div
          className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md animate-scale-in my-auto shrink-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-dialog-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-4 p-5 sm:p-6 pr-12">
            <div className={`shrink-0 p-2.5 rounded-full ${ring}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h2 id="app-dialog-title" className="text-lg font-bold text-slate-900">
                {title}
              </h2>
              <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap break-words">{message}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex justify-end gap-2 px-5 sm:px-6 pb-5 sm:pb-6">
            {isConfirm && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={isConfirm ? onConfirm : onClose}
              className={`px-4 py-2 text-sm font-bold text-white rounded-xl cursor-pointer ${btn}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
