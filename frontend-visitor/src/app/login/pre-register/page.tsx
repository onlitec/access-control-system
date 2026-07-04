'use client';

import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, UserPlus, Briefcase, Send, Copy, Check, Loader2,
  Search, UserCheck, CheckCircle, Pencil, BadgeCheck,
} from 'lucide-react';
import {
  preRegisterVisitor, preRegisterProvider, getGrantableAccessLevels,
  getMyVisitors, getMyProviders, createNewVisit, createNewService,
} from '@/lib/residentApi';

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

const inputCls = "w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors";

function PreRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get('type') === 'provider' ? 'provider' : 'visitor';
  const isVisitor = type === 'visitor';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completionLink, setCompletionLink] = useState('');
  // tela de sucesso do fluxo "já cadastrado" sem link (visita/prestação autorizada)
  const [authorizedName, setAuthorizedName] = useState('');

  // modo: reutilizar cadastro existente ou cadastrar pessoa nova
  const [regMode, setRegMode] = useState<'existing' | 'new'>('new');
  const [existingList, setExistingList] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState<any | null>(null);
  const [editMode, setEditMode] = useState(false);

  // campos da NOVA visita/prestação (fluxo existente)
  const [nvEndTime, setNvEndTime] = useState('');
  const [nvPurpose, setNvPurpose] = useState('');
  const [nvPhone, setNvPhone] = useState('');
  const [nvEmail, setNvEmail] = useState('');
  const [nvPlate, setNvPlate] = useState('');
  const [nsServiceType, setNsServiceType] = useState('');
  const [nsValidFrom, setNsValidFrom] = useState('');
  const [nsValidUntil, setNsValidUntil] = useState('');

  // Visitor fields (cadastro novo)
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [visitEndTime, setVisitEndTime] = useState('');

  // Provider fields (cadastro novo)
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
    setSelectedSource(null);
    setSearchTerm('');
    getGrantableAccessLevels(type).then(setAvailableLevels).catch(() => setAvailableLevels([]));
    const fetchList = type === 'visitor' ? getMyVisitors() : getMyProviders();
    fetchList
      .then((list) => {
        setExistingList(list || []);
        // com cadastros anteriores, o caminho comum é reutilizar
        setRegMode((list || []).length > 0 ? 'existing' : 'new');
      })
      .catch(() => { setExistingList([]); setRegMode('new'); });
  }, [type]);

  function toggleLevel(id: string) {
    setSelectedLevelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // A mesma pessoa aparece 1x (não uma vez por visita antiga): dedup por
  // documento quando houver, senão por nome completo normalizado.
  const dedupedPeople = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of existingList) {
      const doc = (item.document || item.certificateNo || '').replace(/\D/g, '');
      const label = isVisitor
        ? `${item.name || ''} ${item.surname || ''}`.trim().toLowerCase()
        : (item.fullName || '').trim().toLowerCase();
      const key = doc || label;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [existingList, isVisitor]);

  const filteredPeople = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return dedupedPeople;
    return dedupedPeople.filter((item) => {
      const label = isVisitor
        ? `${item.name || ''} ${item.surname || ''}`.toLowerCase()
        : (item.fullName || '').toLowerCase();
      const doc = (item.document || item.certificateNo || '').toLowerCase();
      const tel = (item.phone || '').toLowerCase();
      return label.includes(q) || doc.includes(q) || tel.includes(q);
    });
  }, [dedupedPeople, searchTerm, isVisitor]);

  function selectSource(item: any) {
    setSelectedSource(item);
    setEditMode(false);
    setError('');
    // pré-preenche os campos editáveis com os dados da origem
    setNvPhone(item.phone || '');
    setNvEmail(item.email || '');
    setNvPlate(item.plateNo || '');
    setNvPurpose(isVisitor ? (item.purpose || '') : '');
    setNvEndTime('');
    setNsServiceType(!isVisitor ? (item.serviceType || '') : '');
    setNsValidFrom('');
    setNsValidUntil('');
    // pré-marca os níveis da última visita/prestação que ainda estão no pool
    const snapshot: any[] = Array.isArray(item.selectedAccessLevels) ? item.selectedAccessLevels : [];
    setSelectedLevelIds(
      availableLevels
        .filter((l) => snapshot.some((s) => s.hikAccessLevelId === l.hikAccessLevelId))
        .map((l) => l.id)
    );
  }

  async function handleSubmitExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSource) return;
    setError('');
    setLoading(true);
    try {
      if (isVisitor) {
        const payload: any = {
          visitEndTime: nvEndTime || undefined,
          purpose: nvPurpose || undefined,
          selectedAccessLevelIds: selectedLevelIds,
        };
        if (editMode) {
          payload.phone = nvPhone || undefined;
          payload.email = nvEmail || undefined;
          payload.plate = nvPlate || undefined;
        }
        const resp = await createNewVisit(selectedSource.id, payload);
        if (resp.completionLink) {
          setCompletionLink(resp.completionLink);
        } else {
          setAuthorizedName(`${selectedSource.name} ${selectedSource.surname || ''}`.trim());
        }
      } else {
        const payload: any = {
          serviceType: nsServiceType || undefined,
          validFrom: nsValidFrom || undefined,
          validUntil: nsValidUntil || undefined,
          selectedAccessLevelIds: selectedLevelIds,
        };
        if (editMode) {
          payload.phone = nvPhone || undefined;
          payload.email = nvEmail || undefined;
        }
        await createNewService(selectedSource.id, payload);
        setAuthorizedName(selectedSource.fullName);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

  const levelsBlock = availableLevels.length > 0 && (
    <div className="space-y-2">
      <label className="text-xs text-zinc-400">
        {isVisitor ? 'Níveis de acesso liberados para este visitante' : 'Níveis de acesso liberados para este prestador'}
      </label>
      <div className="space-y-1.5 bg-zinc-950 border border-zinc-700 rounded-lg p-3">
        {availableLevels.map(lvl => (
          <label key={lvl.id} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={selectedLevelIds.includes(lvl.id)}
              onChange={() => toggleLevel(lvl.id)} className={isVisitor ? 'accent-blue-500' : 'accent-purple-500'} />
            {lvl.name}
          </label>
        ))}
      </div>
    </div>
  );

  const errorBlock = error && (
    <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>
  );

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
              {isVisitor ? 'Cadastrar Visita' : 'Cadastrar Prestação de Serviço'}
            </h1>
          </div>
        </div>

        {authorizedName ? (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-emerald-700/40 rounded-2xl p-6 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400">
                <CheckCircle className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-bold">{isVisitor ? 'Visita autorizada!' : 'Prestação registrada!'}</h2>
              <p className="text-sm text-zinc-400">
                {isVisitor
                  ? <>A nova visita de <span className="text-zinc-200 font-medium">{authorizedName}</span> já está autorizada — não é preciso refazer o cadastro.</>
                  : <>A nova prestação de <span className="text-zinc-200 font-medium">{authorizedName}</span> foi registrada e já está visível para a portaria.</>}
              </p>
            </div>
            <button
              onClick={() => router.push('/login/dashboard')}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm font-medium"
            >
              Voltar ao painel
            </button>
            <button
              onClick={() => { setAuthorizedName(''); setSelectedSource(null); setSearchTerm(''); }}
              className="w-full py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-600 transition-colors text-sm text-zinc-400"
            >
              {isVisitor ? 'Cadastrar outra visita' : 'Cadastrar outra prestação'}
            </button>
          </div>
        ) : completionLink ? (
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
                setSelectedSource(null); setSearchTerm('');
              }}
              className="w-full py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-600 transition-colors text-sm text-zinc-400"
            >
              Cadastrar outra visita
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Seletor de modo */}
            {dedupedPeople.length > 0 && (
              <div className="flex gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => { setRegMode('existing'); setError(''); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${regMode === 'existing' ? (isVisitor ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white') : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {isVisitor ? 'Visitante já cadastrado' : 'Prestador já cadastrado'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRegMode('new'); setSelectedSource(null); setError(''); setSelectedLevelIds([]); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${regMode === 'new' ? (isVisitor ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white') : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {isVisitor ? 'Novo visitante' : 'Novo prestador'}
                </button>
              </div>
            )}

            {regMode === 'existing' && dedupedPeople.length > 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                {!selectedSource ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nome, documento ou telefone..."
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {filteredPeople.length === 0 ? (
                        <p className="text-xs text-zinc-500 text-center py-6">Nenhum cadastro encontrado para essa busca.</p>
                      ) : filteredPeople.map((item) => {
                        const label = isVisitor ? `${item.name} ${item.surname || ''}`.trim() : item.fullName;
                        const verified = Boolean(isVisitor ? item.photo_url : item.photoUrl);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectSource(item)}
                            className="w-full flex items-center justify-between gap-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-xl px-4 py-3 text-left transition-colors"
                          >
                            <div>
                              <p className="text-sm font-medium">{label}</p>
                              <p className="text-xs text-zinc-500">
                                {[item.phone, !isVisitor && item.serviceType].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            {verified && (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 rounded-full px-2 py-0.5 shrink-0">
                                <BadgeCheck className="h-3 w-3" /> verificado
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleSubmitExisting} className="space-y-4">
                    {/* Card-resumo da pessoa selecionada */}
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">
                          {isVisitor ? `${selectedSource.name} ${selectedSource.surname || ''}`.trim() : selectedSource.fullName}
                        </p>
                        <button type="button" onClick={() => setSelectedSource(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
                          trocar
                        </button>
                      </div>
                      {(selectedSource.document || selectedSource.certificateNo) && (
                        <p className="text-xs text-zinc-500">Doc: {selectedSource.document || selectedSource.certificateNo}</p>
                      )}
                      {!editMode && (selectedSource.phone || selectedSource.email) && (
                        <p className="text-xs text-zinc-500">
                          {[selectedSource.phone, selectedSource.email].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {Boolean(isVisitor ? selectedSource.photo_url : selectedSource.photoUrl) && (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-400">
                          <UserCheck className="h-3 w-3" /> identidade já verificada — {isVisitor ? 'a visita será autorizada na hora' : 'sem novo cadastro'}
                        </p>
                      )}
                    </div>

                    {/* Campos da nova visita/prestação */}
                    {isVisitor ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">Finalidade da visita</label>
                          <input value={nvPurpose} onChange={e => setNvPurpose(e.target.value)} placeholder="Ex: Visita social..." className={inputCls} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">Válido até</label>
                          <input type="datetime-local" value={nvEndTime} onChange={e => setNvEndTime(e.target.value)} className={inputCls} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">Tipo de serviço</label>
                          <input value={nsServiceType} onChange={e => setNsServiceType(e.target.value)} className={inputCls} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-zinc-400">Válido de</label>
                            <input type="date" value={nsValidFrom} onChange={e => setNsValidFrom(e.target.value)} className={inputCls} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-zinc-400">Válido até</label>
                            <input type="date" value={nsValidUntil} onChange={e => setNsValidUntil(e.target.value)} className={inputCls} />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Alterar dados de contato (opcional) */}
                    {!editMode ? (
                      <button
                        type="button"
                        onClick={() => setEditMode(true)}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Alterar dados de contato
                      </button>
                    ) : (
                      <div className="space-y-3 border border-zinc-800 rounded-xl p-3">
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">Telefone</label>
                          <input type="tel" value={nvPhone} onChange={e => setNvPhone(e.target.value)} className={inputCls} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">E-mail</label>
                          <input type="email" value={nvEmail} onChange={e => setNvEmail(e.target.value)} className={inputCls} />
                        </div>
                        {isVisitor && (
                          <div className="space-y-1">
                            <label className="text-xs text-zinc-400">Placa do veículo</label>
                            <input value={nvPlate} onChange={e => setNvPlate(e.target.value)} className={inputCls} />
                          </div>
                        )}
                      </div>
                    )}

                    {levelsBlock}
                    {errorBlock}

                    <button type="submit" disabled={loading}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors text-sm font-semibold disabled:opacity-50 ${isVisitor ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'}`}>
                      <Send className="h-4 w-4" />
                      {loading ? 'Enviando...' : isVisitor ? 'Confirmar Visita' : 'Confirmar Prestação'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                {isVisitor ? (
                  <form onSubmit={handleSubmitVisitor} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-400">Nome *</label>
                        <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-400">Sobrenome</label>
                        <input value={surname} onChange={e => setSurname(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">Telefone</label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">E-mail</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">Finalidade da visita</label>
                      <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Ex: Visita social, entrega..." className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">Válido até</label>
                      <input type="datetime-local" value={visitEndTime} onChange={e => setVisitEndTime(e.target.value)} className={inputCls} />
                    </div>
                    {levelsBlock}
                    {errorBlock}
                    <button type="submit" disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-semibold disabled:opacity-50">
                      <Send className="h-4 w-4" /> {loading ? 'Gerando...' : 'Gerar Link de Convite'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSubmitProvider} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">Nome completo *</label>
                      <input value={fullName} onChange={e => setFullName(e.target.value)} required className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">CPF / RG *</label>
                      <input value={document} onChange={e => setDocument(e.target.value)} required className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">Tipo de serviço *</label>
                      <input value={serviceType} onChange={e => setServiceType(e.target.value)} required
                        placeholder="Ex: Encanador, Elétrica, Limpeza..." className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">Telefone</label>
                      <input type="tel" value={providerPhone} onChange={e => setProviderPhone(e.target.value)} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-400">Válido de</label>
                        <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className={inputCls} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-400">Válido até</label>
                        <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    {levelsBlock}
                    {errorBlock}
                    <button type="submit" disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 transition-colors text-sm font-semibold disabled:opacity-50">
                      <Send className="h-4 w-4" /> {loading ? 'Cadastrando...' : 'Cadastrar Prestador'}
                    </button>
                  </form>
                )}
              </div>
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
