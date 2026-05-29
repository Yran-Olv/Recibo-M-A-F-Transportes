/** Remove caracteres inválidos no nome do arquivo PDF */
function sanitizeForFileName(text: string): string {
  return text
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Título usado pelo Chrome/Edge ao salvar como PDF */
export function buildReceiptPdfTitle(driverName?: string): string {
  const name = sanitizeForFileName(driverName?.trim() || "");
  return name ? `M.A.F — ${name}` : "M.A.F — Espelho de Frete";
}

export type PrintReceiptOptions = {
  /** Nome do motorista no arquivo PDF */
  driverName?: string;
};

/**
 * Imprime o espelho na mesma aba (sem pop-up nem iframe).
 * O CSS em index.css esconde o resto da página e mostra só #print-document.
 */
export function printReceiptDocument(
  elementId = "print-document",
  options?: PrintReceiptOptions
): void {
  const el = document.getElementById(elementId);
  if (!el) {
    window.alert("Documento não encontrado. Abra o espelho pelo Histórico e tente de novo.");
    return;
  }

  const previousTitle = document.title;
  document.title = buildReceiptPdfTitle(options?.driverName);

  document.body.classList.add("is-printing-receipt");
  document.body.setAttribute("data-print-target", elementId);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.title = previousTitle;
    document.body.classList.remove("is-printing-receipt");
    document.body.removeAttribute("data-print-target");
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 60_000);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}
