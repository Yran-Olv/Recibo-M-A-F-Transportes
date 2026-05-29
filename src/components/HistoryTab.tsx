import React, { useState } from "react";
import { Receipt } from "../types";
import { Search, Printer, Copy, Trash2, Pencil, Calendar, ArrowRight, CornerDownRight, Tag, FileText, BadgeCheck } from "lucide-react";
import { api } from "../api";
import { AppDialog, type AppDialogVariant } from "./AppDialog";

interface HistoryTabProps {
  receipts: Receipt[];
  onSelectReceipt: (receipt: Receipt) => void;
  onEditReceipt: (receipt: Receipt) => void;
  onDuplicateReceipt: (receipt: Receipt) => void;
  onDeleteReceipt: (id: number) => void;
}

export function HistoryTab({
  receipts,
  onSelectReceipt,
  onEditReceipt,
  onDuplicateReceipt,
  onDeleteReceipt,
}: HistoryTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dialog, setDialog] = useState<{
    open: boolean;
    variant: AppDialogVariant;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm?: () => void;
  }>({ open: false, variant: "info", title: "", message: "" });

  const closeDialog = () => setDialog((d) => ({ ...d, open: false }));

  const handleDelete = (id: number, numberStr: string) => {
    setDialog({
      open: true,
      variant: "confirm",
      title: "Excluir recibo",
      message: `Tem certeza que deseja excluir o recibo Nº ${numberStr}? Esta operação é irreversível.`,
      confirmLabel: "Excluir",
      onConfirm: async () => {
        closeDialog();
        try {
          const response = await api(`/api/receipts/${id}`, { method: "DELETE" });
          if (!response.ok) throw new Error("Erro ao excluir do servidor.");
          onDeleteReceipt(id);
        } catch (e) {
          console.error(e);
          setDialog({
            open: true,
            variant: "error",
            title: "Falha ao excluir",
            message: "Não foi possível excluir o recibo. Tente novamente.",
          });
        }
      },
    });
  };

  // Filter receipts by number, sender name or recipient name
  const filteredReceipts = receipts.filter(receipt => {
    const text = searchTerm.toLowerCase();
    const numeroMatch = receipt.numero_recibo.toLowerCase().includes(text);
    const remetenteMatch = (receipt.remetente_nome || "").toLowerCase().includes(text);
    const destinatarioMatch = (receipt.destinatario_nome || "").toLowerCase().includes(text);
    return numeroMatch || remetenteMatch || destinatarioMatch;
  });

  // helper to format BRL currency
  const formatCurrency = (val: any) => {
    if (val === undefined || val === null || val === "") return "R$ 0,00";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "R$ 0,00";
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // Safe formatting for dates from YYYY-MM-DD to DD/MM/YYYY
  const formatDateStr = (dateStr: any) => {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

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
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      
      <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        Todos os espelhos emitidos com <strong>Emitir espelho</strong> ficam gravados aqui permanentemente no banco de dados do sistema.
      </p>

      {/* Search Bar & Stats */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Pesquisar por número, remetente ou destinatário…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
          />
        </div>

        <div className="flex gap-4 items-center pl-2">
          <div className="text-right">
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Emissões</span>
            <span className="font-mono text-xl font-black text-gray-950">{receipts.length}</span>
          </div>
          <div className="border-l border-gray-150 h-8"></div>
          <div className="text-right">
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Encontrados</span>
            <span className="font-mono text-xl font-black text-blue-700">{filteredReceipts.length}</span>
          </div>
        </div>
      </div>

      {/* Receipts List */}
      {filteredReceipts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 max-w-xl mx-auto">
          <div className="w-14 h-14 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-gray-800 text-lg">Nenhum recibo de transporte</h3>
          <p className="text-sm text-gray-450 mt-1">
            {searchTerm ? "Nenhum espelho corresponde à busca." : "Emita o primeiro espelho de frete na aba Novo Espelho."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredReceipts.map(receipt => (
            <div 
              key={receipt.id}
              className="bg-white rounded-2xl p-5 border border-gray-100 hover:border-gray-200 shadow-sm transition flex flex-col md:flex-row md:items-center justify-between gap-5 group"
            >
              {/* Receipt primary info */}
              <div className="space-y-2 md:flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Numero Red Padded */}
                  <span className="font-mono font-black text-red-600 text-lg">
                    Nº {receipt.numero_recibo}
                  </span>
                  
                  {/* Date Flag */}
                  <span className="text-xs text-gray-500 font-mono flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {formatDateStr(receipt.data_recibo)}
                  </span>

                  {/* Mode Badge indicator */}
                  {receipt.is_blank ? (
                    <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-tight">
                      Modelo Vazio (Caneta)
                    </span>
                  ) : (
                    <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-800 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-tight flex items-center gap-0.5">
                      <BadgeCheck className="w-3 h-3 text-blue-700" /> Preenchido Automático
                    </span>
                  )}
                </div>

                {/* Sender/Recipient Connection Flow */}
                {!receipt.is_blank ? (
                  <div className="text-sm font-semibold text-gray-800 flex flex-col sm:flex-row sm:items-center gap-2 max-w-full">
                    <span className="text-gray-900 truncate max-w-[200px]" title={receipt.remetente_nome}>
                      {receipt.remetente_nome}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400 hidden sm:inline" />
                    <span className="text-gray-900 truncate max-w-[200px]" title={receipt.destinatario_nome}>
                      {receipt.destinatario_nome}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic">
                    Campos deixados em branco estrutural para preenchimento manual posterior.
                  </div>
                )}

                {/* Additional descriptive metadata: Nature of load & Total Cost */}
                {!receipt.is_blank && (
                  <div className="flex flex-wrap gap-4 text-xs font-mono text-gray-500">
                    <div className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-gray-450" />
                      Carga: <span className="font-bold text-gray-700">{receipt.mercadoria_natureza || "N/A"}</span>
                    </div>
                    {receipt.motorista_nome && (
                      <div className="flex items-center gap-1">
                        <CornerDownRight className="w-3.5 h-3.5 text-gray-405" />
                        Motorista: <span className="font-bold text-gray-700">{receipt.motorista_nome}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cost indicator & Quick action buttons */}
              <div className="flex flex-row md:flex-col items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-gray-100 pt-3 md:pt-0 md:pl-5 gap-3 shrink-0">
                
                {/* Net Freight Cost display */}
                <div className="text-right">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">Total Frete</span>
                  <span className="font-mono text-base font-black text-blue-800">
                    {receipt.is_blank ? "---" : formatCurrency(receipt.valor_total_frete)}
                  </span>
                </div>

                {/* Buttons controls */}
                <div className="flex items-center gap-2">
                  {/* Print Document preview button */}
                  <button
                    onClick={() => onSelectReceipt(receipt)}
                    className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition cursor-pointer select-none"
                    title="Imprimir / Visualizar Espelho de Frete"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onEditReceipt(receipt)}
                    className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition cursor-pointer select-none"
                    title="Editar espelho"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* Duplicate recipe template button */}
                  <button
                    onClick={() => onDuplicateReceipt(receipt)}
                    className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition cursor-pointer select-none"
                    title="Duplicar Recibo (Carregar Dados)"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  {/* Hard erase from archive db button */}
                  <button
                    onClick={() => handleDelete(receipt.id!, receipt.numero_recibo)}
                    className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition cursor-pointer select-none"
                    title="Excluir do Histórico"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}

    </div>
    </>
  );
}
