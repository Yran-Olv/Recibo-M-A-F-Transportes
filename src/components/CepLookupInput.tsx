import React, { useRef } from "react";
import { Loader2, Search } from "lucide-react";
import { useCepLookup } from "../hooks/useCepLookup";
import type { CepLookupResult } from "../types/cep";
import { BrMaskedInput } from "./BrMaskedInput";
import { onlyDigits } from "../utils/cnpj";

interface CepLookupInputProps {
  value: string;
  onChange: (value: string) => void;
  onFetched: (data: CepLookupResult) => void;
  label?: string;
  className?: string;
  inputClassName?: string;
  autoLookup?: boolean;
}

export function CepLookupInput({
  value,
  onChange,
  onFetched,
  label = "CEP",
  className = "",
  inputClassName = "w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition",
  autoLookup = true,
}: CepLookupInputProps) {
  const { lookup, loading, error, setError, resetLookupCache } = useCepLookup();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedDigits = useRef("");

  const runLookup = async (raw: string) => {
    const digits = onlyDigits(raw);
    if (digits.length !== 8) return;
    if (lastAppliedDigits.current === digits) return;
    const data = await lookup(raw);
    if (data) {
      lastAppliedDigits.current = digits;
      onFetched(data);
    }
  };

  const scheduleLookup = (raw: string) => {
    if (!autoLookup) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runLookup(raw), 700);
  };

  return (
    <div className={className}>
      <label className="block text-xs font-bold text-gray-600 uppercase mb-1">{label}</label>
      <div className="flex gap-2">
        <BrMaskedInput
          mask="cep"
          value={value}
          onChange={(cep) => {
            const prev = onlyDigits(value);
            const next = onlyDigits(cep);
            if (prev !== next) {
              resetLookupCache();
              lastAppliedDigits.current = "";
            }
            onChange(cep);
            setError(null);
            scheduleLookup(cep);
          }}
          className={`flex-1 ${inputClassName}`}
          placeholder="00000-000"
        />
        <button
          type="button"
          onClick={() => void runLookup(value)}
          disabled={loading || onlyDigits(value).length !== 8}
          className="shrink-0 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-50 cursor-pointer"
          title="Buscar endereço pelo CEP"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </div>
      {error ? <p className="text-xs text-red-600 mt-1">{error}</p> : null}
      <p className="text-[10px] text-gray-500 mt-1">Preenche rua, bairro, cidade e UF automaticamente.</p>
    </div>
  );
}
