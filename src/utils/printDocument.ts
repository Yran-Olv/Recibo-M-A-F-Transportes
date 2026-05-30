import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** Margens A4 — aproveita melhor a folha sem cortar em impressoras comuns */
const MARGIN_MM = 10;
const JPEG_QUALITY = 0.94;
const CAPTURE_WIDTH_MM = 190;

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

function printPdfBlob(pdf: jsPDF, fileName: string): void {
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = fileName;
  iframe.style.cssText =
    "position:fixed;width:0;height:0;border:0;clip:rect(0,0,0,0);overflow:hidden;";
  iframe.src = url;
  document.body.appendChild(iframe);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    iframe.remove();
    URL.revokeObjectURL(url);
  };

  const startPrint = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      pdf.save(`${fileName}.pdf`);
      return;
    }
    win.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(cleanup, 120_000);
    win.focus();
    win.print();
  };

  iframe.addEventListener("load", startPrint, { once: true });
  setTimeout(() => {
    if (!done) startPrint();
  }, 4000);
}

/**
 * Gera PDF do espelho e abre a impressão — evita URL/data/hora do navegador no HTML.
 */
export async function printReceiptDocument(
  elementId = "print-document",
  options?: PrintReceiptOptions
): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) {
    window.alert("Documento não encontrado. Abra o espelho pelo Histórico e tente de novo.");
    return;
  }

  const canvas = await captureReceiptElement(el);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addCanvasToPdf(pdf, canvas);

  const fileName = buildReceiptPdfTitle(options?.driverName);
  printPdfBlob(pdf, fileName);
}
