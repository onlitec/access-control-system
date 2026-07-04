'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, ArrowLeft, LogIn, Eye, EyeOff } from 'lucide-react';

const API = typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

async function loginResident(cpf: string, password: string) {
  const res = await fetch(`${API}/resident/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Dados inválidos.');
  return data as { token: string; resident: Record<string, any> };
}

export default function ResidentLoginPage() {
  const router = useRouter();
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function formatCpf(value: string) {
    return value.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, resident } = await loginResident(cpf, password);
      localStorage.setItem('resident_token', token);
      localStorage.setItem('resident_info', JSON.stringify(resident));
      router.push('/login/dashboard');
    } catch (err: any) {
      setError(err.message || 'Dados inválidos. Verifique seu CPF e senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100 px-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 text-blue-500">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Portal do Morador</h1>
          <p className="text-sm text-zinc-400">Informe seu CPF e senha de acesso</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">CPF</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">Senha</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Sua senha de acesso"
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
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-semibold disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-600">
          Sem senha? Solicite o link de primeiro acesso à portaria.
        </p>

        <button
          onClick={() => router.push('/login')}
          className="w-full flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Voltar ao início
        </button>
      </div>
    </div>
  );
}
