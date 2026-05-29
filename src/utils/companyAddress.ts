import type { CompanyProfile } from "../types";
import { formatCep, onlyDigits } from "./cnpj";

/** Monta o campo legado `endereco` a partir dos campos separados (sem duplicar CEP). */
export function buildCompanyEnderecoCompleto(c: CompanyProfile): string {
  const log = c.endereco_logradouro?.trim();
  if (!log) return c.endereco?.trim() || "";

  const line1Parts: string[] = [log];
  if (c.endereco_numero?.trim()) line1Parts.push(`nº ${c.endereco_numero.trim()}`);
  if (c.endereco_complemento?.trim()) line1Parts.push(c.endereco_complemento.trim());
  if (c.endereco_bairro?.trim()) line1Parts.push(c.endereco_bairro.trim());
  const line1 = line1Parts.join(", ");

  const cidadeUf = [c.endereco_cidade?.trim(), c.endereco_estado?.trim()]
    .filter(Boolean)
    .join("-");
  const cepFmt = c.cep?.trim() ? `CEP ${c.cep.trim()}` : "";
  const line2 = [cidadeUf, cepFmt].filter(Boolean).join(" — ");

  return [line1, line2].filter(Boolean).join(" — ");
}

/** Linhas do endereço no cabeçalho impresso (evita quebra feia). */
export function formatCompanyAddressForPrint(c: CompanyProfile): {
  line1: string;
  line2: string;
} {
  const log = c.endereco_logradouro?.trim();
  if (log) {
    const line1Parts: string[] = [log];
    if (c.endereco_numero?.trim()) line1Parts.push(`nº ${c.endereco_numero.trim()}`);
    if (c.endereco_complemento?.trim()) line1Parts.push(c.endereco_complemento.trim());
    if (c.endereco_bairro?.trim()) line1Parts.push(c.endereco_bairro.trim());
    const cidadeUf = [c.endereco_cidade?.trim(), c.endereco_estado?.trim()]
      .filter(Boolean)
      .join("-");
    const cepFmt = c.cep?.trim() ? `CEP ${c.cep.trim()}` : "";
    const line2 = [cidadeUf, cepFmt].filter(Boolean).join(" — ");
    return { line1: line1Parts.join(", "), line2 };
  }

  return legacyAddressLines(c.endereco?.trim() || "", c.cep?.trim());
}

function legacyAddressLines(endereco: string, cep?: string): { line1: string; line2: string } {
  if (!endereco) {
    return { line1: "", line2: cep ? `CEP ${cep}` : "" };
  }

  const stripCep = (s: string) =>
    s
      .replace(/,?\s*CEP\s*:?\s*\d{5}-?\d{3}/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  const parts = endereco.split(/\s*—\s*/).map(stripCep).filter(Boolean);
  if (parts.length <= 1) {
    const line1 = stripCep(endereco);
    return { line1, line2: cep ? `CEP ${cep}` : "" };
  }

  let line1 = parts[0];
  let line2 = parts.slice(1).join(" — ");
  if (cep) {
    line2 = [stripCep(line2), `CEP ${cep}`].filter(Boolean).join(" — ");
  }
  return { line1, line2 };
}

export function normalizeCompanyProfile(profile: CompanyProfile): CompanyProfile {
  const cepDigits = onlyDigits(profile.cep || "");
  const cep = cepDigits.length === 8 ? formatCep(cepDigits) : profile.cep?.trim() || "";

  const normalized: CompanyProfile = {
    ...profile,
    cep,
    endereco_logradouro: profile.endereco_logradouro?.trim() || "",
    endereco_numero: profile.endereco_numero?.trim() || "",
    endereco_complemento: profile.endereco_complemento?.trim() || "",
    endereco_bairro: profile.endereco_bairro?.trim() || "",
    endereco_cidade: profile.endereco_cidade?.trim() || "",
    endereco_estado: profile.endereco_estado?.trim().toUpperCase() || "",
  };

  normalized.endereco = buildCompanyEnderecoCompleto(normalized) || profile.endereco?.trim() || "";
  return normalized;
}
