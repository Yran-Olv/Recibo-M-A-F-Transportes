import type { CnpjLookupResult } from "../types/cnpj";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Aceita resposta já mapeada pelo servidor ou campos alternativos. */
export function normalizeCnpjLookupResult(body: unknown): CnpjLookupResult | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const razao =
    str(b.razao_social) ||
    str(b.razaoSocial) ||
    str(b.nome_empresarial) ||
    str(b.nome);

  if (!razao) return null;

  const endereco =
    str(b.endereco) ||
    [str(b.logradouro), str(b.numero), str(b.bairro)].filter(Boolean).join(", ");

  const cidade =
    str(b.cidade) ||
    str(b.municipio) ||
    (typeof b.cidade === "object" && b.cidade !== null
      ? str((b.cidade as Record<string, unknown>).nome)
      : "");

  const estado =
    str(b.estado) ||
    str(b.uf) ||
    (typeof b.estado === "object" && b.estado !== null
      ? str((b.estado as Record<string, unknown>).sigla)
      : "");

  const logradouro = str(b.logradouro);
  const numero = str(b.numero);
  const complemento = str(b.complemento);
  const bairro = str(b.bairro);

  return {
    cnpj: str(b.cnpj),
    razao_social: razao,
    nome_fantasia: str(b.nome_fantasia),
    endereco: endereco || [logradouro, numero, bairro].filter(Boolean).join(", "),
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    estado: estado.toUpperCase(),
    cep: str(b.cep),
    telefone: str(b.telefone),
  };
}
