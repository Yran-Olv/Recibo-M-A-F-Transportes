import { formatCep, formatCnpj, formatTelefone, onlyDigits } from "../utils/cnpj.ts";
import type { CnpjLookupResult } from "../types/cnpj.ts";

const FETCH_HEADERS = {
  Accept: "application/json",
  "User-Agent": "MAF-Recibos/1.0 (Espelho de Frete; +https://github.com)",
};

interface BrasilApiCnpj {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  ddd_telefone_1?: string;
}

interface CnpjWsEstabelecimento {
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  ddd1?: string;
  telefone1?: string;
  cidade?: { nome?: string };
  estado?: { sigla?: string };
}

interface CnpjWsResponse {
  razao_social?: string;
  estabelecimento?: CnpjWsEstabelecimento;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function buildEnderecoParts(
  logradouro: string,
  numero: string,
  complemento: string,
  bairro: string
): string {
  const parts: string[] = [];
  if (logradouro) {
    let line = logradouro;
    if (numero) line += `, ${numero}`;
    if (complemento) line += ` - ${complemento}`;
    parts.push(line);
  }
  if (bairro) parts.push(bairro);
  return parts.join(" - ");
}

function toResult(
  digits: string,
  fields: {
    razao_social: string;
    nome_fantasia?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
  }
): CnpjLookupResult {
  const cepDigits = onlyDigits(fields.cep || "");
  const logradouro = str(fields.logradouro);
  const numero = str(fields.numero);
  const complemento = str(fields.complemento);
  const bairro = str(fields.bairro);
  return {
    cnpj: formatCnpj(digits),
    razao_social: fields.razao_social,
    nome_fantasia: str(fields.nome_fantasia),
    endereco: buildEnderecoParts(logradouro, numero, complemento, bairro),
    logradouro,
    numero,
    complemento,
    bairro,
    cidade: str(fields.municipio),
    estado: str(fields.uf).toUpperCase(),
    cep: cepDigits ? formatCep(cepDigits) : "",
    telefone: formatTelefone(fields.telefone),
  };
}

function mapBrasilApi(row: BrasilApiCnpj, digits: string): CnpjLookupResult {
  const razao = str(row.razao_social);
  if (!razao) throw new Error("CNPJ sem razão social retornada");
  return toResult(digits, {
    razao_social: razao,
    nome_fantasia: row.nome_fantasia,
    logradouro: row.logradouro,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    municipio: row.municipio,
    uf: row.uf,
    cep: row.cep,
    telefone: row.ddd_telefone_1,
  });
}

function mapCnpjWs(row: CnpjWsResponse, digits: string): CnpjLookupResult {
  const razao = str(row.razao_social);
  const est = row.estabelecimento || {};
  if (!razao) throw new Error("CNPJ sem razão social retornada");
  const tel = [str(est.ddd1), str(est.telefone1)].filter(Boolean).join("");
  return toResult(digits, {
    razao_social: razao,
    nome_fantasia: est.nome_fantasia,
    logradouro: est.logradouro,
    numero: est.numero,
    complemento: est.complemento,
    bairro: est.bairro,
    municipio: est.cidade?.nome,
    uf: est.estado?.sigla,
    cep: est.cep,
    telefone: tel,
  });
}

async function fetchBrasilApi(digits: string): Promise<CnpjLookupResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
    });

    if (res.status === 404) {
      throw new Error("CNPJ não encontrado na base da Receita Federal");
    }
    if (res.status === 429) {
      throw new Error("Muitas consultas. Aguarde um momento e tente novamente.");
    }
    if (!res.ok) {
      throw new Error(`BrasilAPI retornou status ${res.status}`);
    }

    const data = (await res.json()) as BrasilApiCnpj;
    return mapBrasilApi(data, digits);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCnpjWs(digits: string): Promise<CnpjLookupResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
    });

    if (res.status === 404) {
      throw new Error("CNPJ não encontrado");
    }
    if (!res.ok) {
      throw new Error(`CNPJ.ws retornou status ${res.status}`);
    }

    const data = (await res.json()) as CnpjWsResponse;
    return mapCnpjWs(data, digits);
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupCnpj(rawCnpj: string): Promise<CnpjLookupResult> {
  const digits = onlyDigits(rawCnpj);
  if (digits.length !== 14) {
    throw new Error("CNPJ deve ter 14 dígitos");
  }

  const errors: string[] = [];

  try {
    return await fetchBrasilApi(digits);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro BrasilAPI";
    errors.push(msg);
    if (msg.includes("não encontrado")) throw err;
  }

  try {
    return await fetchCnpjWs(digits);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro CNPJ.ws";
    errors.push(msg);
    if (msg.includes("não encontrado")) throw err;
  }

  if (errors.some((e) => e.includes("AbortError") || e.includes("expirou"))) {
    throw new Error("Consulta de CNPJ expirou. Tente novamente.");
  }

  throw new Error(
    errors.length > 0
      ? `Não foi possível consultar o CNPJ (${errors.join("; ")})`
      : "Serviço de consulta de CNPJ indisponível"
  );
}
