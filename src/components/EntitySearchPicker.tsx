import React, { useMemo, useState } from "react";
import { formatCpfOrCnpj, formatPlaca } from "../utils/cnpj";
import { Search, User, Check, X, Plus } from "lucide-react";
import { inputClass, labelClass } from "../styles/forms";

export interface SearchableItem {
  id?: number;
  nome?: string;
  placa?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cnpj_cpf?: string;
  cpf?: string;
  telefone?: string;
  inscricao_estadual?: string;
  vehicle_id?: number | null;
  agente_id?: number | null;
  agente_nome?: string;
}

interface EntitySearchPickerProps {
  label: string;
  placeholder?: string;
  items: SearchableItem[];
  selected: SearchableItem | null;
  onSelect: (item: SearchableItem) => void;
  onClear: () => void;
  mode?: "person" | "vehicle" | "name";
  emptyHint?: string;
  allowQuickAdd?: boolean;
  onQuickAdd?: (data: SearchableItem) => Promise<void>;
  /** Altura máxima da lista de resultados (ex.: em modal use max-h-32). */
  listClassName?: string;
}

function primaryLabel(item: SearchableItem, mode: "person" | "vehicle" | "name") {
  if (mode === "vehicle") return item.placa || "—";
  return item.nome || "—";
}

function secondaryLabel(item: SearchableItem, mode: "person" | "vehicle" | "name") {
  if (mode === "name") return "";
  if (mode === "vehicle") {
    return [item.cidade, item.estado].filter(Boolean).join(" / ") || "Sem cidade";
  }
  const doc = item.cnpj_cpf || item.cpf;
  const loc = [item.cidade, item.estado].filter(Boolean).join("-");
  const placa = item.placa ? `Placa ${item.placa}` : "";
  return [doc, placa, loc].filter(Boolean).join(" · ") || item.endereco || "";
}

export function EntitySearchPicker({
  label,
  placeholder = "Buscar por nome, CPF, CNPJ ou cidade…",
  items,
  selected,
  onSelect,
  onClear,
  mode = "person" as "person" | "vehicle" | "name",
  emptyHint = "Nenhum cadastro encontrado. Cadastre em Cadastros ou adicione abaixo.",
  allowQuickAdd = false,
  onQuickAdd,
  listClassName = "max-h-48",
}: EntitySearchPickerProps) {
  const [query, setQuery] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickNome, setQuickNome] = useState("");
  const [quickDoc, setQuickDoc] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter((item) => {
        const blob = [
          item.nome,
          item.placa,
          item.endereco,
          item.cidade,
          item.estado,
          item.cnpj_cpf,
          item.cpf,
          item.telefone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 50);
  }, [items, query]);

  const handleQuickAdd = async () => {
    if (!onQuickAdd || !quickNome.trim()) return;
    setSaving(true);
    try {
      const payload: SearchableItem =
        mode === "vehicle"
          ? { placa: formatPlaca(quickNome.trim()), cidade: "", estado: "" }
          : mode === "name"
            ? { nome: quickNome.trim() }
            : { nome: quickNome.trim(), cnpj_cpf: formatCpfOrCnpj(quickDoc.trim()) };
      await onQuickAdd(payload);
      setShowQuickAdd(false);
      setQuickNome("");
      setQuickDoc("");
      setQuery("");
    } finally {
      setSaving(false);
    }
  };

  const isSelected =
    mode === "vehicle" ? !!selected?.placa?.trim() : !!selected?.nome?.trim();

  if (isSelected && selected) {
    return (
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">{label}</p>
              <p className="font-semibold text-slate-900 truncate">
                {primaryLabel(selected, mode)}
              </p>
              {secondaryLabel(selected, mode) ? (
                <p className="text-xs text-slate-600 truncate">
                  {secondaryLabel(selected, mode)}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="p-2 text-slate-500 hover:bg-white rounded-lg cursor-pointer shrink-0"
            title="Trocar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} pl-10`}
          autoComplete="off"
        />
      </div>

      <div
        className={`${listClassName} overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white divide-y divide-slate-100`}
      >
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 text-center">{emptyHint}</p>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id ?? `${item.nome}-${item.placa}`}
              type="button"
              onClick={() => {
                onSelect(item);
                setQuery("");
              }}
              className="w-full text-left px-4 py-3 hover:bg-emerald-50 flex items-center gap-3 cursor-pointer transition"
            >
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 truncate">
                  {primaryLabel(item, mode)}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {secondaryLabel(item, mode)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {allowQuickAdd && onQuickAdd && (
        <div className="pt-1">
          {!showQuickAdd ? (
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Cadastrar novo rapidamente
            </button>
          ) : (
            <div className="p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-2">
              <input
                className={inputClass}
                placeholder={mode === "vehicle" ? "Placa" : "Nome"}
                value={quickNome}
                inputMode={mode === "vehicle" ? "text" : undefined}
                autoComplete="off"
                onChange={(e) =>
                  setQuickNome(mode === "vehicle" ? formatPlaca(e.target.value) : e.target.value)
                }
              />
              {mode === "person" && (
                <input
                  className={inputClass}
                  placeholder="CPF ou CNPJ (opcional)"
                  value={quickDoc}
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(e) => setQuickDoc(formatCpfOrCnpj(e.target.value))}
                  onBlur={() => {
                    if (quickDoc.trim()) setQuickDoc(formatCpfOrCnpj(quickDoc));
                  }}
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleQuickAdd}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Salvando…" : "Salvar e usar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="px-3 py-1.5 text-slate-600 text-xs cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
