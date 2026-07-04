'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Shield, UserCheck, KeyRound, Home } from 'lucide-react';

export default function VisitorPortalHome() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100 px-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 text-blue-500">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Portal de Acesso</h1>
          <p className="text-sm text-zinc-400">Selecione uma das opções abaixo para prosseguir</p>
        </div>

        {/* Options */}
        <div className="space-y-3">

          {/* Morador — Portal */}
          <button
            onClick={() => router.push('/login/auth')}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-900/50 transition-all text-left group"
          >
            <div className="h-10 w-10 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Sou Morador</h3>
              <p className="text-xs text-zinc-400">Acesse o portal para gerenciar visitantes e prestadores</p>
            </div>
          </button>

          {/* Visitante — Tenho Convite */}
          <button
            onClick={() => router.push('/login/guest-complete')}
            className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900/50 transition-all text-left group"
          >
            <div className="h-10 w-10 rounded-lg bg-emerald-600/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Tenho um Convite</h3>
              <p className="text-xs text-zinc-400">Complete seus dados e libere seu acesso</p>
            </div>
          </button>

          {/* Morador — Primeiro Acesso (divider) */}
          <div className="relative flex items-center">
            <div className="flex-1 border-t border-zinc-800" />
            <span className="px-3 text-xs text-zinc-600">ou</span>
            <div className="flex-1 border-t border-zinc-800" />
          </div>

          <button
            onClick={() => router.push('/login/first-access')}
            className="w-full flex items-center gap-4 p-3.5 rounded-xl bg-zinc-950/50 border border-zinc-800/50 hover:border-zinc-700 hover:bg-zinc-900/30 transition-all text-left group"
          >
            <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 transition-colors">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-medium text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">Primeiro Acesso de Morador</h3>
              <p className="text-xs text-zinc-600">Ative seu cadastro criando sua senha de acesso</p>
            </div>
          </button>

        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-zinc-600">Sistema de Controle de Acesso</p>
        </div>

      </div>
    </div>
  );
}
