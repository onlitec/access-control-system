import React from 'react';

interface PlaceholderPageProps {
    title: string;
    description?: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
    return (
        <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
            <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '2.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius)' }}>
                <span className="badge" style={{ marginBottom: '1.5rem', display: 'inline-block', fontSize: '0.8rem', padding: '0.35rem 0.75rem', background: 'var(--amber-glow)', color: 'var(--amber-500)', border: '1px solid var(--amber-500)', borderRadius: 'var(--radius-sm)' }}>
                    Em desenvolvimento
                </span>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>{title}</h1>
                {description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
                        {description}
                    </p>
                )}
            </div>
        </div>
    );
}
