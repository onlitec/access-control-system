import React, { useState, useEffect } from 'react';
import { KeyRound, Save, Loader2, UserPlus, Briefcase, Plus, Trash2, Home, Server } from 'lucide-react';
import {
  getAccessLevelPool,
  saveAccessLevelPool,
  createCustomAccessLevel,
  deleteCustomAccessLevel,
  type GrantableAccessLevelItem,
} from '@/services/api';

const poolTabs: { key: 'visitor' | 'provider'; title: string; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    key: 'visitor',
    title: 'Visitantes',
    desc: 'Acessos que o morador pode conceder ao cadastrar um visitante. Antes, o visitante herdava 100% do acesso do próprio morador — agora só o que estiver marcado aqui fica disponível pra ele escolher. Reutilize as Áreas de Acesso já cadastradas do condomínio ou crie níveis específicos abaixo.',
    icon: <UserPlus size={22} />,
    color: 'var(--blue-500)',
  },
  {
    key: 'provider',
    title: 'Prestadores',
    desc: 'Acessos que o morador pode marcar ao cadastrar um prestador de serviço. A seleção fica salva no cadastro para a portaria consultar e liberar. Reutilize as Áreas de Acesso do condomínio ou crie níveis específicos abaixo.',
    icon: <Briefcase size={22} />,
    color: 'var(--purple-500)',
  },
];

const sourceMeta: Record<GrantableAccessLevelItem['source'], { label: string; icon: React.ReactNode }> = {
  area: { label: 'Área do condomínio', icon: <Home size={14} /> },
  local: { label: 'Criado aqui', icon: <KeyRound size={14} /> },
  hikcentral: { label: 'HikCentral', icon: <Server size={14} /> },
};

export default function AccessLevelPoolsPanel() {
  const [activePool, setActivePool] = useState<'visitor' | 'provider'>('visitor');
  const [items, setItems] = useState<GrantableAccessLevelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLevelName, setNewLevelName] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    load(activePool);
  }, [activePool]);

  async function load(pool: 'visitor' | 'provider') {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await getAccessLevelPool(pool);
      setItems(res.data || []);
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err.message || 'Erro ao carregar níveis de acesso' });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle(hikAccessLevelId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.hikAccessLevelId === hikAccessLevelId ? { ...item, approved: !item.approved } : item
      )
    );
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const approvedItems = items
        .filter((i) => i.approved)
        .map((i) => ({ hikAccessLevelId: i.hikAccessLevelId, name: i.name }));
      await saveAccessLevelPool(activePool, approvedItems);
      setFeedback({ kind: 'ok', text: `Pool de "${poolTabs.find((p) => p.key === activePool)?.title}" salvo com sucesso.` });
      await load(activePool);
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err.message || 'Erro ao salvar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    const name = newLevelName.trim();
    if (!name) return;
    setCreating(true);
    setFeedback(null);
    try {
      await createCustomAccessLevel(activePool, name);
      setNewLevelName('');
      await load(activePool);
      setFeedback({ kind: 'ok', text: `Nível "${name}" criado e já ativo no pool.` });
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err.message || 'Erro ao criar nível' });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(item: GrantableAccessLevelItem) {
    if (!item.id) return;
    if (!window.confirm(`Remover o nível "${item.name}"?`)) return;
    setFeedback(null);
    try {
      await deleteCustomAccessLevel(item.id);
      await load(activePool);
    } catch (err: any) {
      setFeedback({ kind: 'err', text: err.message || 'Erro ao remover nível' });
    }
  }

  const meta = poolTabs.find((p) => p.key === activePool)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-tabs: Visitantes / Prestadores */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '1px' }}>
        {poolTabs.map((tab) => {
          const isActive = tab.key === activePool;
          return (
            <button
              key={tab.key}
              onClick={() => setActivePool(tab.key)}
              style={{
                padding: '10px 20px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              {tab.title}
            </button>
          );
        })}
      </div>

      <div className="settings-card" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', color: meta.color, display: 'inline-flex' }}>
              {meta.icon}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Acessos permitidos: {meta.title}</h3>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                marque o que o morador pode conceder — vale para todos os moradores
              </span>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: meta.color, borderColor: meta.color }}
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar Pool de {meta.title}
          </button>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '15px 0' }}>{meta.desc}</p>

        {feedback && (
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '15px',
            background: feedback.kind === 'ok' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${feedback.kind === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {feedback.text}
          </div>
        )}

        {/* Criar nível avulso */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input
            value={newLevelName}
            onChange={(e) => setNewLevelName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder='Criar novo nível de acesso (ex: "Salão de festas", "Garagem visitantes")'
            style={{
              flex: 1, padding: '10px 14px', background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)', fontSize: '0.9rem',
            }}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newLevelName.trim()}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            {creating ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} Adicionar
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '30px', display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Loader2 className="animate-spin" size={20} style={{ marginRight: '10px' }} /> Carregando níveis de acesso...
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Nenhum nível de acesso disponível ainda. Cadastre Áreas de Acesso em
            Configurações → Áreas de Acesso, ou crie um nível novo no campo acima.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
            {items.map((item) => {
              const src = sourceMeta[item.source] ?? sourceMeta.local;
              return (
                <div
                  key={item.hikAccessLevelId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 18px',
                    background: 'var(--bg-primary)',
                    border: `1px solid ${item.approved ? meta.color : 'var(--border-primary)'}`,
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div
                    onClick={() => toggle(item.hikAccessLevelId)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}
                  >
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.9rem' }}>{item.name}</strong>
                      <span className="text-muted" style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {src.icon} {src.label}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {item.source === 'local' && item.id && (
                      <button
                        onClick={() => handleDelete(item)}
                        title="Excluir nível"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <div
                      onClick={() => toggle(item.hikAccessLevelId)}
                      style={{
                        width: '46px',
                        height: '24px',
                        borderRadius: '12px',
                        background: item.approved ? meta.color : 'var(--bg-card)',
                        border: '1px solid var(--border-primary)',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: '2px', left: item.approved ? '24px' : '3px', transition: 'all 0.2s',
                      }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
