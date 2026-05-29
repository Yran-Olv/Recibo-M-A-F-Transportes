import React, { useEffect, useState } from "react";
import { Receipt, CatalogItem, CompanyProfile } from "../types";
import { Plus, FileText, Users, Truck, AlertTriangle, History, Database, CheckCircle2 } from "lucide-react";
import { ReceiptOrderModal } from "./ReceiptOrderModal";

interface ReceiptFormTabProps {
  company: CompanyProfile;
  senders: CatalogItem[];
  recipients: CatalogItem[];
  drivers: CatalogItem[];
  vehicles: CatalogItem[];
  agentes: CatalogItem[];
  receipts: Receipt[];
  databaseMode?: "json" | "postgresql";
  onOpenHistory?: () => void;
  initialReceiptData?: Partial<Receipt> | null;
  onReceiptCreated: (receipt: Receipt, meta?: { isEdit?: boolean }) => void | Promise<void>;
  onDismissInitial?: () => void;
  onAddSender: (item: CatalogItem) => void;
  onAddRecipient: (item: CatalogItem) => void;
  onAddDriver: (item: CatalogItem) => void;
  onAddVehicle: (item: CatalogItem) => void;
}

export function ReceiptFormTab({
  company,
  senders,
  recipients,
  drivers,
  vehicles,
  agentes,
  receipts,
  databaseMode = "json",
  onOpenHistory,
  initialReceiptData,
  onReceiptCreated,
  onDismissInitial,
  onAddSender,
  onAddRecipient,
  onAddDriver,
  onAddVehicle,
}: ReceiptFormTabProps) {
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (initialReceiptData) setModalOpen(true);
  }, [initialReceiptData]);

  const companyReady = !!(company.nome_empresa?.trim() && company.cnpj?.trim());

  return (
    <div className="space-y-6 animate-fade-in">
      {!companyReady && (
        <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>
            Configure os <strong>dados da empresa</strong> no menu lateral antes de emitir o primeiro
            espelho (razão social, CNPJ e endereço).
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="max-w-xl">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
            Emissão
          </p>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Nova ordem de frete</h2>
          <p className="text-slate-600 text-sm mb-4">
            Abra o assistente passo a passo: busque remetente, destinatário, motorista e veículo nos
            cadastros — como em um sistema de ordem de serviço.
          </p>
          <p className="text-xs text-slate-500 mb-6 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600 shrink-0" />
            Tudo é salvo no banco{" "}
            <strong>{databaseMode === "postgresql" ? "PostgreSQL" : "local (arquivo db.json)"}</strong>.
            Após emitir, o espelho aparece em <strong>Histórico</strong> no menu lateral.
          </p>
          <button
            type="button"
            disabled={!companyReady}
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md cursor-pointer transition"
          >
            <Plus className="w-5 h-5" />
            Iniciar nova ordem
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Remetentes" value={senders.length} />
        <StatCard icon={Users} label="Destinatários" value={recipients.length} />
        <StatCard
          icon={Truck}
          label="Motoristas / veículos"
          value={drivers.length + vehicles.length}
          detail={`${drivers.length} mot. · ${vehicles.length} placa`}
        />
      </div>

      {receipts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Últimos espelhos salvos ({receipts.length} no total)
            </p>
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" /> Ver histórico completo
              </button>
            )}
          </div>
          <ul className="space-y-2 text-sm">
            {receipts.slice(0, 5).map((r) => (
              <li
                key={r.id ?? r.numero_recibo}
                className="flex flex-wrap justify-between gap-2 py-2 border-b border-slate-100 last:border-0"
              >
                <span className="font-mono font-semibold text-slate-900">Nº {r.numero_recibo}</span>
                <span className="text-slate-600 truncate max-w-[200px]">{r.remetente_nome}</span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-600 truncate max-w-[200px]">{r.destinatario_nome}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Como funciona
        </p>
        <ol className="list-decimal list-inside space-y-1 text-slate-600">
          <li>Busque e selecione o remetente e o destinatário</li>
          <li>Informe mercadoria e valores do frete</li>
          <li>Escolha motorista e placa cadastrados</li>
          <li>Revise e clique em <strong>Emitir espelho</strong> (salva no banco e abre o histórico)</li>
        </ol>
      </div>

      <ReceiptOrderModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          onDismissInitial?.();
        }}
        company={company}
        senders={senders}
        recipients={recipients}
        drivers={drivers}
        vehicles={vehicles}
        agentes={agentes}
        initialData={initialReceiptData}
        onCreated={onReceiptCreated}
        onAddSender={onAddSender}
        onAddRecipient={onAddRecipient}
        onAddDriver={onAddDriver}
        onAddVehicle={onAddVehicle}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-emerald-600">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
        {detail ? <p className="text-[10px] text-slate-400 mt-0.5">{detail}</p> : null}
      </div>
    </div>
  );
}
