'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Plus, Users, Briefcase, LogOut, Copy, Check, Clock, UserCheck, X, Car } from 'lucide-react';
import { getMyVisitors, getMyProviders, logoutResident, approveVisitor, rejectVisitor } from '@/lib/residentApi';

type Visitor = {
  id: string;
  name: string;
  surname?: string;
  phone?: string;
  status?: string;
  visitStartTime?: string;
  visitEndTime?: string;
  inviteToken?: string;
  photo_url?: string | null;
  plateNo?: string | null;
  certificateNo?: string | null;
};

type Provider = {
  id: string;
  fullName: string;
  serviceType: string;
  phone?: string;
  validFrom?: string;
  validUntil?: string;
};

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PRE_REGISTERED: { label: 'Link enviado', cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
    PENDING_APPROVAL: { label: 'Aguardando você', cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/50' },
    REJECTED: { label: 'Recusado', cls: 'bg-red-900/40 text-red-400 border-red-700/50' },
    ACTIVE: { label: 'Ativo', cls: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/50' },
    COMPLETED: { label: 'Finalizado', cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  };
  const s = map[status ?? ''] ?? { label: status ?? '—', cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s.cls}`}>{s.label}</span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="text-zinc-500 hover:text-blue-400 transition-colors" title="Copiar link">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ApprovalCard({ visitor, onDone }: { visitor: Visitor; onDone: (updated: Visitor) => void }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Visitor>) {
    setBusy(true);
    setError(null);
    try {
      onDone(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-yellow-700/40 rounded-xl p-4 space-y-3">
      <div className="flex gap-3">
        {visitor.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={visitor.photo_url} alt={`Foto de ${visitor.name}`} className="h-20 w-20 rounded-lg object-cover border border-zinc-800" />
        ) : (
          <div className="h-20 w-20 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-xs text-zinc-600">Sem foto</div>
        )}
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-sm">{visitor.name} {visitor.surname}</p>
          {visitor.certificateNo && !/^(pre|res)-/.test(visitor.certificateNo) && (
            <p className="text-xs text-zinc-500">Documento: {visitor.certificateNo}</p>
          )}
          {visitor.plateNo && (
            <p className="text-xs text-zinc-500 flex items-center gap-1"><Car className="h-3 w-3" /> {visitor.plateNo}</p>
          )}
          {visitor.visitStartTime && (
            <p className="text-xs text-zinc-600 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(visitor.visitStartTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              {visitor.visitEndTime && ` até ${new Date(visitor.visitEndTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
            </p>
          )}
        </div>
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <label htmlFor={`reason-${visitor.id}`} className="text-xs text-zinc-400">Motivo (opcional, o visitante verá esta mensagem)</label>
          <textarea
            id={`reason-${visitor.id}`}
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => rejectVisitor(visitor.id, reason))}
              className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm font-semibold"
            >
              Confirmar recusa
            </button>
            <button
              disabled={busy}
              onClick={() => setRejecting(false)}
              className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => run(() => approveVisitor(visitor.id))}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold"
          >
            <Check className="h-4 w-4" /> {busy ? 'Liberando...' : 'Aprovar e liberar'}
          </button>
          <button
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
          >
            <X className="h-4 w-4" /> Recusar
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function ResidentDashboard() {
  const router = useRouter();
  const [resident, setResident] = useState<any>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [tab, setTab] = useState<'visitors' | 'providers'>('visitors');
  const [loading, setLoading] = useState(true);

  const APP_URL = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    const info = localStorage.getItem('resident_info');
    const token = localStorage.getItem('resident_token');
    if (!token || !info) {
      router.replace('/login/auth');
      return;
    }
    setResident(JSON.parse(info));
    Promise.all([getMyVisitors(), getMyProviders()])
      .then(([v, p]) => { setVisitors(v); setProviders(p); })
      .catch(() => router.replace('/login/auth'))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    await logoutResident();
    router.replace('/login');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-500 text-sm">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-blue-600/10 flex items-center justify-center border border-blue-500/20 text-blue-500">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{resident?.name}</p>
            <p className="text-xs text-zinc-500">
              {[resident?.tower && `Torre ${resident.tower}`, resident?.unit && `Apt ${resident.unit}`].filter(Boolean).join(' · ') || 'Morador'}
            </p>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors">
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-800">
          <button
            onClick={() => setTab('visitors')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'visitors' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            <Users className="h-4 w-4" /> Visitantes
            <span className="ml-1 text-xs bg-zinc-800 px-1.5 py-0.5 rounded-full">{visitors.length}</span>
          </button>
          <button
            onClick={() => setTab('providers')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'providers' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            <Briefcase className="h-4 w-4" /> Prestadores
            <span className="ml-1 text-xs bg-zinc-800 px-1.5 py-0.5 rounded-full">{providers.length}</span>
          </button>
        </div>

        {/* Aprovações pendentes */}
        {tab === 'visitors' && visitors.some((v) => v.status === 'PENDING_APPROVAL') && (
          <section className="space-y-3" aria-label="Aprovações pendentes">
            <h2 className="text-sm font-semibold text-yellow-400">Aguardando sua aprovação</h2>
            {visitors.filter((v) => v.status === 'PENDING_APPROVAL').map((v) => (
              <ApprovalCard
                key={v.id}
                visitor={v}
                onDone={(updated) => setVisitors((list) => list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))}
              />
            ))}
          </section>
        )}

        {/* Action Button */}
        <button
          onClick={() => router.push(`/login/pre-register?type=${tab === 'visitors' ? 'visitor' : 'provider'}`)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          {tab === 'visitors' ? 'Pré-cadastrar Visitante' : 'Pré-cadastrar Prestador'}
        </button>

        {/* Visitors List */}
        {tab === 'visitors' && (
          <div className="space-y-3">
            {visitors.length === 0 ? (
              <div className="text-center py-10 text-zinc-600 text-sm">
                <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum visitante cadastrado
              </div>
            ) : visitors.filter((v) => v.status !== 'PENDING_APPROVAL').map((v) => {
              const inviteLink = v.inviteToken ? `${APP_URL}/login/guest-complete?token=${v.inviteToken}` : null;
              return (
                <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{v.name} {v.surname}</p>
                      {v.phone && <p className="text-xs text-zinc-500">{v.phone}</p>}
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                  {v.visitEndTime && (
                    <p className="text-xs text-zinc-600 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Até {new Date(v.visitEndTime).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  {inviteLink && v.status === 'PRE_REGISTERED' && (
                    <div className="flex items-center gap-2 bg-zinc-950 rounded-lg px-3 py-1.5 border border-zinc-800">
                      <p className="text-xs text-zinc-500 truncate flex-1 font-mono">{inviteLink}</p>
                      <CopyButton text={inviteLink} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Providers List */}
        {tab === 'providers' && (
          <div className="space-y-3">
            {providers.length === 0 ? (
              <div className="text-center py-10 text-zinc-600 text-sm">
                <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum prestador cadastrado
              </div>
            ) : providers.map((p) => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                <p className="font-medium text-sm">{p.fullName}</p>
                <p className="text-xs text-zinc-500">{p.serviceType}</p>
                {p.phone && <p className="text-xs text-zinc-600">{p.phone}</p>}
                {(p.validFrom || p.validUntil) && (
                  <p className="text-xs text-zinc-600 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {p.validFrom && new Date(p.validFrom).toLocaleDateString('pt-BR')}
                    {p.validUntil && ` → ${new Date(p.validUntil).toLocaleDateString('pt-BR')}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
