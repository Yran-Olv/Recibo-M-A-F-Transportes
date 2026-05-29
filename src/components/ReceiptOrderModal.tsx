import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Package,
  Truck,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import { Receipt, CatalogItem, CompanyProfile } from "../types";
import { api } from "../api";
import { EntitySearchPicker, SearchableItem } from "./EntitySearchPicker";
import { ReceiptPrintout } from "./ReceiptPrintout";
import { inputClass, labelClass } from "../styles/forms";
import { CnpjLookupInput } from "./CnpjLookupInput";
import type { CnpjLookupResult } from "../types/cnpj";
import { BrDecimalInput } from "./BrDecimalInput";
import { formatBrDecimal, formatBrDecimalFromUnknown, parseBrDecimal } from "../utils/brDecimal";
import {
  formatCpf,
  formatCpfOrCnpj,
  formatPlaca,
  formatTelefone,
} from "../utils/cnpj";
import { AppDialog, type AppDialogVariant } from "./AppDialog";

const STEPS = [
  { id: 1, title: "Remetente", icon: FileText },
  { id: 2, title: "Destinatário", icon: FileText },
  { id: 3, title: "Carga e valores", icon: Package },
  { id: 4, title: "Transporte", icon: Truck },
  { id: 5, title: "Revisão", icon: ClipboardCheck },
] as const;

interface ReceiptOrderModalProps {
  open: boolean;
  onClose: () => void;
  company: CompanyProfile;
  senders: CatalogItem[];
  recipients: CatalogItem[];
  drivers: CatalogItem[];
  vehicles: CatalogItem[];
  initialData?: Partial<Receipt> | null;
  onCreated: (receipt: Receipt, meta?: { isEdit?: boolean }) => void;
  onAddSender: (item: CatalogItem) => void;
  onAddRecipient: (item: CatalogItem) => void;
  onAddDriver: (item: CatalogItem) => void;
  onAddVehicle: (item: CatalogItem) => void;
}

/** Fatura e agente no espelho seguem o motorista escolhido. */
function faturaFromMotorista(driver: SearchableItem): string {
  return driver.nome?.trim() || "";
}

function agenteFromMotorista(driver: SearchableItem): string {
  return driver.agente_nome?.trim() || driver.nome?.trim() || "";
}

