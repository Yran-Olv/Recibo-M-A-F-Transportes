/** Remove tudo que não for dígito. */
export function onlyDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Formata 14 dígitos como CNPJ (00.000.000/0000-00). */
export function formatCnpj(digits: string): string {
  const d = onlyDigits(digits).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function isCnpjLength(value: string): boolean {
  return onlyDigits(value).length === 14;
}

/** Formata até 11 dígitos como CPF (000.000.000-00). */
export function formatCpf(digits: string): string {
  const d = onlyDigits(digits).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Máscara CPF (11 dígitos) ou CNPJ (14). */
export function formatCpfOrCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) return formatCpf(d);
  return formatCnpj(d);
}

export function formatCep(digits: string): string {
  const d = onlyDigits(digits).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** (00) 0000-0000 ou (00) 00000-0000 — formata enquanto digita só números. */
export function formatTelefone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (d.length <= 10) {
    if (rest.length <= 4) return `(${ddd}) ${rest}`;
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

/** Placa BR: ABC-1234 ou Mercosul ABC-1D23 */
export function formatPlaca(value: string): string {
  const raw = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
  if (raw.length <= 3) return raw;
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

export type BrDocMask = "cpf" | "cnpj" | "cpf_cnpj" | "cep" | "phone" | "placa";

export function formatByMask(mask: BrDocMask, value: string): string {
  switch (mask) {
    case "cpf":
      return formatCpf(value);
    case "cnpj":
      return formatCnpj(value);
    case "cpf_cnpj":
      return formatCpfOrCnpj(value);
    case "cep":
      return formatCep(value);
    case "phone":
      return formatTelefone(value);
    case "placa":
      return formatPlaca(value);
    default:
      return value;
  }
}
