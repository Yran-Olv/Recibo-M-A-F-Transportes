import React from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../utils/useBodyScrollLock";

export interface ModalShellProps {
  open: boolean;
  onClose?: () => void;
  /** Largura máxima do painel (classes Tailwind). */
  maxWidthClassName?: string;
  zIndexClassName?: string;
  /** Conteúdo fixo no topo (título, etapas, etc.). */
  header?: React.ReactNode;
  /** Área rolável do meio. */
  children: React.ReactNode;
  /** Rodapé fixo (botões Voltar / Salvar). */
  footer?: React.ReactNode;
  /** Clique no fundo escuro fecha. */
  closeOnBackdrop?: boolean;
  ariaLabel?: string;
}

/**
 * Modal em portal (document.body), centralizado na tela.
 * Altura limitada à viewport; rodapé fixo; só o miolo rola se necessário.
 */
export function ModalShell({
  open,
  onClose,
  maxWidthClassName = "max-w-3xl",
  zIndexClassName = "z-50",
  header,
  children,
  footer,
  closeOnBackdrop = false,
  ariaLabel = "Diálogo",
}: ModalShellProps) {
  useBodyScrollLock(open);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center overflow-hidden bg-black/50 overscroll-none p-3 sm:p-4`}
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      role="presentation"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`flex flex-col w-full min-h-0 ${maxWidthClassName} max-h-full bg-white shadow-2xl overflow-hidden rounded-2xl`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {header ? <div className="shrink-0 min-w-0">{header}</div> : null}
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y">
            {children}
          </div>
        </div>
        {footer ? <div className="shrink-0 min-w-0">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
