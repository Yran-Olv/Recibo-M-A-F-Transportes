import { useCallback, useRef, useState } from "react";
import { api } from "../api";
import type { CnpjLookupResult } from "../types/cnpj";
import { isCnpjLength, onlyDigits } from "../utils/cnpj";
import { normalizeCnpjLookupResult } from "../utils/cnpjLookupClient";

export function useCnpjLookup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSuccessDigits = useRef<string>("");

  const lookup = useCallback(async (raw: string): Promise<CnpjLookupResult | null> => {
    const digits = onlyDigits(raw);
    if (!isCnpjLength(digits)) {
      setError(null);
      return null;
    }
    if (lastSuccessDigits.current === digits) {
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api(`/api/cnpj/${digits}`);
      const text = await res.text();
      let body: unknown = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        setError("Resposta inválida do servidor. Reinicie o npm run dev e tente de novo.");
        return null;
      }

      if (!res.ok) {
        const errObj = body as { error?: string };
        setError(typeof errObj.error === "string" ? errObj.error : "Não foi possível consultar o CNPJ");
        return null;
      }

      const normalized = normalizeCnpjLookupResult(body);
      if (!normalized) {
        setError("Dados do CNPJ incompletos. Preencha os campos manualmente.");
        return null;
      }
      lastSuccessDigits.current = digits;
      return normalized;
    } catch {
      setError("Falha de rede ao consultar CNPJ");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetLookupCache = useCallback(() => {
    lastSuccessDigits.current = "";
    setError(null);
  }, []);

  return { lookup, loading, error, resetLookupCache, setError };
}
