import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** Margens A4 — aproveita melhor a folha sem cortar em impressoras comuns */
const MARGIN_MM = 10;
const JPEG_QUALITY = 0.94;
const CAPTURE_WIDTH_MM = 190;

const PRINT_BODY_CLASS = "is-printing-receipt";

/** Remove caracteres inválidos no nome do arquivo PDF */
function sanitizeForFileName(text: string): string {
  return text
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildReceiptPdfTitle(driverName?: string): string {
  const name = sanitizeForFileName(driverName?.trim() || "");
  return name ? `M.A.F — ${name}` : "M.A.F — Espelho de Frete";
}

export type PrintReceiptOptions = {
  driverName?: string;
};

function addCanvasToPdf(pdf: jsPDF, canvas: HTMLCanvasElement): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = pageWidth - MARGIN_MM * 2;
  const printableHeight = pageHeight - MARGIN_MM * 2;

  const imgWidth = printableWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < imgHeight) {
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", MARGIN_MM, MARGIN_MM - offsetY, imgWidth, imgHeight);
    offsetY += printableHeight;
    pageIndex += 1;
  }
}

async function captureReceiptElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  const wrap = document.createElement("div");
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.cssText = `position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;width:${CAPTURE_WIDTH_MM}mm;padding:0;margin:0;`;

  const clone = el.cloneNode(true) as HTMLElement;
  wrap.appendChild(clone);
  document.body.appendChild(wrap);

  try {
    return await html2canvas(clone, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
    });
  } finally {
    wrap.remove();
  }
}

async function buildReceiptPdfFromElement(elementId: string): Promise<jsPDF> {
  const el = document.getElementById(elementId);
  if (!el) {
    throw new Error("Documento não encontrado. Abra o espelho pelo Histórico e tente de novo.");
  }
  const canvas = await captureReceiptElement(el);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addCanvasToPdf(pdf, canvas);
  return pdf;
}

/**
 * Imprime na impressora sem sair da página (diálogo do sistema sobre o modal).
 * Não abre nova aba nem baixa arquivo automaticamente.
 */
export function printReceiptInPage(elementId = "print-document"): void {
  const el = document.getElementById(elementId);
  if (!el) {
    window.alert("Documento não encontrado. Abra o espelho pelo Histórico e tente de novo.");
    return;
  }

  const prevTitle = document.title;
  document.title = " ";
  document.body.classList.add(PRINT_BODY_CLASS);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove(PRINT_BODY_CLASS);
    document.title = prevTitle;
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120_000);

  requestAnimationFrame(() => {
    window.focus();
    window.print();
  });
}

/**
 * Baixa PDF somente quando o usuário clicar em «Baixar PDF».
 */
export async function downloadReceiptPdf(
  elementId = "print-document",
  options?: PrintReceiptOptions
): Promise<void> {
  const pdf = await buildReceiptPdfFromElement(elementId);
  const fileName = buildReceiptPdfTitle(options?.driverName);
  pdf.save(`${fileName}.pdf`);
}