export function ReceiptOrderModal({
  open,
  onClose,
  company,
  senders,
  recipients,
  drivers,
  vehicles,
  initialData,
  onCreated,
  onAddSender,
  onAddRecipient,
  onAddDriver,
  onAddVehicle,
}: ReceiptOrderModalProps) {
  const isEditing = !!(initialData?.id);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [dialog, setDialog] = useState<{
    open: boolean;
    variant: AppDialogVariant;
    title: string;
    message: string;
  }>({ open: false, variant: "info", title: "", message: "" });

  const showDialog = (variant: AppDialogVariant, title: string, message: string) => {
    setDialog({ open: true, variant, title, message });
  };
  const [autoNumber, setAutoNumber] = useState("");
  const [isBlank, setIsBlank] = useState(false);

  const [numero, setNumero] = useState("");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);

  const [remetente, setRemetente] = useState({
    nome: "", endereco: "", cidade: "", estado: "", cnpj_cpf: "", ie: "",
  });
  const [destinatario, setDestinatario] = useState({
    nome: "", endereco: "", cidade: "", estado: "", cnpj_cpf: "", ie: "",
  });
  const [mercadoria, setMercadoria] = useState({
    natureza: "", docFiscal: "", notaFiscal: "", valor: "", qtd: "", peso: "", unidade: "KG",
  });
  const [valores, setValores] = useState({ seguro: "", icms: "", outros: "", total: "" });
  const [obs, setObs] = useState("");
  const [transporte, setTransporte] = useState({
    motorista: "", cpf: "", fone: "", placa: "", cidade: "", uf: "", fatura: "", agente: "",
  });

  const applyCnpjPerson = (
    data: CnpjLookupResult,
    setter: React.Dispatch<
      React.SetStateAction<{
        nome: string;
        endereco: string;
        cidade: string;
        estado: string;
        cnpj_cpf: string;
        ie: string;
      }>
    >
  ) => {
    setter((prev) => ({
      ...prev,
      nome: data.razao_social || "",
      endereco: data.endereco || "",
      cidade: data.cidade || "",
      estado: data.estado || "",
      cnpj_cpf: data.cnpj || prev.cnpj_cpf,
    }));
  };

  const [selRemetente, setSelRemetente] = useState<SearchableItem | null>(null);
  const [selDestinatario, setSelDestinatario] = useState<SearchableItem | null>(null);
  const [selMotorista, setSelMotorista] = useState<SearchableItem | null>(null);
  const [selVeiculo, setSelVeiculo] = useState<SearchableItem | null>(null);
  useEffect(() => {
    if (!open || isEditing) return;
    api("/api/receipts/next")
      .then((r) => r.json())
      .then((d) => {
        setAutoNumber(d.nextNumber);
        if (!initialData?.numero_recibo) setNumero(d.nextNumber);
      });
  }, [open, initialData?.numero_recibo, isEditing]);

  useEffect(() => {
    if (!open || !initialData) return;
    setNumero(initialData.numero_recibo || "");
    setData(initialData.data_recibo || data);
    setIsBlank(!!initialData.is_blank);
    setRemetente({
      nome: initialData.remetente_nome || "",
      endereco: initialData.remetente_endereco || "",
      cidade: initialData.remetente_cidade || "",
      estado: initialData.remetente_estado || "",
      cnpj_cpf: formatCpfOrCnpj(initialData.remetente_cnpj_cpf || ""),
      ie: initialData.remetente_inscricao_estadual || "",
    });
    setDestinatario({
      nome: initialData.destinatario_nome || "",
      endereco: initialData.destinatario_endereco || "",
      cidade: initialData.destinatario_cidade || "",
      estado: initialData.destinatario_estado || "",
      cnpj_cpf: formatCpfOrCnpj(initialData.destinatario_cnpj_cpf || ""),
      ie: initialData.destinatario_inscricao_estadual || "",
    });
    setMercadoria({
      natureza: initialData.mercadoria_natureza || "",
      docFiscal: initialData.mercadoria_documento_fiscal || "",
      notaFiscal: initialData.mercadoria_nota_fiscal || "",
      valor: formatBrDecimalFromUnknown(initialData.mercadoria_valor, 2),
      qtd: formatBrDecimalFromUnknown(initialData.mercadoria_quantidade, 3),
      peso: formatBrDecimalFromUnknown(initialData.mercadoria_peso, 3),
      unidade: initialData.mercadoria_unidade || "KG",
    });
    setValores({
      seguro: formatBrDecimalFromUnknown(initialData.valor_seguro, 2),
      icms: formatBrDecimalFromUnknown(initialData.valor_icms, 2),
      outros: formatBrDecimalFromUnknown(initialData.valor_outros, 2),
      total: formatBrDecimalFromUnknown(initialData.valor_total_frete, 2),
    });
    setObs(initialData.observacoes || "");
    const motoristaNome = initialData.motorista_nome || "";
    setTransporte({
      motorista: motoristaNome,
      cpf: formatCpf(initialData.motorista_cpf || ""),
      fone: formatTelefone(initialData.motorista_telefone || ""),
      placa: formatPlaca(initialData.veiculo_placa || ""),
      cidade: initialData.veiculo_cidade || "",
      uf: initialData.veiculo_estado || "",
      fatura: initialData.fatura_nome?.trim() || motoristaNome,
      agente: initialData.agente_nome?.trim() || motoristaNome,
    });
    setStep(1);
  }, [open, initialData]);

  useEffect(() => {
    const s = parseBrDecimal(valores.seguro);
    const i = parseBrDecimal(valores.icms);
    const o = parseBrDecimal(valores.outros);
    setValores((v) => ({ ...v, total: formatBrDecimal(s + i + o, 2) }));
  }, [valores.seguro, valores.icms, valores.outros]);

  const draft = useMemo((): Partial<Receipt> => ({
    numero_recibo: numero.trim() || autoNumber,
    data_recibo: data,
    is_blank: isBlank,
    remetente_nome: remetente.nome,
    remetente_endereco: remetente.endereco,
    remetente_cidade: remetente.cidade,
    remetente_estado: remetente.estado,
    remetente_cnpj_cpf: remetente.cnpj_cpf,
    remetente_inscricao_estadual: remetente.ie,
    destinatario_nome: destinatario.nome,
    destinatario_endereco: destinatario.endereco,
    destinatario_cidade: destinatario.cidade,
    destinatario_estado: destinatario.estado,
    destinatario_cnpj_cpf: destinatario.cnpj_cpf,
    destinatario_inscricao_estadual: destinatario.ie,
    mercadoria_natureza: mercadoria.natureza,
    mercadoria_documento_fiscal: mercadoria.docFiscal,
    mercadoria_nota_fiscal: mercadoria.notaFiscal,
    mercadoria_valor: parseBrDecimal(mercadoria.valor),
    mercadoria_quantidade: parseBrDecimal(mercadoria.qtd),
    mercadoria_peso: parseBrDecimal(mercadoria.peso),
    mercadoria_unidade: mercadoria.unidade,
    valor_seguro: parseBrDecimal(valores.seguro),
    valor_icms: parseBrDecimal(valores.icms),
    valor_outros: parseBrDecimal(valores.outros),
    valor_total_frete: parseBrDecimal(valores.total),
    observacoes: obs,
    motorista_nome: transporte.motorista,
    motorista_cpf: transporte.cpf,
    motorista_telefone: transporte.fone,
    veiculo_placa: transporte.placa,
    veiculo_cidade: transporte.cidade,
    veiculo_estado: transporte.uf,
    fatura_nome: transporte.fatura.trim() || transporte.motorista.trim(),
    agente_nome: transporte.agente.trim() || transporte.motorista.trim(),
  }), [numero, autoNumber, data, isBlank, remetente, destinatario, mercadoria, valores, obs, transporte]);

  if (!open) return null;

  const applyPerson = (
    item: SearchableItem,
    setter: React.Dispatch<React.SetStateAction<typeof remetente>>,
    setSel: (i: SearchableItem | null) => void
  ) => {
    setSel(item);
    setter({
      nome: item.nome || "",
      endereco: item.endereco || "",
      cidade: item.cidade || "",
      estado: item.estado || "",
      cnpj_cpf: formatCpfOrCnpj(item.cnpj_cpf || item.cpf || ""),
      ie: item.inscricao_estadual || "",
    });
  };

  const validateStepNumber = (n: number): string | null => {
    if (isBlank) return null;
    if (n === 1 && !remetente.nome.trim()) return "Selecione ou informe o remetente.";
    if (n === 2 && !destinatario.nome.trim()) return "Selecione ou informe o destinatário.";
    if (n === 3 && !mercadoria.natureza.trim()) return "Informe a mercadoria.";
    if (n === 4 && !transporte.motorista.trim()) return "Selecione o motorista.";
    if (n === 4 && !transporte.placa.trim()) return "Selecione o veículo.";
    return null;
  };

  const goToStep = (target: number) => {
    if (target < 1 || target > 5 || target === step) return;

    if (target < step) {
      setStep(target);
      return;
    }

    for (let n = step; n < target; n++) {
      const err = validateStepNumber(n);
      if (err) {
        showDialog("error", "Campo obrigatório", err);
        setStep(n);
        return;
      }
    }
    setStep(target);
  };

  const next = () => goToStep(Math.min(5, step + 1));

  const back = () => goToStep(Math.max(1, step - 1));

  const emit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...draft,
        numero_recibo: draft.numero_recibo,
        has_qrcode: false,
        has_signature: false,
      };
      const res = await api(
        isEditing ? `/api/receipts/${initialData!.id}` : "/api/receipts",
        {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            (isEditing
              ? "Não foi possível salvar as alterações."
              : "Não foi possível salvar o espelho no banco de dados.")
        );
      }
      onCreated(data as Receipt, { isEdit: isEditing });
      onClose();
    } catch (e) {
      showDialog(
        "error",
        isEditing ? "Erro ao salvar" : "Erro ao emitir",
        e instanceof Error
          ? e.message
          : isEditing
            ? "Não foi possível salvar as alterações."
            : "Não foi possível emitir o espelho."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const quickAddSender = async (data: SearchableItem) => {
    const res = await api("/api/catalog/senders", { method: "POST", body: JSON.stringify(data) });
    if (!res.ok) throw new Error();
    const saved = await res.json();
    onAddSender(saved);
    applyPerson(saved, setRemetente, setSelRemetente);
  };

  const quickAddRecipient = async (data: SearchableItem) => {
    const res = await api("/api/catalog/recipients", { method: "POST", body: JSON.stringify(data) });
    if (!res.ok) throw new Error();
    const saved = await res.json();
    onAddRecipient(saved);
    applyPerson(saved, setDestinatario, setSelDestinatario);
  };

  const quickAddDriver = async (data: SearchableItem) => {
    const res = await api("/api/catalog/drivers", { method: "POST", body: JSON.stringify(data) });
    if (!res.ok) throw new Error();
    const saved = await res.json();
    onAddDriver(saved);
    setSelMotorista(saved);
    setTransporte((t) => ({
      ...t,
      motorista: saved.nome || "",
      cpf: formatCpf(saved.cpf || ""),
      fone: formatTelefone(saved.telefone || ""),
      fatura: faturaFromMotorista(saved),
      agente: agenteFromMotorista(saved),
    }));
  };

  const quickAddVehicle = async (data: SearchableItem) => {
    const res = await api("/api/catalog/vehicles", { method: "POST", body: JSON.stringify(data) });
    if (!res.ok) throw new Error();
    const saved = await res.json();
    onAddVehicle(saved);
    setSelVeiculo(saved);
    setTransporte((t) => ({
      ...t,
      placa: formatPlaca(saved.placa || ""),
      cidade: saved.cidade || "",
      uf: saved.estado || "",
    }));
  };

  return (
    <>
    <AppDialog
      open={dialog.open}
      variant={dialog.variant}
      title={dialog.title}
      message={dialog.message}
      onClose={() => setDialog((d) => ({ ...d, open: false }))}
    />
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div
        className="bg-white w-full sm:max-w-3xl max-h-[100dvh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Cabeçalho */}
        <div className="shrink-0 border-b border-slate-200 px-4 sm:px-6 py-4 bg-slate-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                {isEditing ? "Editar espelho" : "Ordem de frete"}
              </p>
              <h2 className="text-lg font-bold text-slate-900">
                {isEditing
                  ? `Espelho nº ${numero || initialData?.numero_recibo || "—"}`
                  : "Novo espelho de frete / viagem"}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div>
              <label className={labelClass}>Nº espelho</label>
              <input className={inputClass} value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Data</label>
              <input type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="col-span-2 flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pb-2.5">
                <input type="checkbox" checked={isBlank} onChange={(e) => setIsBlank(e.target.checked)} />
                Emitir em branco (preencher à mão)
              </label>
            </div>
          </div>

          {/* Stepper — clique no nome ou use Próximo / Voltar */}
          <div className="flex gap-1 mt-4 overflow-x-auto pb-1">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const active = step === s.id;
              const done = step > s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  title={`Ir para: ${s.title}`}
                  onClick={() => goToStep(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition hover:ring-2 hover:ring-emerald-400/50 ${
                    active
                      ? "bg-emerald-600 text-white ring-2 ring-emerald-500/30"
                      : done
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {s.title}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            Clique em qualquer etapa acima ou use os botões Voltar e Próximo.
          </p>
        </div>

        {/* Conteúdo do passo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isBlank && step < 5 && (
            <div className="text-center py-12 space-y-4">
              <p className="text-slate-600 text-sm max-w-sm mx-auto">
                Formulário em branco: não é necessário preencher remetente, carga ou transporte.
              </p>
              <button
                type="button"
                onClick={() => goToStep(5)}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg cursor-pointer"
              >
                Ir para revisão e emitir
              </button>
            </div>
          )}

          {step === 1 && !isBlank && (
            <div className="space-y-4">
              <EntitySearchPicker
                label="Buscar remetente cadastrado"
                items={senders}
                selected={selRemetente}
                onSelect={(i) => applyPerson(i, setRemetente, setSelRemetente)}
                onClear={() => {
                  setSelRemetente(null);
                  setRemetente({ nome: "", endereco: "", cidade: "", estado: "", cnpj_cpf: "", ie: "" });
                }}
                allowQuickAdd
                onQuickAdd={quickAddSender}
              />
              <details className="text-sm">
                <summary className="cursor-pointer text-emerald-700 font-medium">Editar dados do remetente</summary>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <CnpjLookupInput
                    label="CNPJ / CPF"
                    allowCpf
                    value={remetente.cnpj_cpf}
                    onChange={(v) => setRemetente({ ...remetente, cnpj_cpf: v })}
                    onFetched={(data) => applyCnpjPerson(data, setRemetente)}
                    inputClassName={inputClass}
                    className="sm:col-span-2"
                  />
                  <input className={inputClass} placeholder="Nome" value={remetente.nome} onChange={(e) => setRemetente({ ...remetente, nome: e.target.value })} />
                  <input className={`${inputClass} sm:col-span-2`} placeholder="Endereço" value={remetente.endereco} onChange={(e) => setRemetente({ ...remetente, endereco: e.target.value })} />
                  <input className={inputClass} placeholder="Cidade" value={remetente.cidade} onChange={(e) => setRemetente({ ...remetente, cidade: e.target.value })} />
                  <input className={inputClass} placeholder="UF" maxLength={2} value={remetente.estado} onChange={(e) => setRemetente({ ...remetente, estado: e.target.value.toUpperCase() })} />
                  <input className={inputClass} placeholder="I.E." value={remetente.ie} onChange={(e) => setRemetente({ ...remetente, ie: e.target.value })} />
                </div>
              </details>
            </div>
          )}

          {step === 2 && !isBlank && (
            <div className="space-y-4">
              <EntitySearchPicker
                label="Buscar destinatário cadastrado"
                items={recipients}
                selected={selDestinatario}
                onSelect={(i) => applyPerson(i, setDestinatario, setSelDestinatario)}
                onClear={() => {
                  setSelDestinatario(null);
                  setDestinatario({ nome: "", endereco: "", cidade: "", estado: "", cnpj_cpf: "", ie: "" });
                }}
                allowQuickAdd
                onQuickAdd={quickAddRecipient}
              />
              <details className="text-sm">
                <summary className="cursor-pointer text-emerald-700 font-medium">Editar dados do destinatário</summary>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <CnpjLookupInput
                    label="CNPJ / CPF"
                    allowCpf
                    value={destinatario.cnpj_cpf}
                    onChange={(v) => setDestinatario({ ...destinatario, cnpj_cpf: v })}
                    onFetched={(data) => applyCnpjPerson(data, setDestinatario)}
                    inputClassName={inputClass}
                    className="sm:col-span-2"
                  />
                  <input className={inputClass} placeholder="Nome" value={destinatario.nome} onChange={(e) => setDestinatario({ ...destinatario, nome: e.target.value })} />
                  <input className={`${inputClass} sm:col-span-2`} placeholder="Endereço" value={destinatario.endereco} onChange={(e) => setDestinatario({ ...destinatario, endereco: e.target.value })} />
                  <input className={inputClass} placeholder="Cidade" value={destinatario.cidade} onChange={(e) => setDestinatario({ ...destinatario, cidade: e.target.value })} />
                  <input className={inputClass} placeholder="UF" maxLength={2} value={destinatario.estado} onChange={(e) => setDestinatario({ ...destinatario, estado: e.target.value.toUpperCase() })} />
                </div>
              </details>
            </div>
          )}

          {step === 3 && !isBlank && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Mercadoria</label>
                <input className={inputClass} value={mercadoria.natureza} onChange={(e) => setMercadoria({ ...mercadoria, natureza: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Documento fiscal</label>
                <input className={inputClass} value={mercadoria.docFiscal} onChange={(e) => setMercadoria({ ...mercadoria, docFiscal: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Nota fiscal (Obs.)</label>
                <input className={inputClass} value={mercadoria.notaFiscal} onChange={(e) => setMercadoria({ ...mercadoria, notaFiscal: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Quantidade</label>
                <BrDecimalInput
                  decimals={3}
                  value={mercadoria.qtd}
                  onChange={(qtd) => setMercadoria({ ...mercadoria, qtd })}
                  placeholder="0,000"
                />
              </div>
              <div>
                <label className={labelClass}>Peso (kg)</label>
                <BrDecimalInput
                  decimals={3}
                  value={mercadoria.peso}
                  onChange={(peso) => setMercadoria({ ...mercadoria, peso })}
                  placeholder="18.500,000"
                />
              </div>
              <div>
                <label className={labelClass}>Valor da mercadoria (R$)</label>
                <BrDecimalInput
                  decimals={2}
                  value={mercadoria.valor}
                  onChange={(valor) => setMercadoria({ ...mercadoria, valor })}
                  placeholder="0,00"
                />
              </div>
              <div className="sm:col-span-2 border-t pt-4 grid sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelClass}>Seguro (R$)</label>
                  <BrDecimalInput
                    decimals={2}
                    value={valores.seguro}
                    onChange={(seguro) => setValores({ ...valores, seguro })}
                  />
                </div>
                <div>
                  <label className={labelClass}>ICMS (R$)</label>
                  <BrDecimalInput
                    decimals={2}
                    value={valores.icms}
                    onChange={(icms) => setValores({ ...valores, icms })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Outros (R$)</label>
                  <BrDecimalInput
                    decimals={2}
                    value={valores.outros}
                    onChange={(outros) => setValores({ ...valores, outros })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Total (R$)</label>
                  <BrDecimalInput
                    decimals={2}
                    readOnly
                    className={`${inputClass} bg-emerald-50 font-semibold`}
                    value={valores.total}
                    onChange={() => {}}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Observações</label>
                <input className={inputClass} value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>
            </div>
          )}

          {step === 4 && !isBlank && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
                <Truck className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="font-semibold text-slate-900 text-sm">Motorista e caminhão</p>
                  <p className="text-xs text-slate-500">
                Ao escolher o motorista, a placa habitual e os campos Fatura e Agente do espelho são preenchidos automaticamente.
              </p>
                </div>
              </div>
              <EntitySearchPicker
                label="Motorista"
                items={drivers}
                selected={selMotorista}
                mode="person"
                onSelect={(i) => {
                  setSelMotorista(i);
                  const next = {
                    motorista: i.nome || "",
                    cpf: formatCpf(i.cpf || ""),
                    fone: formatTelefone(i.telefone || ""),
                    placa: "",
                    cidade: "",
                    uf: "",
                    fatura: faturaFromMotorista(i),
                    agente: agenteFromMotorista(i),
                  };
                  if (i.placa) {
                    const v =
                      vehicles.find((x) => x.id === i.vehicle_id) ||
                      vehicles.find((x) => x.placa?.toUpperCase() === i.placa?.toUpperCase()) || {
                        id: i.vehicle_id,
                        placa: i.placa,
                        cidade: i.cidade,
                        estado: i.estado,
                      };
                    setSelVeiculo(v);
                    next.placa = formatPlaca(v.placa || i.placa || "");
                    next.cidade = v.cidade || i.cidade || "";
                    next.uf = v.estado || i.estado || "";
                  } else {
                    setSelVeiculo(null);
                  }
                  setTransporte((t) => ({ ...t, ...next }));
                }}
                onClear={() => {
                  setSelMotorista(null);
                  setTransporte((t) => ({
                    ...t,
                    motorista: "",
                    cpf: "",
                    fone: "",
                    fatura: "",
                    agente: "",
                  }));
                }}
                allowQuickAdd
                onQuickAdd={quickAddDriver}
              />
              <EntitySearchPicker
                label="Veículo (placa)"
                items={vehicles}
                selected={selVeiculo}
                mode="vehicle"
                placeholder="Buscar placa ou cidade…"
                onSelect={(i) => {
                  setSelVeiculo(i);
                  setTransporte((t) => ({
                    ...t,
                    placa: formatPlaca(i.placa || ""),
                    cidade: i.cidade || "",
                    uf: i.estado || "",
                  }));
                }}
                onClear={() => {
                  setSelVeiculo(null);
                  setTransporte((t) => ({ ...t, placa: "", cidade: "", uf: "" }));
                }}
                allowQuickAdd
                onQuickAdd={quickAddVehicle}
              />
              {transporte.motorista.trim() ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Fatura</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{transporte.fatura || "—"}</p>
                    <p className="text-xs text-slate-500 mt-1">Mesmo nome do motorista (automático).</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Agente</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{transporte.agente || "—"}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Agente habitual do cadastro do motorista, ou o próprio motorista.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Confira o documento antes de emitir.</p>
              <div className="overflow-x-auto border rounded-xl p-2 bg-slate-100 max-h-[50vh]">
                <ReceiptPrintout receipt={draft} company={company} isBlank={isBlank} />
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="shrink-0 border-t border-slate-200 px-4 sm:px-6 py-4 flex justify-between gap-3 bg-white">
          <button
            type="button"
            onClick={step === 1 ? onClose : back}
            className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? "Cancelar" : "Voltar"}
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={next}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer flex items-center gap-1"
            >
              Próximo
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={emit}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer flex items-center gap-2 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isEditing ? "Salvar alterações" : "Emitir espelho"}
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
