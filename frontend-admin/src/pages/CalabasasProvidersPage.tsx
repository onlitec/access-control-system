import React, { useState, useEffect } from 'react';
import { getCalabasasProviders, CalabasasPerson } from '@/services/api';
import { HardHat, Search, Loader2, AlertTriangle, RefreshCw, Phone, Mail, FileText } from 'lucide-react';

export default function CalabasasProvidersPage() {
    const [persons, setPersons] = useState<CalabasasPerson[]>([]);
    const [filtered, setFiltered] = useState<CalabasasPerson[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const loadPersons = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getCalabasasProviders();
            setPersons(result.data || []);
            setLastUpdate(new Date());
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar prestadores Calabasas');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPersons();
    }, []);

    useEffect(() => {
        if (!search.trim()) {
            setFiltered(persons);
            return;
        }
        const q = search.toLowerCase();
        setFiltered(persons.filter(p =>
            p.person_name.toLowerCase().includes(q) ||
            p.phone_num?.toLowerCase().includes(q) ||
            p.certificate_no?.toLowerCase().includes(q) ||
            p.job_title?.toLowerCase().includes(q) ||
            p.email?.toLowerCase().includes(q)
        ));
    }, [persons, search]);

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1><HardHat size={24} /> Prestadores Calabasas</h1>
                    <p>
                        {persons.length} prestadores no departamento <strong>PRESTADORES</strong> do HikCentral
                        {lastUpdate && <span className="text-muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                            · Atualizado às {lastUpdate.toLocaleTimeString('pt-BR')}
                        </span>}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        Prestadores de serviços permanentes do condomínio Calabasas — cadastrados no módulo de pessoas/ACS
                    </p>
                </div>
                <button className="btn btn-ghost" onClick={loadPersons} disabled={loading}>
                    {loading ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
                    {loading ? ' Carregando...' : ' Atualizar'}
                </button>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            <div className="search-bar">
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Buscar por nome, documento, cargo ou telefone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Cargo / Função</th>
                            <th>Documento</th>
                            <th>Telefone</th>
                            <th>Email</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="table-empty"><Loader2 size={20} className="spin" /> Carregando...</td></tr>
                        ) : filtered.length > 0 ? (
                            filtered.map((p) => (
                                <tr key={p.id}>
                                    <td className="td-name">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div className="person-avatar-sm">
                                                {(p.person_name || '?').charAt(0).toUpperCase()}
                                            </div>
                                            {p.person_name || '—'}
                                        </div>
                                    </td>
                                    <td>
                                        {p.job_title ? (
                                            <span className="badge">{p.job_title}</span>
                                        ) : '—'}
                                    </td>
                                    <td>
                                        {p.certificate_no ? (
                                            <span className="td-doc">
                                                <FileText size={13} /> {p.certificate_no}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td>
                                        {p.phone_num ? (
                                            <span className="td-doc">
                                                <Phone size={13} /> {p.phone_num}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td>
                                        {p.email ? (
                                            <span className="td-doc">
                                                <Mail size={13} /> {p.email}
                                            </span>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={5} className="table-empty">
                                {search ? 'Nenhum prestador encontrado para a busca.' : 'Nenhum prestador Calabasas cadastrado no departamento PRESTADORES.'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Exibindo {filtered.length} de {persons.length} pessoas
            </p>
        </div>
    );
}
