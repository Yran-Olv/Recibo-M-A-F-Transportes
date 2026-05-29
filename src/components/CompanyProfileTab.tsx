import React, { useEffect, useState } from "react";
import { CompanyProfile } from "../types";
import { Save, Upload, Building2, Phone, MapPin, FileCheck, CircleAlert } from "lucide-react";
import { api } from "../api";
import { CnpjLookupInput } from "./CnpjLookupInput";
import { CepLookupInput } from "./CepLookupInput";
import { BrMaskedInput } from "./BrMaskedInput";
import type { CnpjLookupResult } from "../types/cnpj";
import type { CepLookupResult } from "../types/cep";

interface CompanyProfileTabProps {
  company: CompanyProfile;
  onSaveCompany: (updated: CompanyProfile) => void;
}

export function CompanyProfileTab({ company, onSaveCompany }: CompanyProfileTabProps) {
  const [formData, setFormData] = useState<CompanyProfile>({ ...company });

  useEffect(() => {
    setFormData({ ...company });
  }, [company]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
      text: "Dados do CNPJ carregados. Revise o endereço e clique em Salvar.",
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Erro: Logotipo excedeu o limite máximo de 2MB." });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, logo_base64: reader.result as string }));
      setMessage({ type: "success", text: "Imagem carregada com sucesso! Clique em 'Salvar Configurações'." });
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Apenas arquivos de imagem são permitidos." });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Erro: Logotipo excedeu o limite de 2MB." });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, logo_base64: reader.result as string }));
      setMessage({ type: "success", text: "Logotipo arrastado e carregado! Não esqueça de Salvar." });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await api("/api/company", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Erro ao salvar dados.");

      const result = await response.json();
      onSaveCompany(result.company);
      setMessage({ type: "success", text: "Dados da empresa atualizados com sucesso!" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro desconhecido." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-150 p-6 md:p-8 animate-fade-in">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-5 mb-6">
        <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Perfil da Empresa Emitente</h2>
          <p className="text-sm text-gray-500">Dados e logotipo exibidos no cabeçalho de cada espelho de frete impresso.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl mb-6 flex items-start gap-3 text-sm font-medium ${
          message.type === "success" ? "bg-blue-50 text-blue-800 border border-blue-200" : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {message.type === "success" ? <FileCheck className="w-5 h-5 flex-shrink-0" /> : <CircleAlert className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* LOGO UPLOAD COMPONENT */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-4 flex flex-col items-center">
            <span className="text-sm font-bold text-gray-700 mb-2">Logotipo da Empresa</span>
            <div 
              onDragOver={onDragOver}
              onDrop={onDrop}
              className="w-full h-40 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center bg-gray-50 cursor-pointer hover:bg-gray-100/50 hover:border-blue-400 transition-all p-3 relative group"
            >
              {formData.logo_base64 ? (
                <div className="absolute inset-0 p-3 flex items-center justify-center">
                  <img 
                    src={formData.logo_base64} 
                    alt="Logo" 
                    className="max-w-full max-h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                    <span className="text-xs font-semibold flex items-center gap-1">
                      <Upload className="w-4 h-4" /> Alterar Logo
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center flex flex-col items-center">
                  <Upload className="w-8 h-8 text-gray-400 mb-1.5" />
                  <span className="text-[11px] font-bold text-gray-700">Arrastar Imagem</span>
                  <span className="text-[10px] text-gray-400">ou clicar para pesquisar</span>
                </div>
              )}
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleLogoUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                id="logo_file_input"
              />
            </div>
          </div>

          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Razão Social</label>
              <input
                type="text"
                name="nome_empresa"
                required
                value={formData.nome_empresa}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Razão social"
                id="nome_empresa_input"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nome Fantasia (Subtítulo)</label>
              <input
                type="text"
                name="nome_fantasia"
                value={formData.nome_fantasia || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Nome fantasia (opcional)"
                id="nome_fantasia_input"
              />
            </div>

            <CnpjLookupInput
              name="cnpj"
              id="cnpj_input"
              required
              label="CNPJ"
              value={formData.cnpj}
              onChange={(cnpj) => setFormData((prev) => ({ ...prev, cnpj }))}
              onFetched={applyCnpjLookup}
            />

            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Inscrição Estadual (I.E.)</label>
              <input
                type="text"
                name="inscricao_estadual"
                value={formData.inscricao_estadual || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Isento ou nº"
                id="inscricao_estadual_input"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <MapPin className="w-4 h-4 text-blue-600" />
            Endereço da empresa
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Informe o CEP para preencher rua, bairro, cidade e UF. O espelho impresso usa duas linhas,
            sem repetir CEP.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-4">
              <CepLookupInput
                value={formData.cep || ""}
                onChange={(cep) => setFormData((prev) => ({ ...prev, cep }))}
                onFetched={applyCepLookup}
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Logradouro / Rua</label>
              <input
                type="text"
                name="endereco_logradouro"
                required
                value={formData.endereco_logradouro || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Ex.: Rua Lisboa"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Número</label>
              <input
                type="text"
                name="endereco_numero"
                value={formData.endereco_numero || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="278"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Complemento</label>
              <input
                type="text"
                name="endereco_complemento"
                value={formData.endereco_complemento || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Sala, bloco…"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Bairro</label>
              <input
                type="text"
                name="endereco_bairro"
                value={formData.endereco_bairro || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Jardim Imperial"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Cidade</label>
              <input
                type="text"
                name="endereco_cidade"
                required
                value={formData.endereco_cidade || ""}
                onChange={handleInputChange}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="Cidade"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">UF</label>
              <input
                type="text"
                name="endereco_estado"
                required
                maxLength={2}
                value={formData.endereco_estado || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    endereco_estado: e.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="MG"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-6">
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Telefone de Contato</label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <BrMaskedInput
                mask="phone"
                name="telefone"
                id="telefone_input"
                value={formData.telefone || ""}
                onChange={(telefone) => setFormData((prev) => ({ ...prev, telefone }))}
                className="w-full pl-9 pr-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <div className="sm:col-span-6">
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">E-mail</label>
            <input
              type="email"
              name="email"
              value={formData.email || ""}
              onChange={handleInputChange}
              className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
              placeholder="email@empresa.com.br"
            />
          </div>
        </div>

        <div className="border-t border-gray-150 pt-5 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer transition disabled:opacity-50 shadow-md shadow-blue-600/10"
            id="company_save_btn"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? "Autenticando..." : "Salvar Configurações"}
          </button>
        </div>
      </form>
    </div>
  );
}
