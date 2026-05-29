import React, { useState, useEffect } from "react";
import { CompanyProfile, CatalogItem, Receipt, ActiveTab } from "./types";
import { CompanyProfileTab } from "./components/CompanyProfileTab";
import { CatalogsTab } from "./components/CatalogsTab";
import { ReceiptFormTab } from "./components/ReceiptFormTab";
import { HistoryTab } from "./components/HistoryTab";
import { ReceiptPrintout } from "./components/ReceiptPrintout";
import { LoginPage } from "./components/LoginPage";
import { AccountTab } from "./components/AccountTab";
import { AppLayout } from "./components/AppLayout";
import { api } from "./api";
import { printReceiptDocument } from "./utils/printDocument";
import { CheckCircle, Printer, X } from "lucide-react";

const EMPTY_COMPANY: CompanyProfile = {
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
};

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeTab, setActiveTab] = useState<ActiveTab>("form");
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [company, setCompany] = useState<CompanyProfile>(EMPTY_COMPANY);
  const [senders, setSenders] = useState<CatalogItem[]>([]);
  const [recipients, setRecipients] = useState<CatalogItem[]>([]);
  const [drivers, setDrivers] = useState<CatalogItem[]>([]);
  const [vehicles, setVehicles] = useState<CatalogItem[]>([]);
  const [faturas, setFaturas] = useState<CatalogItem[]>([]);
  const [agentes, setAgentes] = useState<CatalogItem[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedReceiptForEdit, setSelectedReceiptForEdit] = useState<Partial<Receipt> | null>(null);
  const [printPreviewReceipt, setPrintPreviewReceipt] = useState<Receipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<{ nome: string; username: string; role?: string } | null>(null);
  const [databaseMode, setDatabaseMode] = useState<"json" | "postgresql">("json");
  const [backupNotice, setBackupNotice] = useState<string | null>(null);

  const applyBackupNotice = (backup?: { ok?: boolean; path?: string; skipped?: boolean; error?: string }) => {
    if (!backup) return;
    if (backup.ok && backup.path) {
      setBackupNotice(`Backup automático do dia salvo na pasta backups/ do sistema.`);
    } else if (backup.error) {
      setBackupNotice(`Aviso: backup automático não foi concluído (${backup.error}).`);
    }
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const healthRes = await fetch("/api/health");
      if (healthRes.ok) {
        const health = await healthRes.json();
        if (health.database === "postgresql" || health.database === "json") {
          setDatabaseMode(health.database);
        }
      }
      const companiesRes = await api("/api/companies");
      if (companiesRes.ok) {
        const list = (await companiesRes.json()) as CompanyProfile[];
        setCompanies(list);
        setCompany(list[0] ?? EMPTY_COMPANY);
      } else {
        const companyRes = await api("/api/company");
        if (companyRes.ok) {
          const one = await companyRes.json();
          setCompanies([one]);
          setCompany(one);
        }
      }
      const sendersRes = await api("/api/catalog/senders");
      if (sendersRes.ok) setSenders(await sendersRes.json());
      const recipientsRes = await api("/api/catalog/recipients");
      if (recipientsRes.ok) setRecipients(await recipientsRes.json());
      const driversRes = await api("/api/catalog/drivers");
      if (driversRes.ok) setDrivers(await driversRes.json());
      const vehiclesRes = await api("/api/catalog/vehicles");
      if (vehiclesRes.ok) setVehicles(await vehiclesRes.json());
      const faturasRes = await api("/api/catalog/faturas");
      if (faturasRes.ok) setFaturas(await faturasRes.json());
      const agentesRes = await api("/api/catalog/agentes");
      if (agentesRes.ok) setAgentes(await agentesRes.json());
      const receiptsRes = await api("/api/receipts");
      if (receiptsRes.ok) setReceipts(await receiptsRes.json());
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await api("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setAuthUser(data.user);
          setIsAuthenticated(true);
          applyBackupNotice(data.backup);
          await loadData();
        } else {
          setIsAuthenticated(false);
          setIsLoading(false);
        }
      } catch {
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    }
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setIsAuthenticated(false);
    setAuthUser(null);
  };

  const navigate = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === "form") setSelectedReceiptForEdit(null);
  };

  const handleCompaniesChange = (list: CompanyProfile[]) => {
    setCompanies(list);
    setCompany(list[0] ?? EMPTY_COMPANY);
  };

  const handleAddSender = (item: CatalogItem) => {
    setSenders((prev) => {
      const idx = prev.findIndex(
        (x) => x.id === item.id || x.nome?.toUpperCase() === item.nome?.toUpperCase()
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = item;
        return copy;
      }
      return [...prev, item].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    });
  };

  const handleAddRecipient = (item: CatalogItem) => {
    setRecipients((prev) => {
      const idx = prev.findIndex(
        (x) => x.id === item.id || x.nome?.toUpperCase() === item.nome?.toUpperCase()
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = item;
        return copy;
      }
      return [...prev, item].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    });
  };

  const handleAddDriver = (item: CatalogItem) => {
    setDrivers((prev) => {
      const idx = prev.findIndex(
        (x) => x.id === item.id || x.nome?.toUpperCase() === item.nome?.toUpperCase()
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = item;
        return copy;
      }
      return [...prev, item].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    });
  };

  const handleAddVehicle = (item: CatalogItem) => {
    setVehicles((prev) => {
      const idx = prev.findIndex((x) => x.placa?.toUpperCase() === item.placa?.toUpperCase());
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = item;
        return copy;
      }
      return [...prev, item].sort((a, b) => (a.placa || "").localeCompare(b.placa || ""));
    });
  };

  const handleAddFatura = (item: CatalogItem) => {
    setFaturas((prev) => {
      const idx = prev.findIndex(
        (x) => x.id === item.id || x.nome?.toUpperCase() === item.nome?.toUpperCase()
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = item;
        return copy;
      }
      return [...prev, item].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    });
  };

  const handleAddAgente = (item: CatalogItem) => {
    setAgentes((prev) => {
      const idx = prev.findIndex(
        (x) => x.id === item.id || x.nome?.toUpperCase() === item.nome?.toUpperCase()
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = item;
        return copy;
      }
      return [...prev, item].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    });
  };

  const handleReceiptCreated = async (
    savedReceipt: Receipt,
    meta?: { isEdit?: boolean }
  ) => {
    setReceipts((prev) => {
      const idx = savedReceipt.id
        ? prev.findIndex((x) => x.id === savedReceipt.id)
        : prev.findIndex((x) => x.numero_recibo === savedReceipt.numero_recibo);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = savedReceipt;
        return copy;
      }
      return [savedReceipt, ...prev];
    });
    setSelectedReceiptForEdit(null);
    if (!meta?.isEdit) {
      setPrintPreviewReceipt(savedReceipt);
    }
    setActiveTab("history");
    try {
      const res = await api("/api/receipts");
      if (res.ok) setReceipts(await res.json());
    } catch {
      /* lista local já atualizada */
    }
  };

  const handleDuplicateReceipt = (receipt: Receipt) => {
    setSelectedReceiptForEdit({
      ...receipt,
      id: undefined,
      numero_recibo: "",
      data_recibo: new Date().toISOString().split("T")[0],
    });
    setActiveTab("form");
  };

  const handleEditReceipt = (receipt: Receipt) => {
    setSelectedReceiptForEdit({ ...receipt });
    setActiveTab("form");
  };

  if (!isAuthenticated) {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    return (
      <LoginPage
        onLoginSuccess={async (payload) => {
          applyBackupNotice(payload?.backup);
          const res = await api("/api/auth/me");
          if (res.ok) {
            const data = await res.json();
            setAuthUser(data.user);
            setIsAuthenticated(true);
            if (!payload?.backup) applyBackupNotice(data.backup);
            await loadData();
          }
        }}
      />
    );
  }

  return (
    <>
      <AppLayout
        activeTab={activeTab}
        onNavigate={navigate}
        authUser={authUser}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
        onLogout={handleLogout}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-9 h-9 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Carregando…</p>
          </div>
        ) : (
          <>
            {backupNotice && (
              <div className="mb-4 flex gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <p>{backupNotice}</p>
                <button
                  type="button"
                  className="ml-auto text-emerald-800 hover:underline text-xs shrink-0 cursor-pointer"
                  onClick={() => setBackupNotice(null)}
                >
                  Fechar
                </button>
              </div>
            )}
              {activeTab === "form" && (
                <ReceiptFormTab
                  companies={companies}
                  senders={senders}
                  recipients={recipients}
                  drivers={drivers}
                  vehicles={vehicles}
                  agentes={agentes}
                  receipts={receipts}
                  databaseMode={databaseMode}
                  onOpenHistory={() => setActiveTab("history")}
                  initialReceiptData={selectedReceiptForEdit}
                  onReceiptCreated={handleReceiptCreated}
                  onDismissInitial={() => setSelectedReceiptForEdit(null)}
                  onAddSender={handleAddSender}
                  onAddRecipient={handleAddRecipient}
                  onAddDriver={handleAddDriver}
                  onAddVehicle={handleAddVehicle}
                />
              )}
            {activeTab === "history" && (
              <HistoryTab
                receipts={receipts}
                onSelectReceipt={setPrintPreviewReceipt}
                onEditReceipt={handleEditReceipt}
                onDuplicateReceipt={handleDuplicateReceipt}
                onDeleteReceipt={(id) => setReceipts((p) => p.filter((r) => r.id !== id))}
              />
            )}
            {activeTab === "catalogs" && (
              <CatalogsTab
                senders={senders}
                recipients={recipients}
                drivers={drivers}
                vehicles={vehicles}
                faturas={faturas}
                agentes={agentes}
                onAddSender={handleAddSender}
                onAddRecipient={handleAddRecipient}
                onAddDriver={handleAddDriver}
                onAddVehicle={handleAddVehicle}
                onAddFatura={handleAddFatura}
                onAddAgente={handleAddAgente}
                onDeleteSender={(id) => setSenders((p) => p.filter((x) => x.id !== id))}
                onDeleteRecipient={(id) => setRecipients((p) => p.filter((x) => x.id !== id))}
                onDeleteDriver={(id) => setDrivers((p) => p.filter((x) => x.id !== id))}
                onDeleteVehicle={(id) => setVehicles((p) => p.filter((x) => x.id !== id))}
                onDeleteFatura={(id) => setFaturas((p) => p.filter((x) => x.id !== id))}
                onDeleteAgente={(id) => setAgentes((p) => p.filter((x) => x.id !== id))}
              />
            )}
            {activeTab === "company" && (
              <CompanyProfileTab companies={companies} onCompaniesChange={handleCompaniesChange} />
            )}
            {activeTab === "account" && <AccountTab isAdmin={authUser?.role === "admin"} />}
          </>
        )}
      </AppLayout>

      {printPreviewReceipt && (
        <div className="print-modal-shell fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="print-modal-shell bg-white w-full sm:max-w-4xl sm:rounded-2xl max-h-[100dvh] sm:max-h-[92vh] flex flex-col shadow-2xl">
            <div className="no-print flex items-center justify-between gap-3 p-4 border-b bg-slate-50 shrink-0">
              <div>
                <p className="font-semibold text-slate-900 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Espelho nº {printPreviewReceipt.numero_recibo}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  A4 — ao imprimir, desative <strong>Cabeçalhos e rodapés</strong> no navegador (remove URL e data).
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => printReceiptDocument("print-document")}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg cursor-pointer flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setPrintPreviewReceipt(null)}
                  className="p-2 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="print-modal-body overflow-auto p-4 bg-slate-100 flex justify-center sm:p-6">
              <ReceiptPrintout
                printRootId="print-document"
                receipt={printPreviewReceipt}
                company={
                  companies.find((c) => c.id === printPreviewReceipt.company_id) ?? company
                }
                isBlank={printPreviewReceipt.is_blank}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
