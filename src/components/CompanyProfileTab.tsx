import React, { useEffect, useState } from "react";
import { CompanyProfile } from "../types";
import { Save, Upload, Building2, Phone, MapPin, FileCheck, CircleAlert, Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { CnpjLookupInput } from "./CnpjLookupInput";
import { CepLookupInput } from "./CepLookupInput";
import { BrMaskedInput } from "./BrMaskedInput";
import type { CnpjLookupResult } from "../types/cnpj";
import type { CepLookupResult } from "../types/cep";

interface CompanyProfileTabProps {
  companies: CompanyProfile[];
  onCompaniesChange: (list: CompanyProfile[]) => void;
}

const emptyCompany = (): CompanyProfile => ({
  nome_empresa: "",
  nome_fantasia: "",
  cnpj: "",
  inscricao_estadual: "",
  endereco: "",
  endereco_logradouro: "",
  endereco_numero: "",
  endereco_complemento: "",
  endereco_bairro: "",
  endereco_cidade: "",
  endereco_estado: "",
  telefone: "",
  email: "",
  cep: "",
  logo_base64: "",
});

export function CompanyProfileTab({ companies, onCompaniesChange }: CompanyProfileTabProps) {
  const [selectedId, setSelectedId] = useState<number | null>(companies[0]?.id ?? null);
  const [formData, setFormData] = useState<CompanyProfile>({ ...emptyCompany(), ...companies[0] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (isNew) return;
    const current = companies.find((c) => c.id === selectedId) ?? companies[0];
    if (current) {
      setFormData({ ...emptyCompany(), ...current });
      if (current.id) setSelectedId(current.id);
    }
  }, [companies, selectedId, isNew]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const applyCepLookup = (data: CepLookupResult) => {
    setFormData((prev) => ({
      ...prev,
      cep: data.cep,
      endereco_logradouro: data.logradouro || prev.endereco_logradouro,
      endereco_complemento: data.complemento || prev.endereco_complemento,
      endereco_bairro: data.bairro || prev.endereco_bairro,
      endereco_cidade: data.cidade || prev.endereco_cidade,
      endereco_estado: data.estado || prev.endereco_estado,
    }));
    setMessage({ type: "success", text: "Endereço preenchido pelo CEP. Confira o número e salve." });
  };

  const applyCnpjLookup = (data: CnpjLookupResult) => {
    setFormData((prev) => ({
      ...prev,
      cnpj: data.cnpj,
      nome_empresa: data.razao_social || prev.nome_empresa,
      nome_fantasia: data.nome_fantasia || prev.nome_fantasia,
      cep: data.cep || prev.cep,
      endereco_logradouro: data.logradouro || prev.endereco_logradouro,
      endereco_numero: data.numero || prev.endereco_numero,
      endereco_complemento: data.complemento || prev.endereco_complemento,
      endereco_bairro: data.bairro || prev.endereco_bairro,
      endereco_cidade: data.cidade || prev.endereco_cidade,
      endereco_estado: data.estado || prev.endereco_estado,
      telefone: data.telefone || prev.telefone,
    }));
    setMessage({
      type: "success",
      text: "Dados do CNPJ preenchidos. Revise e clique em Salvar empresa.",
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Logotipo excedeu 2MB." });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, logo_base64: reader.result as string }));
      setMessage({ type: "success", text: "Logo carregado. Clique em Salvar empresa." });
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Logotipo excedeu 2MB." });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, logo_base64: reader.result as string }));
      setMessage({ type: "success", text: "Logo carregado. Clique em Salvar empresa." });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      const payload = isNew ? formData : { ...formData, id: selectedId ?? formData.id };
      const response = await api("/api/company", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Erro ao salvar.");
      }
      const result = await response.json();
      const saved = result.company as CompanyProfile;
      onCompaniesChange(
        isNew
          ? [...companies, saved].sort((a, b) =>
              (a.nome_fantasia || a.nome_empresa || "").localeCompare(b.nome_fantasia || b.nome_empresa || "")
            )
          : companies.map((c) => (c.id === saved.id ? saved : c))
      );
      setSelectedId(saved.id ?? null);
      setIsNew(false);
      setFormData({ ...emptyCompany(), ...saved });
      setMessage({ type: "success", text: "Empresa salva com sucesso!" });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const startNew = () => {
    setIsNew(true);
    setSelectedId(null);
    setFormData(emptyCompany());
    setMessage(null);
  };

  const handleDelete = async () => {
    if (!selectedId || isNew) return;
    if (!window.confirm("Excluir esta empresa? Só é possível se não houver espelhos vinculados.")) return;
    try {
      const res = await api(`/api/companies/${selectedId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Erro ao excluir.");
      }
      const next = companies.filter((c) => c.id !== selectedId);
      onCompaniesChange(next);
      setSelectedId(next[0]?.id ?? null);
      setIsNew(false);
      setMessage({ type: "success", text: "Empresa excluída." });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao excluir.",
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Empresas emitentes</h2>
            <p className="text-sm text-gray-500">
              Cadastre uma ou mais empresas. Na emissão do espelho você escolhe qual usar.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nova empresa
        </button>
      </div>

      {companies.length > 0 && !isNew && (
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setIsNew(false);
                setSelectedId(c.id ?? null);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border cursor-pointer transition ${
                selectedId === c.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {c.nome_fantasia?.trim() || c.nome_empresa || `Empresa ${c.id}`}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-150 p-6 md:p-8">
        {message && (
          <div
            className={`p-4 rounded-xl mb-6 flex items-start gap-3 text-sm font-medium ${
              message.type === "success"
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.type === "success" ? (
              <FileCheck className="w-5 h-5 shrink-0" />
            ) : (
              <CircleAlert className="w-5 h-5 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-4 flex flex-col items-center">
              <span className="text-sm font-bold text-gray-700 mb-2">Logotipo</span>
              <div
                onDragOver={onDragOver}
                onDrop={onDrop}
                className="w-40 h-40 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden"
              >
                {formData.logo_base64 ? (
                  <img src={formData.logo_base64} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <Upload className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                id="logo_file_input"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <label
                htmlFor="logo_file_input"
                className="mt-2 text-xs text-blue-600 font-semibold cursor-pointer hover:underline"
              >
                Enviar imagem
              </label>
            </div>

            <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <CnpjLookupInput
                  value={formData.cnpj}
                  onChange={(v) => setFormData((p) => ({ ...p, cnpj: v }))}
                  onFetched={applyCnpjLookup}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Razão social</label>
                <input
                  name="nome_empresa"
                  required
                  value={formData.nome_empresa}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nome fantasia</label>
                <input
                  name="nome_fantasia"
                  value={formData.nome_fantasia}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Inscrição estadual</label>
                <input
                  name="inscricao_estadual"
                  value={formData.inscricao_estadual}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> Telefone
                </label>
                <BrMaskedInput
                  mask="phone"
                  value={formData.telefone}
                  onChange={(v) => setFormData((p) => ({ ...p, telefone: v }))}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">E-mail</label>
                <input
                  name="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Endereço
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <CepLookupInput
                value={formData.cep || ""}
                onChange={(v) => setFormData((p) => ({ ...p, cep: v }))}
                onFetched={applyCepLookup}
              />
              <input
                name="endereco_logradouro"
                placeholder="Logradouro"
                value={formData.endereco_logradouro || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                name="endereco_numero"
                placeholder="Número"
                value={formData.endereco_numero || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                name="endereco_bairro"
                placeholder="Bairro"
                value={formData.endereco_bairro || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                name="endereco_cidade"
                placeholder="Cidade"
                value={formData.endereco_cidade || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                name="endereco_estado"
                placeholder="UF"
                maxLength={2}
                value={formData.endereco_estado || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm uppercase"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? "Salvando…" : isNew ? "Cadastrar empresa" : "Salvar empresa"}
            </button>
            {!isNew && selectedId && companies.length > 1 && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-700 rounded-xl text-sm font-semibold hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
