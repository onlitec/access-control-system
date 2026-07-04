'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, UserPlus, Briefcase, Send, Copy, Check, Loader2 } from 'lucide-react';
import { preRegisterVisitor, preRegisterProvider, getGrantableAccessLevels } from '@/lib/residentApi';

type GrantableLevel = { id: string; hikAccessLevelId: string; name: string };

function CopyLinkBlock({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className="bg-zinc-950 rounded-xl border border-emerald-700/40 p-4 space-y-3">
      <p className="text-sm text-emerald-400 font-medium">Convite gerado com sucesso!</p>
      <p className="text-xs text-zinc-400">Compartilhe este link com o visitante:</p>
      <div className="flex items-center gap-2">
        <p className="text-xs font-mono text-zinc-300 truncate flex-1 bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800">
          {link}
        </p>
        <button onClick={copy} className="shrink-0 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs flex items-center gap-1.5">
          {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
        </button>
      </div>
    </div>
  );
}

function PreRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get('type') === 'provider' ? 'provider' : 'visitor';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completionLink, setCompletionLink] = useState('');

  // Visitor fields
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [visitEndTime, setVisitEndTime] = useState('');

  // Provider fields
  const [fullName, setFullName] = useState('');
  const [document, setDocument] = useState('');
  const [providerPhone, setProviderPhone] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');

  // Níveis de acesso pré-aprovados pelo admin (pool separado por tipo)
  const [availableLevels, setAvailableLevels] = useState<GrantableLevel[]>([]);
  const [selectedLevelIds, setSelectedLevelIds] = useState<string[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('resident_token');
    if (!token) router.replace('/login/auth');
  }, [router]);

  useEffect(() => {
    setSelectedLevelIds([]);
    getGrantableAccessLevels(type).then(setAvailableLevels).catch(() => setAvailableLevels([]));
  }, [type]);

  function toggleLevel(id: string) {
    setSelectedLevelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmitVisitor(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { completionLink: link } = await preRegisterVisitor({
        name,
        surname,
        phone: phone || undefined,
        email: email || undefined,
        purpose: purpose || undefined,
        type: 'VISITOR',
        visitEndTime: visitEndTime || undefined,
        selectedAccessLevelIds: selectedLevelIds,
      });
      setCompletionLink(link);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitProvider(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await preRegisterProvider({
        fullName,
        document,
        phone: providerPhone || undefined,
        serviceType,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
        selectedAccessLevelIds: selectedLevelIds,
      });
      router.push('/login/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isVisitor = type === 'visitor';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/login/dashboard')} className="text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {isVisitor
              ? <UserPlus className="h-5 w-5 text-blue-400" />
              : <Briefcase className="h-5 w-5 text-purple-400" />}
            <h1 className="text-lg font-bold">
              {isVisitor ? 'Pré-cadastrar Visitante' : 'Pré-cadastrar Prestador'}
            </h1>
          </div>
        </div>

        {completionLink ? (
          <div className="space-y-4">
            <CopyLinkBlock link={completionLink} />
            <p className="text-xs text-zinc-500 text-center">
              O visitante deverá abrir este link e preencher seus dados para liberar o acesso.
            </p>
            <button
              onClick={() => router.push('/login/dashboard')}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm font-medium"
            >
              Voltar ao painel
            </button>
            <button
              onClick={() => {
                setCompletionLink('');
                setName(''); setSurname(''); setPhone(''); setEmail(''); setPurpose(''); setVisitEndTime('');
                setSelectedLevelIds([]);
              }}
              className="w-full py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-600 transition-colors text-sm text-zinc-400"
            >
              Cadastrar outro visitante
            </button>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            {isVisitor ? (
              <form onSubmit={handleSubmitVisitor} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Nome *</label>
                    <input value={name} onChange={e => setName(e.target.value)} required
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Sobrenome</label>
                    <input value={surname} onChange={e => setSurname(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Telefone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">E-mail</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Finalidade da visita</label>
                  <input value={purpose} onChange={e => setPurpose(e.target.value)}
                    placeholder="Ex: Visita social, entrega..."
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Válido até</label>
                  <input type="datetime-local" value={visitEndTime} onChange={e => setVisitEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                {availableLevels.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Níveis de acesso liberados para este visitante</label>
                    <div className="space-y-1.5 bg-zinc-950 border border-zinc-700 rounded-lg p-3">
                      {availableLevels.map(lvl => (
                        <label key={lvl.id} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                          <input type="checkbox" checked={selectedLevelIds.includes(lvl.id)}
                            onChange={() => toggleLevel(lvl.id)} className="accent-blue-500" />
                          {lvl.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {error && <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-semibold disabled:opacity-50">
                  <Send className="h-4 w-4" /> {loading ? 'Gerando...' : 'Gerar Link de Convite'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmitProvider} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Nome completo *</label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">CPF / RG *</label>
                  <input value={document} onChange={e => setDocument(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Tipo de serviço *</label>
                  <input value={serviceType} onChange={e => setServiceType(e.target.value)} required
                    placeholder="Ex: Encanador, Elétrica, Limpeza..."
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Telefone</label>
                  <input type="tel" value={providerPhone} onChange={e => setProviderPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Válido de</label>
                    <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400">Válido até</label>
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                  </div>
                </div>
                {availableLevels.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400">Níveis de acesso liberados para este prestador</label>
                    <div className="space-y-1.5 bg-zinc-950 border border-zinc-700 rounded-lg p-3">
                      {availableLevels.map(lvl => (
                        <label key={lvl.id} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                          <input type="checkbox" checked={selectedLevelIds.includes(lvl.id)}
                            onChange={() => toggleLevel(lvl.id)} className="accent-purple-500" />
                          {lvl.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {error && <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 transition-colors text-sm font-semibold disabled:opacity-50">
                  <Send className="h-4 w-4" /> {loading ? 'Cadastrando...' : 'Cadastrar Prestador'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PreRegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    }>
      <PreRegisterContent />
    </Suspense>
  );
}
