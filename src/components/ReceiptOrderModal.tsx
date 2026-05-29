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
  Building2,
} from "lucide-react";
import { Receipt, CatalogItem, CompanyProfile } from "../types";
import { api } from "../api";
import { EntitySearchPicker, SearchableItem } from "./EntitySearchPicker";
import { ReceiptPrintout } from "./ReceiptPrintout";
import { inputClass, labelClass } from "../styles/forms";
import { CnpjLookupInput } from "./CnpjLookupInput";
import type { CnpjLookupResult } from "../types/cnpj";
import { BrDecimalInput } from "./BrDecimalInput";
import {
  formatBrDecimal,
  formatBrDecimalFromUnknown,
  parseBrDecimalFromUser,
} from "../utils/brDecimal";
import {
  formatCpf,
  formatCpfOrCnpj,
  formatPlaca,
  formatTelefone,
} from "../utils/cnpj";
import { AppDialog, type AppDialogVariant } from "./AppDialog";
import { ModalShell } from "./ModalShell";

const STEPS = [
  { id: 0, title: "Empresa", icon: Building2 },
  { id: 1, title: "Remetente", icon: FileText },
  { id: 2, title: "Destinatário", icon: FileText },
  { id: 3, title: "Carga e valores", icon: Package },
  { id: 4, title: "Transporte", icon: Truck },
  { id: 5, title: "Revisão", icon: ClipboardCheck },
] as const;

interface ReceiptOrderModalProps {
  open: boolean;
  onClose: () => void;
  companies: CompanyProfile[];
  senders: CatalogItem[];
  recipients: CatalogItem[];
  drivers: CatalogItem[];
  vehicles: CatalogItem[];
  agentes: CatalogItem[];
  initialData?: Partial<Receipt> | null;
  onCreated: (receipt: Receipt, meta?: { isEdit?: boolean }) => void;
  onAddSender: (item: CatalogItem) => void;
  onAddRecipient: (item: CatalogItem) => void;
  onAddDriver: (item: CatalogItem) => void;
  onAddVehicle: (item: CatalogItem) => void;
}

type FaturaParte = "remetente" | "destinatario";

type PersonFields = {
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
  cnpj_cpf: string;
  ie: string;
};

function faturaNomeFromParte(parte: FaturaParte, rem: PersonFields, dest: PersonFields): string {
  return (parte === "destinatario" ? dest.nome : rem.nome).trim();
}

function detectFaturaParte(
  faturaNome: string,
  rem: PersonFields,
  dest: PersonFields
): FaturaParte {
  const f = faturaNome.trim().toUpperCase();
  const destNome = dest.nome.trim().toUpperCase();
  if (f && destNome && f === destNome) return "destinatario";
  return "remetente";
}

