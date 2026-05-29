/** CSS mínimo para impressão do espelho em iframe (sem URL/data do Chrome). */
const PRINT_FRAME_CSS = `
  @page { size: A4 portrait; margin: 12mm 14mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td, th { overflow-wrap: anywhere; word-break: break-word; }
  img { max-width: 100%; height: auto; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** Remove caracteres inválidos no nome do arquivo PDF */
function sanitizeForFileName(text: string): string {
  return text
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** @deprecated Título não é mais usado na impressão (evita cabeçalho do navegador). */
export function buildReceiptPdfTitle(driverName?: string): string {
  const name = sanitizeForFileName(driverName?.trim() || "");
  return name ? `M.A.F — ${name}` : "M.A.F — Espelho de Frete";
}

export type PrintReceiptOptions = {
  driverName?: string;
};

/**
 * Imprime só o HTML do espelho em iframe oculto — sem URL, data nem título no papel.
 */
export function printReceiptDocument(
  elementId = "print-document",
  _options?: PrintReceiptOptions
): void {
  const el = document.getElementById(elementId);
  if (!el) {
    window.alert("Documento não encontrado. Abra o espelho pelo Histórico e tente de novo.");
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;width:0;height:0;border:0;clip:rect(0,0,0,0);overflow:hidden;";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    window.alert("Não foi possível abrir a impressão. Tente outro navegador.");
    return;
  }

  doc.open();
  doc.write(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title> </title>` +
      `<style>${PRINT_FRAME_CSS}</style></head><body>${el.outerHTML}</body></html>`
  );
  doc.close();

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    iframe.remove();
  };

  win.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 60_000);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      win.focus();
      win.print();
    });
  });
}
