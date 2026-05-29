import { parseBrDecimal } from "./brDecimal";

function toNumber(val: unknown): number {
  if (val === undefined || val === null || val === "") return NaN;
  if (typeof val === "number") return val;
  return parseBrDecimal(String(val));
}

/** Formato R$30.960,00 (sem espaço após R$), como no espelho M.A.F */
export function formatBRL(val: unknown, blank = false): string {
  if (blank) return "\u00A0";
  if (val === undefined || val === null || val === "") return "";
  const num = toNumber(val);
  if (isNaN(num)) return String(val);
  return (
    "R$" +
    num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function formatDecimal(val: unknown, blank = false, decimals = 2): string {
  if (blank) return "\u00A0";
  if (val === undefined || val === null || val === "") return "";
  const num = toNumber(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDateBR(dateStr: unknown, blank = false): string {
  if (blank) return "\u00A0";
  if (!dateStr) return new Date().toLocaleDateString("pt-BR");
  const parts = String(dateStr).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(dateStr);
}

export function formatDateTimeFooter(d = new Date()): string {
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}
