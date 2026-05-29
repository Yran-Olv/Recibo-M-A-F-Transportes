import { formatCep, onlyDigits } from "../utils/cnpj.ts";
import type { CepLookupResult } from "../types/cep.ts";

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

export async function lookupCep(rawCep: string): Promise<CepLookupResult> {
  const digits = onlyDigits(rawCep);
  if (digits.length !== 8) {
    throw new Error("CEP deve ter 8 dígitos");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Consulta de CEP retornou status ${res.status}`);
    }

    const data = (await res.json()) as ViaCepResponse;
    if (data.erro) {
      throw new Error("CEP não encontrado");
    }

    return {
      cep: formatCep(digits),
      logradouro: (data.logradouro || "").trim(),
      complemento: (data.complemento || "").trim(),
      bairro: (data.bairro || "").trim(),
      cidade: (data.localidade || "").trim(),
      estado: (data.uf || "").trim().toUpperCase(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
