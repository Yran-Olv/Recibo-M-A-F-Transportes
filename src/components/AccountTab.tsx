import React, { useState } from "react";
import { KeyRound, UserPlus, Shield } from "lucide-react";
import { api } from "../api";

interface AccountTabProps {
  isAdmin: boolean;
}

export function AccountTab({ isAdmin }: AccountTabProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMessage, setPwdMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newUserNome, setNewUserNome] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [userMessage, setUserMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage(null);

    if (newPassword !== confirmPassword) {
      setPwdMessage({ type: "err", text: "As senhas não coincidem." });
      return;
    }

    if (newPassword.length < 8) {
      setPwdMessage({ type: "err", text: "A nova senha deve ter no mínimo 8 caracteres." });
      return;
    }

    setPwdLoading(true);
    try {
      const res = await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwdMessage({ type: "err", text: data.error || "Erro ao alterar senha." });
        return;
      }
      setPwdMessage({ type: "ok", text: "Senha alterada com sucesso." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPwdMessage({ type: "err", text: "Falha de conexão com o servidor." });
    } finally {
      setPwdLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserMessage(null);
    setUserLoading(true);

    try {
      const res = await api("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername,
          nome: newUserNome,
          password: newUserPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUserMessage({ type: "err", text: data.error || "Erro ao criar usuário." });
        return;
      }
      setUserMessage({ type: "ok", text: `Usuário "${data.user.username}" criado.` });
      setNewUsername("");
      setNewUserNome("");
      setNewUserPassword("");
    } catch {
      setUserMessage({ type: "err", text: "Falha de conexão." });
    } finally {
      setUserLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-4">
          <KeyRound className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-slate-900">Alterar minha senha</h2>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <input
            type="password"
            placeholder="Senha atual"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            required
          />
          <input
            type="password"
            placeholder="Nova senha (mín. 8 caracteres)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            required
            minLength={8}
          />
          <input
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            required
          />
          {pwdMessage && (
            <p className={`text-sm ${pwdMessage.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
              {pwdMessage.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pwdLoading}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
          >
            {pwdLoading ? "Salvando…" : "Atualizar senha"}
          </button>
        </form>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-4">
            <UserPlus className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Novo usuário (admin)</h2>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-3">
            <input
              type="text"
              placeholder="Usuário (login)"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              required
            />
            <input
              type="text"
              placeholder="Nome completo"
              value={newUserNome}
              onChange={(e) => setNewUserNome(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              required
            />
            <input
              type="password"
              placeholder="Senha inicial"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              required
              minLength={8}
            />
            {userMessage && (
              <p className={`text-sm ${userMessage.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                {userMessage.text}
              </p>
            )}
            <button
              type="submit"
              disabled={userLoading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-500 disabled:opacity-60 cursor-pointer"
            >
              {userLoading ? "Criando…" : "Criar usuário"}
            </button>
          </form>

          <p className="text-[10px] text-slate-400 mt-4 flex items-start gap-1">
            <Shield className="w-3 h-3 shrink-0 mt-0.5" />
            Apenas administradores podem cadastrar novos logins. Altere a senha padrão do admin após o primeiro acesso.
          </p>
        </div>
      )}
    </div>
  );
}
