"use client";

import { useEffect, useState } from "react";
import { KeyRound, Eye, EyeOff, CheckCircle, Camera, Clock, IdCard } from "lucide-react";
import SelfieCapture from "@/components/SelfieCapture";
import { formatCpf, isValidCpf } from "@/lib/cpf";

type Step = "greeting" | "cpf" | "password" | "selfie" | "done" | "pending";

export default function FirstAccess() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [morador, setMorador] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("greeting");

  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState("");

  const [selfie, setSelfie] = useState<string | null>(null);
  const [selfieError, setSelfieError] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tk = searchParams.get("token");
    if (!tk) {
      setErrorMsg("Link de acesso inválido ou expirado. Entre em contato com a portaria.");
      setLoading(false);
      return;
    }
    setToken(tk);
    validateToken(tk);
  }, []);

  const validateToken = async (tk: string) => {
    try {
      const res = await fetch("/api/onboarding/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tk }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro ao validar link de acesso");
      setMorador(data);
      setStep("cpf");
    } catch (err: any) {
      setErrorMsg(err.message || "Falha na validação do token.");
    } finally {
      setLoading(false);
    }
  };

  const handleCpfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpfError("");

    if (!isValidCpf(cpf)) {
      setCpfError("CPF inválido. Confira os números digitados.");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/onboarding/confirm-cpf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, cpf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "CPF não confere");
      setStep("password");
    } catch (err: any) {
      setCpfError(err.message || "CPF não confere com o cadastro.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (password.length < 6) {
      setFormError("A senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setFormError("As senhas não coincidem.");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro ao salvar senha");
      setStep(data.nextStep === "selfie" ? "selfie" : "done");
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar senha.");
    } finally {
      setSaving(false);
    }
  };

  const handleSelfieSubmit = async () => {
    if (!selfie) return;
    setSelfieError("");

    try {
      setSaving(true);
      const res = await fetch("/api/onboarding/selfie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, photoBase64: selfie }),
      });
      const data = await res.json();

      if (!res.ok) {
        // 422: problema com a foto de referência cadastrada (não é culpa do morador)
        setSelfieError(data.message || "Erro ao processar a foto.");
        return;
      }

      if (data.approved) {
        setStep("done");
        return;
      }

      if (data.pendingReview) {
        setStep("pending");
        return;
      }

      // Não aprovado, ainda há tentativas
      setSelfieError(data.message || "A foto não corresponde ao cadastro. Tente novamente.");
      setAttemptsRemaining(data.attemptsRemaining ?? null);
      setSelfie(null);
    } catch (err: any) {
      setSelfieError(err.message || "Erro ao enviar a foto.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="mt-4 text-sm text-zinc-400">Verificando link de acesso...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-950 border border-red-800 text-red-400 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-3">Ops! Link Expirado ou Inválido</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">{errorMsg}</p>
          <a href="/login" className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 h-12 text-sm font-semibold transition-all">
            Voltar para o Login
          </a>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 mb-6">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Cadastro concluído!</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            Sua identidade foi confirmada. Agora você pode acessar o portal do morador com seu CPF e a senha que acabou de criar.
          </p>
          <a
            href="/login/auth"
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 h-12 text-sm font-semibold transition-all shadow-lg shadow-blue-500/10"
          >
            Acessar o Portal
          </a>
        </div>
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-950 border border-amber-800 text-amber-400 mb-6">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Cadastro em análise</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            Não conseguimos confirmar sua identidade automaticamente após várias tentativas.
            Seu cadastro foi enviado para a portaria, que irá revisar manualmente. Você será
            notificado quando for aprovado — tente acessar o portal novamente mais tarde.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 sm:p-8">
        {step === "cpf" && (
          <>
            <div className="text-center mb-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-500 mb-4">
                <IdCard className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-white mb-1">Confirme seu CPF</h1>
              <p className="text-sm text-zinc-400">
                Olá, <span className="font-semibold text-zinc-200">{morador?.name}</span>!<br />
                Para sua segurança, confirme o CPF cadastrado.
              </p>
            </div>
            <form onSubmit={handleCpfSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400">CPF</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  maxLength={14}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>
              {cpfError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{cpfError}</p>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed h-12 text-sm font-semibold transition-all"
              >
                {saving ? "Verificando..." : "Continuar"}
              </button>
            </form>
          </>
        )}

        {step === "password" && (
          <>
            <div className="text-center mb-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-500 mb-4">
                <KeyRound className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-white mb-1">Criar Senha de Acesso</h1>
              <p className="text-sm text-zinc-400">Crie sua senha para acessar o portal do morador.</p>
            </div>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400">Nova senha</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400">Confirmar senha</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repita a senha"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{formError}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed h-12 text-sm font-semibold transition-all"
              >
                {saving ? "Salvando..." : "Continuar"}
              </button>
            </form>
          </>
        )}

        {step === "selfie" && (
          <>
            <div className="text-center mb-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-500 mb-4">
                <Camera className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-white mb-1">Verificação Facial</h1>
              <p className="text-sm text-zinc-400">
                Tire uma selfie para confirmarmos que é você. Olhe para a câmera com boa iluminação.
              </p>
            </div>

            <SelfieCapture photoBase64={selfie} onCapture={setSelfie} onClear={() => setSelfie(null)} />

            {selfieError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2 mt-4">
                {selfieError}
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <span className="block mt-1 text-zinc-500">
                    Tentativas restantes: {attemptsRemaining}
                  </span>
                )}
              </p>
            )}

            <button
              type="button"
              onClick={handleSelfieSubmit}
              disabled={!selfie || saving}
              className="flex w-full items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed h-12 text-sm font-semibold transition-all mt-4"
            >
              {saving ? "Verificando..." : "Confirmar Identidade"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
