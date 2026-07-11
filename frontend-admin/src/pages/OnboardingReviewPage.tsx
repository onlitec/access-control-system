import React, { useState, useEffect } from 'react';
import {
    getOnboardingPendingReviews,
    approveOnboardingReview,
    rejectOnboardingReview,
    OnboardingPendingReview,
} from '@/services/api';
import { UserCheck, Clock, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const POLL_INTERVAL_MS = 30_000;

export default function OnboardingReviewPage() {
    const [items, setItems] = useState<OnboardingPendingReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [rejectTarget, setRejectTarget] = useState<OnboardingPendingReview | null>(null);
    const [rejectNotes, setRejectNotes] = useState('');

    const loadData = async () => {
        try {
            const res = await getOnboardingPendingReviews();
            setItems(res.data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar revisões pendentes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    const handleApprove = async (personId: string) => {
        setActionLoading(personId);
        try {
            await approveOnboardingReview(personId);
            await loadData();
        } catch (err: any) {
            alert(err.message || 'Erro ao aprovar cadastro');
        } finally {
            setActionLoading(null);
        }
    };

    const openReject = (item: OnboardingPendingReview) => {
        setRejectTarget(item);
        setRejectNotes('');
    };

    const confirmReject = async () => {
        if (!rejectTarget) return;
        setActionLoading(rejectTarget.personId);
        try {
            await rejectOnboardingReview(rejectTarget.personId, rejectNotes || undefined);
            setRejectTarget(null);
            await loadData();
        } catch (err: any) {
            alert(err.message || 'Erro ao rejeitar cadastro');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <UserCheck size={24} />
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Aprovação Facial Pendente</h1>
                </div>
                <button
                    onClick={() => { setLoading(true); loadData(); }}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <RefreshCw size={16} /> Atualizar
                </button>
            </div>

            <p style={{ color: 'var(--text-secondary, #888)', fontSize: '0.875rem', marginBottom: '20px' }}>
                Moradores cujo cadastro não foi confirmado automaticamente por verificação facial após 5 tentativas.
                Compare a foto de referência com a selfie enviada e decida se aprova ou rejeita o cadastro.
            </p>

            {error && (
                <div className="alert alert-warning" style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--red-500)', color: 'var(--red-400)', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', borderRadius: 'var(--radius)', padding: '12px' }}>
                    <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                    <div>{error}</div>
                </div>
            )}

            {loading ? (
                <p>Carregando...</p>
            ) : items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary, #888)' }}>
                    <CheckCircle size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p>Nenhum cadastro pendente de revisão no momento.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                    {items.map((item) => (
                        <div
                            key={item.personId}
                            style={{
                                border: '1px solid var(--border-color, #333)',
                                borderRadius: 'var(--radius, 8px)',
                                padding: '16px',
                                display: 'flex',
                                gap: '20px',
                                alignItems: 'center',
                            }}
                        >
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #888)', marginBottom: '4px' }}>Referência</div>
                                    {item.referencePhotoUrl ? (
                                        <img
                                            src={item.referencePhotoUrl}
                                            alt="Foto de referência"
                                            style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color, #333)' }}
                                        />
                                    ) : (
                                        <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: 'var(--bg-secondary, #222)' }} />
                                    )}
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #888)', marginBottom: '4px' }}>Selfie enviada</div>
                                    {item.lastSelfieUrl ? (
                                        <img
                                            src={item.lastSelfieUrl}
                                            alt="Selfie enviada"
                                            style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color, #333)' }}
                                        />
                                    ) : (
                                        <div style={{ width: '80px', height: '80px', borderRadius: '8px', background: 'var(--bg-secondary, #222)' }} />
                                    )}
                                </div>
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{item.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)' }}>
                                    {[item.tower, item.block, item.unit].filter(Boolean).join(' · ') || 'Unidade não informada'}
                                </div>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.75rem' }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
                                        borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--amber-400)',
                                        border: '1px solid rgba(245, 158, 11, 0.3)',
                                    }}>
                                        <Clock size={12} /> {item.attempts} tentativas
                                    </span>
                                    {item.lastAttemptAt && (
                                        <span style={{ color: 'var(--text-secondary, #888)' }}>
                                            Última tentativa: {new Date(item.lastAttemptAt).toLocaleString('pt-BR')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => handleApprove(item.personId)}
                                    disabled={actionLoading === item.personId}
                                    className="btn btn-primary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--green-600, #16a34a)' }}
                                >
                                    <CheckCircle size={16} /> Aprovar
                                </button>
                                <button
                                    onClick={() => openReject(item)}
                                    disabled={actionLoading === item.personId}
                                    className="btn btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--red-400)' }}
                                >
                                    <XCircle size={16} /> Rejeitar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {rejectTarget && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
                    }}
                    onClick={() => setRejectTarget(null)}
                >
                    <div
                        style={{ background: 'var(--bg-primary, #1a1a1a)', borderRadius: '12px', padding: '24px', width: '400px', border: '1px solid var(--border-color, #333)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ marginTop: 0 }}>Rejeitar cadastro de {rejectTarget.name}?</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)' }}>
                            Isso reseta a senha e o estado de verificação — o morador precisará de um novo link de
                            onboarding para tentar novamente.
                        </p>
                        <textarea
                            placeholder="Observações (opcional)"
                            value={rejectNotes}
                            onChange={(e) => setRejectNotes(e.target.value)}
                            style={{ width: '100%', minHeight: '80px', marginBottom: '16px', borderRadius: '8px', padding: '8px' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>Cancelar</button>
                            <button
                                className="btn btn-primary"
                                style={{ background: 'var(--red-600, #dc2626)' }}
                                onClick={confirmReject}
                                disabled={actionLoading === rejectTarget.personId}
                            >
                                Confirmar Rejeição
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
