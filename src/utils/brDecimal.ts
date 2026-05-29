/** Converte texto BR, número ou formato do PostgreSQL (18500.000) para número. */
export function parseBrDecimal(input: string | number | null | undefined): number {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (input === undefined || input === null) return 0;

  const raw = String(input).trim();
  if (!raw) return 0;

  // Formato brasileiro: vírgula como decimal (18.500,00)
  if (raw.includes(",")) {
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  // Formato PostgreSQL / US: um ponto decimal (18500.000 ou 3096000.00)
  const dotMatches = raw.match(/\./g);
  if (dotMatches?.length === 1) {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  // Só separador de milhar com ponto ou inteiro (3.096.000)
  const normalized = raw.replace(/\./g, "");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Limita valor ao que cabe em DECIMAL(precision, scale) do PostgreSQL. */
export function clampPgDecimal(value: number, precision: number, scale: number): number {
  if (!Number.isFinite(value)) return 0;
  const maxIntDigits = precision - scale;
  const max = Math.pow(10, maxIntDigits) - Math.pow(10, -scale);
  const clamped = Math.min(Math.max(value, -max), max);
  const factor = Math.pow(10, scale);
  return Math.round(clamped * factor) / factor;
}

/** Formata número para exibição BR com casas decimais fixas. */
export function formatBrDecimal(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Formata valor vindo do banco/API ou string. */
export function formatBrDecimalFromUnknown(val: unknown, decimals: number): string {
  if (val === undefined || val === null || val === "") return "";
  const n = parseBrDecimal(val as string | number);
  if (!Number.isFinite(n)) return "";
  return formatBrDecimal(n, decimals);
}

/**
 * Sanitiza digitação em tempo real (milhar com ponto, decimal com vírgula).
 * Ex.: 18500 → 18.500 | 18500,5 → 18.500,5
 */
export function sanitizeBrDecimalTyping(input: string, maxDecimals = 2): string {
  if (!input) return "";

  let s = input.replace(/[^\d.,]/g, "");
  const commaIdx = s.indexOf(",");
  const hasComma = commaIdx >= 0;

  const intRaw = hasComma ? s.slice(0, commaIdx) : s;
  const decRaw = hasComma
    ? s
        .slice(commaIdx + 1)
        .replace(/[^\d]/g, "")
        .slice(0, maxDecimals)
    : "";

  let intDigits = intRaw.replace(/\./g, "").replace(/^0+(?=\d)/, "");

  if (!intDigits && (decRaw || hasComma)) intDigits = "0";

  const formattedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (hasComma) {
    return `${formattedInt},${decRaw}`;
  }
  return formattedInt;
}

/**
 * Ao sair do campo: sem vírgula ou vírgula sem decimais → completa (75 → 75,00).
 * Já com decimais completos (70,59) → só normaliza milhar.
 */
export function finalizeBrDecimal(value: string, decimals: number): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const commaIdx = trimmed.indexOf(",");
  if (commaIdx < 0) {
    return formatBrDecimal(parseBrDecimal(trimmed), decimals);
  }

  const decPart = trimmed.slice(commaIdx + 1).replace(/\D/g, "");
  if (decPart.length === 0) {
    const intOnly = trimmed.slice(0, commaIdx);
    return formatBrDecimal(parseBrDecimal(intOnly || "0"), decimals);
  }

  if (decPart.length >= decimals) {
    const normalized = `${trimmed.slice(0, commaIdx)},${decPart.slice(0, decimals)}`;
    return formatBrDecimal(parseBrDecimal(normalized), decimals);
  }

  return formatBrDecimal(parseBrDecimal(trimmed), decimals);
}