export function ReceiptOrderModal({
  open,
  onClose,
  companies,
  senders,
  recipients,
  drivers,
  vehicles,
  agentes,
  initialData,
  onCreated,
  onAddSender,
  onAddRecipient,
  onAddDriver,
  onAddVehicle,
}: ReceiptOrderModalProps) {
  const isEditing = !!(initialData?.id);
  const [step, setStep] = useState(0);
  const [companyId, setCompanyId] = useState<number | null>(null);
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
  const [faturaParte, setFaturaParte] = useState<FaturaParte>("remetente");

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
    if (!open) return;
    if (companies.length === 1 && companies[0].id) {
      setCompanyId(companies[0].id);
    }
    if (!isEditing && !initialData) {
      setStep(0);
    }
  }, [open, companies, isEditing, initialData]);

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
      qtd: formatBrDecimalFromUnknown(initialData.mercadoria_quantidade, 2),
      peso: formatBrDecimalFromUnknown(initialData.mercadoria_peso, 2),
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
      fatura: initialData.fatura_nome?.trim() || "",
      agente: initialData.agente_nome?.trim() || "",
    });
    setFaturaParte(
      detectFaturaParte(
        initialData.fatura_nome || "",
        {
          nome: initialData.remetente_nome || "",
          endereco: "",
          cidade: "",
          estado: "",
          cnpj_cpf: "",
          ie: "",
        },
        {
          nome: initialData.destinatario_nome || "",
          endereco: "",
          cidade: "",
          estado: "",
          cnpj_cpf: "",
          ie: "",
        }
      )
    );
    setCompanyId(initialData.company_id ?? companies[0]?.id ?? null);
    setStep(1);
  }, [open, initialData, companies]);

  useEffect(() => {
    if (isBlank) return;
    const nome = faturaNomeFromParte(faturaParte, remetente, destinatario);
    setTransporte((t) => (t.fatura === nome ? t : { ...t, fatura: nome }));
  }, [faturaParte, remetente.nome, destinatario.nome, isBlank]);

  useEffect(() => {
    const s = parseBrDecimalFromUser(valores.seguro);
    const i = parseBrDecimalFromUser(valores.icms);
    const o = parseBrDecimalFromUser(valores.outros);
    setValores((v) => ({ ...v, total: formatBrDecimal(s + i + o, 2) }));
  }, [valores.seguro, valores.icms, valores.outros]);

  const draft = useMemo((): Partial<Receipt> => ({
    numero_recibo: numero.trim() || autoNumber,
    data_recibo: data,
    is_blank: isBlank,
    company_id: companyId ?? companies[0]?.id ?? 1,
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
    mercadoria_valor: parseBrDecimalFromUser(mercadoria.valor),
    mercadoria_quantidade: parseBrDecimalFromUser(mercadoria.qtd),
    mercadoria_peso: parseBrDecimalFromUser(mercadoria.peso),
    mercadoria_unidade: mercadoria.unidade,
    valor_seguro: parseBrDecimalFromUser(valores.seguro),
    valor_icms: parseBrDecimalFromUser(valores.icms),
    valor_outros: parseBrDecimalFromUser(valores.outros),
    valor_total_frete: parseBrDecimalFromUser(valores.total),
    observacoes: obs,
    motorista_nome: transporte.motorista,
    motorista_cpf: transporte.cpf,
    motorista_telefone: transporte.fone,
    veiculo_placa: transporte.placa,
    veiculo_cidade: transporte.cidade,
    veiculo_estado: transporte.uf,
    fatura_nome: transporte.fatura.trim(),
    agente_nome: transporte.agente.trim(),
  }), [numero, autoNumber, data, isBlank, companyId, companies, remetente, destinatario, mercadoria, valores, obs, transporte]);

  const emitCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? companies[0],
    [companies, companyId]
  );

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

  const persistSenderToCatalog = async () => {
    if (!remetente.nome.trim()) return;
    try {
      const res = await api("/api/catalog/senders", {
        method: "POST",
        body: JSON.stringify({
          nome: remetente.nome.trim(),
          endereco: remetente.endereco.trim(),
          cidade: remetente.cidade.trim(),
          estado: remetente.estado.trim().toUpperCase(),
          cnpj_cpf: remetente.cnpj_cpf.trim(),
          inscricao_estadual: remetente.ie.trim(),
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        onAddSender(saved);
        setSelRemetente(saved);
      }
    } catch {
      /* mantém fluxo do espelho */
    }
  };

  const persistRecipientToCatalog = async () => {
    if (!destinatario.nome.trim()) return;
    try {
      const res = await api("/api/catalog/recipients", {
        method: "POST",
        body: JSON.stringify({
          nome: destinatario.nome.trim(),
          endereco: destinatario.endereco.trim(),
          cidade: destinatario.cidade.trim(),
          estado: destinatario.estado.trim().toUpperCase(),
          cnpj_cpf: destinatario.cnpj_cpf.trim(),
          inscricao_estadual: destinatario.ie.trim(),
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        onAddRecipient(saved);
        setSelDestinatario(saved);
      }
    } catch {
      /* mantém fluxo do espelho */
    }
  };

  const validateStepNumber = (n: number): string | null => {
    if (n === 0 && !companyId) return "Selecione qual empresa emitirá este espelho.";
    if (isBlank) return null;
    if (n === 1 && !remetente.nome.trim()) return "Selecione ou informe o remetente.";
    if (n === 2 && !destinatario.nome.trim()) return "Selecione ou informe o destinatário.";
    if (n === 3 && !mercadoria.natureza.trim()) return "Informe a mercadoria.";
    if (n === 4 && !transporte.motorista.trim()) return "Selecione o motorista.";
    if (n === 4 && !transporte.placa.trim()) return "Selecione o veículo.";
    if (n === 4 && !faturaNomeFromParte(faturaParte, remetente, destinatario)) {
      return faturaParte === "destinatario"
        ? "Informe o destinatário para definir quem paga a fatura."
        : "Informe o remetente para definir quem paga a fatura.";
    }
    return null;
  };

  const goToStep = async (target: number) => {
    if (target < 0 || target > 5 || target === step) return;

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
      if (n === 1) await persistSenderToCatalog();
      if (n === 2) await persistRecipientToCatalog();
    }
    setStep(target);
  };

  const next = () => void goToStep(Math.min(5, step + 1));

  const back = () => void goToStep(Math.max(0, step - 1));

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
    <ModalShell
      open={open}
      maxWidthClassName="max-w-3xl"
      ariaLabel={isEditing ? "Editar espelho de frete" : "Novo espelho de frete"}
      header={
        step === 5 ? (
          <div className="border-b border-slate-200 px-3 sm:px-5 py-2.5 bg-slate-50 flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Revisão</p>
              <h2 className="text-base font-bold text-slate-900 truncate">
                Espelho nº {numero || initialData?.numero_recibo || "—"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 cursor-pointer shrink-0"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="border-b border-slate-200 px-3 sm:px-5 py-2 sm:py-2.5 bg-slate-50 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                  {isEditing ? "Editar espelho" : "Ordem de frete"}
                </p>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {isEditing
                    ? `Espelho nº ${numero || initialData?.numero_recibo || "—"}`
                    : "Novo espelho de frete / viagem"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-200 cursor-pointer shrink-0"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <div>
                <label className={labelClass}>Nº espelho</label>
                <input className={inputClass} value={numero} onChange={(e) => setNumero(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Data</label>
                <input type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              <div className="col-span-2 flex items-end">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pb-1.5">
                  <input type="checkbox" checked={isBlank} onChange={(e) => setIsBlank(e.target.checked)} />
                  <span className="leading-tight">Emitir em branco</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mt-2">
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
                    className={`flex items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium leading-tight text-center cursor-pointer transition ${
                      active
                        ? "bg-emerald-600 text-white"
                        : done
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    <Icon className="w-3 h-3 shrink-0 hidden sm:block" />
                    <span className="min-w-0">{s.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      }
      footer={
        <div className="border-t border-slate-200 px-3 sm:px-5 py-2.5 flex justify-between gap-3 bg-white">
          <button
            type="button"
            onClick={step === 1 ? onClose : back}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? "Cancelar" : "Voltar"}
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={next}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer flex items-center gap-1"
            >
              Próximo
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={emit}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer flex items-center gap-2 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isEditing ? "Salvar alterações" : "Emitir espelho"}
            </button>
          )}
        </div>
      }
    >
        <div className="p-3 sm:p-5 min-w-0 min-h-full flex flex-col">
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

          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Escolha qual empresa aparecerá no cabeçalho deste espelho (logo, CNPJ e endereço).
              </p>
              {companies.length === 0 ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  Nenhuma empresa cadastrada. Vá em <strong>Empresas</strong> no menu e cadastre ao menos uma.
                </p>
              ) : (
                <div className="grid gap-2">
                  {companies.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                        companyId === c.id
                          ? "border-emerald-500 bg-emerald-50/80"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="emit-company"
                        className="mt-1"
                        checked={companyId === c.id}
                        onChange={() => setCompanyId(c.id ?? null)}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {c.nome_fantasia?.trim() || c.nome_empresa || "Sem nome"}
                        </p>
                        {c.nome_fantasia && c.nome_fantasia !== c.nome_empresa && (
                          <p className="text-xs text-slate-500">{c.nome_empresa}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-0.5 font-mono">{c.cnpj || "—"}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
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
                listClassName="max-h-28 sm:max-h-36"
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
                listClassName="max-h-28 sm:max-h-36"
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
                  decimals={2}
                  value={mercadoria.qtd}
                  onChange={(qtd) => setMercadoria({ ...mercadoria, qtd })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className={labelClass}>Peso (kg)</label>
                <BrDecimalInput
                  decimals={2}
                  value={mercadoria.peso}
                  onChange={(peso) => setMercadoria({ ...mercadoria, peso })}
                  placeholder="18.500,00"
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
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
                <Truck className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="font-semibold text-slate-900 text-sm">Motorista e caminhão</p>
                  <p className="text-xs text-slate-500">
                Ao escolher o motorista, a placa habitual é preenchida. Defina quem paga a fatura (remetente ou destinatário) e o agente abaixo.
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
                  setTransporte((t) => ({ ...t, ...next, agente: "" }));
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
                listClassName="max-h-28 sm:max-h-36"
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
                listClassName="max-h-28 sm:max-h-36"
              />
              {transporte.motorista.trim() ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 space-y-4 text-sm min-w-0 overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                    <div className="sm:col-span-2 min-w-0">
                      <p className={labelClass}>Quem paga a fatura no espelho?</p>
                      <div
                        className="grid grid-cols-1 gap-2 mt-1 min-w-0 w-full"
                        role="radiogroup"
                        aria-label="Quem paga a fatura no espelho"
                      >
                        <label
                          className={`w-full min-w-0 flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl border-2 cursor-pointer transition ${
                            faturaParte === "remetente"
                              ? "border-emerald-500 bg-emerald-50/80"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="fatura-parte"
                            className="mt-1 shrink-0"
                            checked={faturaParte === "remetente"}
                            onChange={() => setFaturaParte("remetente")}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                              Remetente
                            </span>
                            <span className="block text-sm font-semibold text-slate-900 break-words leading-snug mt-0.5">
                              {remetente.nome.trim() || "— preencha no passo 1"}
                            </span>
                          </span>
                        </label>
                        <label
                          className={`w-full min-w-0 flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl border-2 cursor-pointer transition ${
                            faturaParte === "destinatario"
                              ? "border-emerald-500 bg-emerald-50/80"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="fatura-parte"
                            className="mt-1 shrink-0"
                            checked={faturaParte === "destinatario"}
                            onChange={() => setFaturaParte("destinatario")}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                              Destinatário
                            </span>
                            <span className="block text-sm font-semibold text-slate-900 break-words leading-snug mt-0.5">
                              {destinatario.nome.trim() || "— preencha no passo 2"}
                            </span>
                          </span>
                        </label>
                      </div>
                      <p className="text-xs text-slate-500 mt-2 break-words leading-relaxed">
                        No espelho impresso, o campo <strong>Fatura</strong> mostrará:{" "}
                        <strong className="text-slate-700">{transporte.fatura || "—"}</strong>
                      </p>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="espelho-agente">
                        Agente no espelho
                      </label>
                      <select
                        id="espelho-agente"
                        value={
                          agentes.find(
                            (a) => a.nome?.trim().toUpperCase() === transporte.agente.trim().toUpperCase()
                          )?.id ?? (transporte.agente.trim() ? "__custom__" : "")
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setTransporte((t) => ({ ...t, agente: "" }));
                            return;
                          }
                          if (v === "__custom__") return;
                          const picked = agentes.find((a) => String(a.id) === v);
                          setTransporte((t) => ({ ...t, agente: picked?.nome?.trim() || "" }));
                        }}
                        className={inputClass}
                      >
                        <option value="">Sem agente / escolher…</option>
                        {agentes.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome}
                          </option>
                        ))}
                        {transporte.agente.trim() &&
                          !agentes.some(
                            (a) => a.nome?.trim().toUpperCase() === transporte.agente.trim().toUpperCase()
                          ) && (
                            <option value="__custom__">{transporte.agente} (salvo no espelho)</option>
                          )}
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        Escolha na lista (Catálogos → Agentes). Não é o motorista.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col flex-1 min-h-0 gap-2">
              <p className="text-sm text-slate-600 shrink-0">Confira o documento antes de emitir.</p>
              <div className="flex-1 min-h-0 overflow-auto overscroll-contain border rounded-xl p-2 bg-slate-100 flex justify-center">
                <div className="origin-top scale-[0.62] sm:scale-[0.72] md:scale-[0.82] lg:scale-95 xl:scale-100 w-full max-w-[182mm]">
                  <ReceiptPrintout receipt={draft} company={emitCompany!} isBlank={isBlank} />
                </div>
              </div>
            </div>
          )}
        </div>
    </ModalShell>
    </>
  );
}
