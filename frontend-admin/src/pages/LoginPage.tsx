import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('admin@condominio.com');
    const [password, setPassword] = useState('admin123');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            navigate('/admin');
        } catch (err: any) {
            setError(err.message || 'Falha na autenticação');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-split">
                <div className="login-brand">
                    <div className="login-brand-content">
                        <div className="login-brand-eyebrow">Condomínio Calabasas</div>
                        <h1 className="login-brand-title">Controle<br />de Acesso</h1>
                        <p className="login-brand-sub">Painel administrativo seguro para gestão de moradores, visitantes e prestadores.</p>
                    </div>
                    <div className="login-brand-footer">
                        Sistema integrado com HikCentral
                    </div>
                </div>

                <div className="login-form-side">
                    <div className="login-card">
                        <div className="login-header">
                            <h2>Entrar</h2>
                            <p>Acesse com suas credenciais de administrador</p>
                        </div>

                        {error && (
                            <div className="login-error">
                                <AlertCircle size={16} />
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="login-form">
                            <div className="form-group">
                                <label htmlFor="email">Email</label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="admin@condominio.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="password">Senha</label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                            </div>

                            <button type="submit" className="login-button" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 size={18} className="spin" />
                                        Entrando...
                                    </>
                                ) : (
                                    'Entrar no painel'
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
