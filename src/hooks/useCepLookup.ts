import { useCallback, useRef, useState } from "react";
import { api } from "../api";
import type { CepLookupResult } from "../types/cep";
import { onlyDigits } from "../utils/cnpj";

export function useCepLookup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, CepLookupResult>>(new Map());

  const lookup = useCallback(async (rawCep: string): Promise<CepLookupResult | null> => {
    const digits = onlyDigits(rawCep);
    if (digits.length !== 8) {
      setError("Informe um CEP com 8 dígitos");
      return null;
    }

    const cached = cacheRef.current.get(digits);
    if (cached) return cached;

    setLoading(true);
    setError(null);
    try {
      const res = await api(`/api/cep/${digits}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "CEP não encontrado");
      }
      const result = data as CepLookupResult;
      cacheRef.current.set(digits, result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao consultar CEP");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetLookupCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return { lookup, loading, error, setError, resetLookupCache };
}
