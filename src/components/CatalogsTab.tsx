import React, { useState } from "react";
import { CatalogItem, DriverSavePayload } from "../types";
import { Users, Truck, Sparkles, MapPin, Search, PlusCircle, UserCheck, Trash2, FileText, UserRound, Pencil } from "lucide-react";
import { api } from "../api";
import { CnpjLookupInput } from "./CnpjLookupInput";
import { BrMaskedInput } from "./BrMaskedInput";
import { AppDialog, type AppDialogVariant } from "./AppDialog";
import type { CnpjLookupResult } from "../types/cnpj";

type DialogState = {
  open: boolean;
  variant: AppDialogVariant;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void;
};

interface CatalogsTabProps {
  senders: CatalogItem[];
  recipients: CatalogItem[];
  drivers: CatalogItem[];
  vehicles: CatalogItem[];
  faturas: CatalogItem[];
  agentes: CatalogItem[];
  onAddSender: (item: CatalogItem) => void;
  onAddRecipient: (item: CatalogItem) => void;
  onAddDriver: (item: CatalogItem) => void;
  onAddVehicle: (item: CatalogItem) => void;
  onAddFatura: (item: CatalogItem) => void;
  onAddAgente: (item: CatalogItem) => void;
  onDeleteSender?: (id: number) => void;
  onDeleteRecipient?: (id: number) => void;
  onDeleteDriver?: (id: number) => void;
  onDeleteVehicle?: (id: number) => void;
  onDeleteFatura?: (id: number) => void;
  onDeleteAgente?: (id: number) => void;
}

type CatalogType = "senders" | "recipients" | "fleet" | "faturas" | "agentes";
type VehicleLinkMode = "new" | "existing" | "none";

function catalogApiKey(
  active: CatalogType
): "senders" | "recipients" | "drivers" | "vehicles" | "faturas" | "agentes" {
  if (active === "fleet") return "drivers";
  return active;
}

