import React, { useRef } from "react";
import { Loader2, Search } from "lucide-react";
import { useCnpjLookup } from "../hooks/useCnpjLookup";
import type { CnpjLookupResult } from "../types/cnpj";
import { formatCnpj, formatCpfOrCnpj, isCnpjLength, onlyDigits } from "../utils/cnpj";

interface CnpjLookupInputProps {
  value: string;
  onChange: (value: string) => void;
  onFetched: (data: CnpjLookupResult) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  name?: string;
  id?: string;
  required?: boolean;
  autoLookup?: boolean;
  allowCpf?: boolean;
}

export function CnpjLookupInput({
  value,
  onChange,
  onFetched,
  label = "CNPJ",
  placeholder = "00.000.000/0000-00",
  className = "",
  inputClassName = "w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition",
  name,
  id,
  required,
  autoLookup = true,
  allowCpf = false,
}: CnpjLookupInputProps) {
  const { lookup, loading, error, resetLookupCache, setError } = useCnpjLookup();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedDigits = useRef<string>("");
  const safeValue = value ?? "";

  const applyResult = (data: CnpjLookupResult) => {
    const digits = onlyDigits(data.cnpj);
    lastAppliedDigits.current = digits;
    try {
      onFetched(data);
    } catch (err) {
      console.error("CNPJ onFetched error:", err);
      setError("Erro ao preencher os campos. Tente novamente.");
    }
  };

  const runLookup = async (raw: string) => {
    const digits = onlyDigits(raw);
    if (!isCnpjLength(digits)) return;
    if (lastAppliedDigits.current === digits) return;

    const data = await lookup(raw);
    if (data) applyResult(data);
  };

  const scheduleLookup = (raw: string) => {
    if (!autoLookup) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runLookup(raw);
    }, 800);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = allowCpf
      ? formatCpfOrCnpj(e.target.value)
      : formatCnpj(e.target.value);
    const prevDigits = onlyDigits(safeValue);
    const nextDigits = onlyDigits(formatted);
    if (prevDigits !== nextDigits) {
      resetLookupCache();
      lastAppliedDigits.current = "";
    }
    onChange(formatted);
    setError(null);
    if (isCnpjLength(formatted)) {
      scheduleLookup(formatted);
    }
  };

  const handleBlur = () => {
    const formatted = allowCpf ? formatCpfOrCnpj(safeValue) : formatCnpj(safeValue);
    if (formatted !== safeValue) onChange(formatted);
    if (isCnpjLength(formatted)) void runLookup(formatted);
  };

  return (
    <div className={className}>
      {label ? (
        <label className="block text-xs font-bold text-gray-600 uppercase mb-1" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          type="text"
          name={name}
          id={id}
          required={required}
          value={safeValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          autoComplete="off"
          inputMode="numeric"
          className={`${inputClassName} pr-10`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 opacity-50" />}
        </div>
      </div>
      {loading && (
        <p className="text-xs text-emerald-700 mt-1">Consultando Receita Federal…</p>
      )}
      {!loading && error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {!loading && !error && isCnpjLength(safeValue) && (
        <p className="text-xs text-slate-500 mt-1">Os dados serão preenchidos automaticamente.</p>
      )}
    </div>
  );
}