export function CatalogsTab({
  senders,
  recipients,
  drivers,
  vehicles,
  faturas,
  agentes,
  onAddSender,
  onAddRecipient,
  onAddDriver,
  onAddVehicle,
  onAddFatura,
  onAddAgente,
  onDeleteSender,
  onDeleteRecipient,
  onDeleteDriver,
  onDeleteVehicle,
  onDeleteFatura,
  onDeleteAgente,
}: CatalogsTabProps) {
  const [activeCatalog, setActiveCatalog] = useState<CatalogType>("senders");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cnpjCpf, setCnpjCpf] = useState("");
  const [ie, setIe] = useState("");
  const [placa, setPlaca] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [vehicleLink, setVehicleLink] = useState<VehicleLinkMode>("new");
  const [existingVehicleId, setExistingVehicleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    variant: "info",
    title: "",
    message: "",
  });

  const showDialog = (
    variant: AppDialogVariant,
    title: string,
    message: string,
    opts?: { confirmLabel?: string; onConfirm?: () => void }
  ) => {
    setDialog({
      open: true,
      variant,
      title,
      message,
      confirmLabel: opts?.confirmLabel,
      onConfirm: opts?.onConfirm,
    });
  };

  const closeDialog = () => setDialog((d) => ({ ...d, open: false }));

  const resetCatalogForm = () => {
    setNome("");
    setEndereco("");
    setCidade("");
    setEstado("");
    setCnpjCpf("");
    setIe("");
    setPlaca("");
    setCpf("");
    setTelefone("");
    setVehicleLink("new");
    setExistingVehicleId("");
    setEditingId(null);
  };

  const startEdit = (item: CatalogItem) => {
    setEditingId(item.id ?? null);
    setShowAddForm(true);
    setNome(item.nome || "");
    if (activeCatalog === "fleet") {
      setCpf(item.cpf || "");
      setTelefone(item.telefone || "");
      setPlaca(item.placa || "");
      setCidade(item.cidade || "");
      setEstado(item.estado || "");
      if (item.vehicle_id) {
        setVehicleLink("existing");
        setExistingVehicleId(String(item.vehicle_id));
      } else if (item.placa?.trim()) {
        setVehicleLink("new");
        setExistingVehicleId("");
      } else {
        setVehicleLink("none");
        setExistingVehicleId("");
      }
      setEndereco("");
      setCnpjCpf("");
      setIe("");
      return;
    }
    if (activeCatalog === "faturas" || activeCatalog === "agentes") {
      setEndereco("");
      setCidade("");
      setEstado("");
      setCnpjCpf("");
      setIe("");
      return;
    }
    setEndereco(item.endereco || "");
    setCidade(item.cidade || "");
    setEstado(item.estado || "");
    setCnpjCpf(item.cnpj_cpf || "");
    setIe(item.inscricao_estadual || "");
  };

  const cancelForm = () => {
    resetCatalogForm();
    setShowAddForm(false);
  };

  const applyCatalogCnpj = (data: CnpjLookupResult) => {
    setNome(data.razao_social || "");
    setEndereco(data.endereco || "");
    setCidade(data.cidade || "");
    setEstado(data.estado || "");
    setCnpjCpf(data.cnpj || "");
  };

  const catalogKey = catalogApiKey(activeCatalog);

  const switchCatalog = (type: CatalogType) => {
    setActiveCatalog(type);
    setSearchTerm("");
    setShowAddForm(false);
    resetCatalogForm();
  };

  const toggleAddForm = () => {
    setShowAddForm((prev) => {
      if (prev) {
        resetCatalogForm();
        return false;
      }
      resetCatalogForm();
      return true;
    });
  };

  const isEditing = editingId != null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (activeCatalog === "fleet") {
        if (!nome.trim()) {
          showDialog("error", "Campo obrigatório", "Informe o nome do motorista.");
          return;
        }
        if (vehicleLink === "new" && !placa.trim()) {
          showDialog("error", "Campo obrigatório", "Informe a placa do caminhão do motorista.");
          return;
        }
        if (vehicleLink === "existing" && !existingVehicleId) {
          showDialog("error", "Campo obrigatório", "Selecione o caminhão já cadastrado para associar.");
          return;
        }

        const body: DriverSavePayload = {
          nome: nome.trim(),
          cpf: cpf.trim(),
          telefone: telefone.trim(),
          vehicle_link: vehicleLink,
          vehicle_id: vehicleLink === "existing" ? Number(existingVehicleId) : undefined,
          placa: vehicleLink === "new" ? placa.trim() : undefined,
          cidade: vehicleLink === "new" ? cidade.trim() : undefined,
          estado: vehicleLink === "new" ? estado.trim().toUpperCase() : undefined,
        };

        const driverUrl = isEditing ? `/api/catalog/drivers/${editingId}` : "/api/catalog/drivers";
        const response = await api(driverUrl, {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Erro ao salvar motorista");
        }
        const savedItem = (await response.json()) as CatalogItem;
        onAddDriver(savedItem);
        if (savedItem.vehicle_id && savedItem.placa) {
          onAddVehicle({
            id: savedItem.vehicle_id,
            placa: savedItem.placa,
            cidade: savedItem.cidade,
            estado: savedItem.estado,
          });
        }
      } else if (activeCatalog === "faturas" || activeCatalog === "agentes") {
        if (!nome.trim()) {
          showDialog("error", "Campo obrigatório", "Informe o nome.");
          return;
        }
        const simpleUrl = isEditing
          ? `/api/catalog/${activeCatalog}/${editingId}`
          : `/api/catalog/${activeCatalog}`;
        const response = await api(simpleUrl, {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify({ nome: nome.trim() }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Erro ao salvar");
        }
        const savedItem = await response.json();
        if (activeCatalog === "faturas") onAddFatura(savedItem);
        else onAddAgente(savedItem);
      } else {
        if (!nome.trim()) {
          showDialog("error", "Campo obrigatório", "Informe o nome da empresa ou produtor.");
          return;
        }
        const payload: CatalogItem = {
          nome: nome.trim(),
          endereco: endereco.trim(),
          cidade: cidade.trim(),
          estado: estado.trim().toUpperCase(),
          cnpj_cpf: cnpjCpf.trim(),
          inscricao_estadual: ie.trim(),
        };

        const personUrl = isEditing
          ? `/api/catalog/${catalogKey}/${editingId}`
          : `/api/catalog/${catalogKey}`;
        const response = await api(personUrl, {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Erro ao salvar item");
        }
        const savedItem = await response.json();
        if (catalogKey === "senders") onAddSender(savedItem);
        else onAddRecipient(savedItem);
      }

      resetCatalogForm();
      setShowAddForm(false);
      const label =
        activeCatalog === "fleet"
          ? "Motorista"
          : activeCatalog === "faturas"
            ? "Fatura"
            : activeCatalog === "agentes"
              ? "Agente"
              : activeCatalog === "recipients"
                ? "Destinatário"
                : "Remetente";
      showDialog(
        "success",
        isEditing ? "Alterações salvas" : "Cadastro realizado",
        `${label} salvo com sucesso.`
      );
    } catch (err) {
      console.error("Erro ao registrar catalogo:", err);
      showDialog(
        "error",
        "Não foi possível salvar",
        err instanceof Error ? err.message : "Ocorreu um erro ao salvar o registro no catálogo."
      );
    } finally {
      setSaving(false);
    }
  };

  const RowActions = ({ item, label }: { item: CatalogItem; label: string }) => (
    <td className="px-2 py-3">
      {item.id != null && (
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => startEdit(item)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(item.id!, label)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
            title="Excluir"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </td>
  );

  const handleDelete = (id: number, label: string) => {
    showDialog("confirm", "Excluir cadastro", `Excluir "${label}" do catálogo?`, {
      confirmLabel: "Excluir",
      onConfirm: async () => {
        closeDialog();
        const path = `/api/catalog/${catalogKey}/${id}`;
        try {
          const res = await api(path, { method: "DELETE" });
          if (!res.ok) throw new Error();
          const data = await res.json();
          if (!data.success) {
            showDialog("error", "Não encontrado", "Registro não encontrado.");
            return;
          }
          if (catalogKey === "senders") onDeleteSender?.(id);
          else if (catalogKey === "recipients") onDeleteRecipient?.(id);
          else if (catalogKey === "drivers") onDeleteDriver?.(id);
          else if (catalogKey === "vehicles") onDeleteVehicle?.(id);
          else if (catalogKey === "faturas") onDeleteFatura?.(id);
          else onDeleteAgente?.(id);
          showDialog("success", "Excluído", `"${label}" removido do catálogo.`);
        } catch {
          showDialog("error", "Erro ao excluir", "Não foi possível excluir o cadastro.");
        }
      },
    });
  };

  const getActiveList = (): CatalogItem[] => {
    if (activeCatalog === "fleet") return drivers;
    switch (catalogKey) {
      case "senders": return senders;
      case "recipients": return recipients;
      case "faturas": return faturas;
      case "agentes": return agentes;
      default: return [];
    }
  };

  const catalogTitle =
    activeCatalog === "senders"
      ? "Remetentes"
      : activeCatalog === "recipients"
        ? "Destinatários"
        : activeCatalog === "faturas"
          ? "Faturas"
          : activeCatalog === "agentes"
            ? "Agentes"
            : "Motoristas e veículos";

  const isSimpleNameCatalog = activeCatalog === "faturas" || activeCatalog === "agentes";

  const filteredItems = getActiveList().filter(item => {
    const textStr = searchTerm.toLowerCase();
    const nameMatch = item.nome?.toLowerCase().includes(textStr);
    const placeMatch = item.placa?.toLowerCase().includes(textStr);
    const cityMatch = item.cidade?.toLowerCase().includes(textStr);
    const documentMatch = (item.cnpj_cpf || item.cpf || "").includes(textStr);
    return nameMatch || placeMatch || cityMatch || documentMatch;
  });

  return (
    <>
    <AppDialog
      open={dialog.open}
      variant={dialog.variant}
      title={dialog.title}
      message={dialog.message}
      confirmLabel={dialog.confirmLabel}
      onClose={closeDialog}
      onConfirm={dialog.onConfirm}
    />
    <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 items-start animate-fade-in">
      
      {/* Sidebar Selector (3 cols) */}
      <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-1">
        <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest px-3 mb-2 font-mono">Tabelas</span>
        
        <button
          onClick={() => switchCatalog("senders")}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-sm font-semibold transition cursor-pointer ${
            activeCatalog === "senders" ? "bg-blue-50 text-blue-850" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center gap-3 border-l-2 border-transparent pl-0">
            <Users className="w-4 h-4 text-blue-600" />
            <span>Remetentes</span>
          </div>
          <span className="text-[10px] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono font-bold text-blue-800 shrink-0">
            {senders.length}
          </span>
        </button>

        <button
          onClick={() => switchCatalog("recipients")}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-sm font-semibold transition cursor-pointer ${
            activeCatalog === "recipients" ? "bg-blue-50 text-blue-850" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>Destinatários</span>
          </div>
          <span className="text-[10px] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono font-bold text-blue-800 shrink-0">
            {recipients.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => switchCatalog("fleet")}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-sm font-semibold transition cursor-pointer ${
            activeCatalog === "fleet" ? "bg-blue-50 text-blue-850" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Truck className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="truncate">Motoristas e veículos</span>
          </div>
          <span className="text-[10px] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono font-bold text-blue-800 shrink-0">
            {drivers.length}/{vehicles.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => switchCatalog("faturas")}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-sm font-semibold transition cursor-pointer ${
            activeCatalog === "faturas" ? "bg-blue-50 text-blue-850" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Faturas</span>
          </div>
          <span className="text-[10px] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono font-bold text-blue-800 shrink-0">
            {faturas.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => switchCatalog("agentes")}
          className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left text-sm font-semibold transition cursor-pointer ${
            activeCatalog === "agentes" ? "bg-blue-50 text-blue-850" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <UserRound className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Agentes</span>
          </div>
          <span className="text-[10px] bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono font-bold text-blue-800 shrink-0">
            {agentes.length}
          </span>
        </button>
      </div>

      {/* Main Catalog View (9 cols) */}
      <div className="md:col-span-9 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        
        {/* Header toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5 mb-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 font-display">
              {activeCatalog === "fleet" ? (
                <Truck className="w-5 h-5 text-blue-600" />
              ) : (
                <Sparkles className="w-5 h-5 text-blue-600" />
              )}
              Catálogo de {catalogTitle}
            </h3>
            <p className="text-xs text-gray-500">
              {activeCatalog === "fleet"
                ? "Cadastre motoristas e caminhões (placas) no mesmo lugar."
                : "Cadastre e gerencie perfis para rápido preenchimento dos espelhos de frete."}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAddForm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer transition shadow-sm shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            {showAddForm
              ? "Fechar formulário"
              : activeCatalog === "fleet"
                ? "Novo motorista e caminhão"
                : "Cadastrar novo"}
          </button>
        </div>

        {/* Dynamic add form */}
        {showAddForm && (
          <form
            key={`catalog-add-${catalogKey}`}
            onSubmit={handleCreate}
            autoComplete="off"
            className="bg-gray-50 border border-gray-150 rounded-2xl p-5 mb-6 space-y-4 animate-scale-in"
          >
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">
              {isEditing ? "Editar cadastro" : "Formulário de cadastro"}
            </h4>
            <p className="text-xs text-gray-500 -mt-2">
              {activeCatalog === "fleet"
                ? "Cadastre o motorista e o caminhão no mesmo formulário. Use “caminhão já cadastrado” se outro motorista emprestar o mesmo veículo."
                : activeCatalog === "agentes"
                  ? "Cadastro só dos agentes. Na emissão do espelho você escolhe o agente na etapa Transporte."
                  : activeCatalog === "faturas"
                    ? "Tipos ou nomes de fatura usados no espelho (opcional; o padrão costuma ser o nome do motorista)."
                    : "Preencha apenas com dados reais dos seus clientes."}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeCatalog === "fleet" ? (
                <>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-bold text-gray-700 uppercase mb-2 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-600" />
                      Dados do motorista
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nome completo</label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      placeholder="Nome do motorista"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">CPF</label>
                    <BrMaskedInput
                      mask="cpf"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={setCpf}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Telefone</label>
                    <BrMaskedInput
                      mask="phone"
                      placeholder="(00) 00000-0000"
                      value={telefone}
                      onChange={setTelefone}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>

                  <div className="sm:col-span-2 border-t border-gray-200 pt-4 mt-1 space-y-3">
                    <p className="text-xs font-bold text-gray-700 uppercase">Caminhão deste motorista</p>

                    <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
                      <input
                        type="radio"
                        name="vehicle_link"
                        checked={vehicleLink === "new"}
                        onChange={() => setVehicleLink("new")}
                        className="mt-1"
                      />
                      <span>
                        <strong>Placa do caminhão habitual</strong> (cadastra ou atualiza o veículo)
                      </span>
                    </label>
                    {vehicleLink === "new" && (
                      <div className="grid sm:grid-cols-3 gap-3 pl-6">
                        <div>
                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Placa</label>
                          <BrMaskedInput
                            mask="placa"
                            placeholder="ABC-1D23"
                            value={placa}
                            onChange={setPlaca}
                            className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Cidade</label>
                          <input
                            type="text"
                            autoComplete="off"
                            placeholder="Cidade"
                            value={cidade}
                            onChange={(e) => setCidade(e.target.value)}
                            className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">UF</label>
                          <input
                            type="text"
                            maxLength={2}
                            autoComplete="off"
                            placeholder="UF"
                            value={estado}
                            onChange={(e) => setEstado(e.target.value.toUpperCase())}
                            className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                          />
                        </div>
                      </div>
                    )}

                    <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
                      <input
                        type="radio"
                        name="vehicle_link"
                        checked={vehicleLink === "existing"}
                        onChange={() => setVehicleLink("existing")}
                        className="mt-1"
                      />
                      <span>
                        <strong>Associar caminhão já cadastrado</strong> (ex.: emprestado para este motorista — não duplica a placa)
                      </span>
                    </label>
                    {vehicleLink === "existing" && (
                      <div className="pl-6">
                        <select
                          value={existingVehicleId}
                          onChange={(e) => setExistingVehicleId(e.target.value)}
                          className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                        >
                          <option value="">Selecione a placa…</option>
                          {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.placa} — {v.cidade}/{v.estado}
                            </option>
                          ))}
                        </select>
                        {vehicles.length === 0 && (
                          <p className="text-xs text-amber-700 mt-2">
                            Nenhum caminhão cadastrado ainda. Use a opção “Placa do caminhão habitual” no primeiro motorista.
                          </p>
                        )}
                      </div>
                    )}

                    <label className="flex items-start gap-2 cursor-pointer text-sm text-gray-700">
                      <input
                        type="radio"
                        name="vehicle_link"
                        checked={vehicleLink === "none"}
                        onChange={() => setVehicleLink("none")}
                        className="mt-1"
                      />
                      <span>Cadastrar motorista sem caminhão vinculado agora</span>
                    </label>
                  </div>
                </>
              ) : isSimpleNameCatalog ? (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-600 uppercase mb-1">
                    {activeCatalog === "faturas" ? "Nome da fatura" : "Nome do agente"}
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    placeholder={
                      activeCatalog === "faturas"
                        ? "Ex.: fatura normal, cliente X…"
                        : "Ex.: João Silva Corretor, Comercial ABC…"
                    }
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                  />
                </div>
              ) : (
                <>
                  <CnpjLookupInput
                    label="CPF ou CNPJ"
                    name={`maf-${catalogKey}-doc`}
                    allowCpf
                    placeholder="CPF ou CNPJ"
                    value={cnpjCpf}
                    onChange={setCnpjCpf}
                    onFetched={applyCatalogCnpj}
                    className="sm:col-span-2"
                  />
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nome da Empresa / Nome Produtor</label>
                    <input
                      type="text"
                      required
                      name={`maf-${catalogKey}-nome`}
                      autoComplete="off"
                      placeholder="Nome ou razão social"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Endereço (Rua ou Fazenda)</label>
                    <input
                      type="text"
                      required
                      name={`maf-${catalogKey}-endereco`}
                      autoComplete="off"
                      placeholder="Logradouro, número, complemento"
                      value={endereco}
                      onChange={e => setEndereco(e.target.value)}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Cidade</label>
                    <input
                      type="text"
                      required
                      name={`maf-${catalogKey}-cidade`}
                      autoComplete="off"
                      placeholder="Município"
                      value={cidade}
                      onChange={e => setCidade(e.target.value)}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Estado (UF)</label>
                    <input
                      type="text"
                      required
                      maxLength={2}
                      name={`maf-${catalogKey}-uf`}
                      autoComplete="off"
                      placeholder="UF"
                      value={estado}
                      onChange={e => setEstado(e.target.value)}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Inscrição Estadual (I.E.)</label>
                    <input
                      type="text"
                      name={`maf-${catalogKey}-ie`}
                      autoComplete="off"
                      placeholder="Inscrição estadual"
                      value={ie}
                      onChange={e => setIe(e.target.value)}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cancelForm}
                className="px-5 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-sm disabled:opacity-60"
              >
                {saving ? "Salvando…" : isEditing ? "Salvar alterações" : "Confirmar cadastro"}
              </button>
            </div>
          </form>
        )}

        {/* Table list */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4.5 h-4.5 text-gray-400" />
            <input
              type="text"
              placeholder="Pesquisar cadastro..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
            />
          </div>

          <div className="border border-gray-150 rounded-2xl overflow-hidden overflow-x-auto">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                Nenhum cadastro encontrado nesta tabela.
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse min-w-[600px]">
                <thead className="bg-gray-50 border-b border-gray-150 font-mono text-xs text-gray-500 uppercase">
                  {activeCatalog === "fleet" ? (
                    <tr>
                      <th className="px-5 py-3">Motorista</th>
                      <th className="px-5 py-3">CPF</th>
                      <th className="px-5 py-3">Telefone</th>
                      <th className="px-5 py-3">Placa (caminhão)</th>
                      <th className="px-5 py-3">Cidade / UF</th>
                      <th className="px-5 py-3 w-24" />
                    </tr>
                  ) : isSimpleNameCatalog ? (
                    <tr>
                      <th className="px-5 py-3">Nome</th>
                      <th className="px-5 py-3 w-24" />
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-5 py-3">Nome / Cliente</th>
                      <th className="px-5 py-3">CNPJ / CPF</th>
                      <th className="px-5 py-3">Inscrição Estadual</th>
                      <th className="px-5 py-3">Cidade / UF</th>
                      <th className="px-5 py-3 w-24" />
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition">
                      {activeCatalog === "fleet" ? (
                        <>
                          <td className="px-5 py-3 text-gray-900">{item.nome}</td>
                          <td className="px-5 py-3 font-mono text-xs">{item.cpf || "-"}</td>
                          <td className="px-5 py-3 font-mono text-xs">{item.telefone || "-"}</td>
                          <td className="px-5 py-3 font-mono font-bold text-gray-900">{item.placa || "—"}</td>
                          <td className="px-5 py-3 text-xs text-gray-500">
                            {item.placa ? (
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                {item.cidade}-{item.estado}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <RowActions item={item} label={item.nome || ""} />
                        </>
                      ) : isSimpleNameCatalog ? (
                        <>
                          <td className="px-5 py-3 text-gray-900">{item.nome}</td>
                          <RowActions item={item} label={item.nome || ""} />
                        </>
                      ) : (
                        <>
                          <td className="px-5 py-3 text-gray-900 min-w-[200px]">
                            <div>{item.nome}</div>
                            <div className="text-[11px] text-gray-400 font-normal truncate max-w-[250px]">{item.endereco}</div>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs">{item.cnpj_cpf || "-"}</td>
                          <td className="px-5 py-3 font-mono text-xs">{item.inscricao_estadual || "ISENTO"}</td>
                          <td className="px-5 py-3 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              {item.cidade ? `${item.cidade}-${item.estado}` : "Não informado"}
                            </span>
                          </td>
                          <RowActions item={item} label={item.nome || ""} />
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
    </>
  );
}
