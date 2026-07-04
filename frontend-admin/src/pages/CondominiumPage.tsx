import React, { useState, useEffect } from 'react';
import {
    getCondominiumSettings,
    updateCondominiumSettings,
    getTowers,
    createTower,
    updateTower,
    deleteTower,
    createBlock,
    deleteBlock,
    getUnits,
    createUnit,
    updateUnit,
    deleteUnit,
    importUnitsCSV,
    CondominiumSettings,
    Tower,
    Block,
    Unit,
    RegistrationRequirement,
    BlacklistRecord,
    AccessSchedule,
    getRegistrationRequirements,
    updateRegistrationRequirements,
    getBlacklist,
    addToBlacklist,
    deleteFromBlacklist,
    getAccessSchedules,
    updateAccessSchedules,
} from '@/services/api';
import {
    Building,
    Building2,
    RefreshCw,
    AlertTriangle,
    Save,
    Plus,
    Edit2,
    Trash2,
    Upload,
    ChevronDown,
    ChevronRight,
    Download,
    CheckCircle,
    Info,
    Shield,
    Clock,
    UserX,
    Calendar,
} from 'lucide-react';

export default function CondominiumPage() {
    const [activeTab, setActiveTab] = useState<'gerais' | 'torres' | 'unidades' | 'campos' | 'restricoes'>('gerais');
    const [loading, setLoading] = useState(true);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Tab 1: Dados Gerais
    const [settings, setSettings] = useState<CondominiumSettings>({
        id: 'singleton',
        name: 'Condomínio Residencial',
        cnpj: '',
        address: '',
        phone: '',
        email: '',
        logoUrl: null,
        type: 'vertical',
        updatedAt: '',
    });

    const isHorizontal = settings.type === 'horizontal';
    const labelTower = isHorizontal ? 'Rua' : 'Torre';
    const labelBlock = isHorizontal ? 'Quadra' : 'Bloco';
    const labelUnit = isHorizontal ? 'Casa / Lote' : 'Unidade';
    const labelTowers = isHorizontal ? 'Ruas' : 'Torres';
    const labelBlocks = isHorizontal ? 'Quadras' : 'Blocos';
    const labelUnits = isHorizontal ? 'Casas / Lotes' : 'Unidades';

    // Tab 2: Torres e blocos
    const [towers, setTowers] = useState<Tower[]>([]);
    const [collapsedTowers, setCollapsedTowers] = useState<Record<string, boolean>>({});
    const [showAddTower, setShowAddTower] = useState(false);
    const [towerName, setTowerName] = useState('');
    const [towerFloors, setTowerFloors] = useState('1');
    const [addingBlockTowerId, setAddingBlockTowerId] = useState<string | null>(null);
    const [blockName, setBlockName] = useState('');

    // Tab 3: Unidades
    const [units, setUnits] = useState<Unit[]>([]);
    const [filterTowerId, setFilterTowerId] = useState('Todos');
    const [showAddUnit, setShowAddUnit] = useState(false);
    const [unitNumber, setUnitNumber] = useState('');
    const [unitTowerId, setUnitTowerId] = useState('');
    const [unitBlockId, setUnitBlockId] = useState('');
    const [unitFloor, setUnitFloor] = useState('');
    const [unitStatus, setUnitStatus] = useState<'occupied' | 'vacant'>('vacant');
    const [unitParkingSpaces, setUnitParkingSpaces] = useState('0');

    // CSV Import
    const [showCSVImport, setShowCSVImport] = useState(false);
    const [csvInput, setCsvInput] = useState('');

    // Tab 4: Requisitos de Cadastro
    const [requirements, setRequirements] = useState<RegistrationRequirement[]>([]);

    // Tab 5: Blacklist e Agendas
    const [blacklist, setBlacklist] = useState<BlacklistRecord[]>([]);
    const [blacklistName, setBlacklistName] = useState('');
    const [blacklistDocument, setBlacklistDocument] = useState('');
    const [blacklistReason, setBlacklistReason] = useState('');
    const [schedules, setSchedules] = useState<AccessSchedule[]>([]);

    // Mock data for demo
    const mockSettings: CondominiumSettings = {
        id: 'singleton',
        name: 'Condomínio Residencial (Simulado)',
        cnpj: '12.345.678/0001-90',
        address: 'Alameda das Palmeiras, 450 - São Paulo/SP',
        phone: '(11) 4002-8922',
        email: 'contato@condominio.com.br',
        logoUrl: '',
        type: 'vertical',
        updatedAt: new Date().toISOString(),
    };

    const mockTowers: Tower[] = [
        {
            id: 'tower-1',
            name: 'Torre A',
            floors: 10,
            blocks: [
                { id: 'block-1-1', name: 'Bloco 1', towerId: 'tower-1' },
                { id: 'block-1-2', name: 'Bloco 2', towerId: 'tower-1' },
            ],
        },
        {
            id: 'tower-2',
            name: 'Torre B',
            floors: 12,
            blocks: [
                { id: 'block-2-1', name: 'Bloco Único', towerId: 'tower-2' },
            ],
        },
    ];

    const mockUnits: Unit[] = [
        { id: 'unit-1', number: '101', floor: 1, status: 'occupied', towerId: 'tower-1', blockId: 'block-1-1', tower: { id: 'tower-1', name: 'Torre A', floors: 10 }, block: { id: 'block-1-1', name: 'Bloco 1', towerId: 'tower-1' } },
        { id: 'unit-2', number: '102', floor: 1, status: 'vacant', towerId: 'tower-1', blockId: 'block-1-1', tower: { id: 'tower-1', name: 'Torre A', floors: 10 }, block: { id: 'block-1-1', name: 'Bloco 1', towerId: 'tower-1' } },
        { id: 'unit-3', number: '201', floor: 2, status: 'occupied', towerId: 'tower-2', blockId: 'block-2-1', tower: { id: 'tower-2', name: 'Torre B', floors: 12 }, block: { id: 'block-2-1', name: 'Bloco Único', towerId: 'tower-2' } },
    ];

    const loadData = async () => {
        setLoading(true);
        try {
            const [settingsData, towersData, unitsData, reqsData, blacklistData, schedulesData] = await Promise.all([
                getCondominiumSettings(),
                getTowers(),
                getUnits(),
                getRegistrationRequirements(),
                getBlacklist(),
                getAccessSchedules(),
            ]);
            setSettings(settingsData);
            setTowers(towersData || []);
            setUnits(unitsData || []);
            setRequirements(reqsData || []);
            setBlacklist(blacklistData || []);
            setSchedules(schedulesData || []);
            setIsDemoMode(false);
        } catch (err) {
            console.warn('Condominium endpoints failed, using mock data:', err);
            setSettings(mockSettings);
            setTowers(mockTowers);
            setUnits(mockUnits);
            setRequirements([]);
            setBlacklist([]);
            setSchedules([]);
            setIsDemoMode(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 5000);
    };

    // CNPJ & Phone formatting masks
    const formatCNPJ = (val: string) => {
        return val
            .replace(/\D/g, '')
            .replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2')
            .slice(0, 18);
    };

    const formatPhone = (val: string) => {
        return val
            .replace(/\D/g, '')
            .replace(/^(\d{2})(\d)/g, '($1) $2')
            .replace(/(\d)(\d{4})$/g, '$1-$2')
            .slice(0, 15);
    };

    // Tab 1 Actions
    const handleSaveSettings = async () => {
        setActionLoading('settings');
        try {
            if (isDemoMode) {
                showToast('success', 'Configurações simuladas salvas!');
            } else {
                const response = await updateCondominiumSettings(settings);
                setSettings(response);
                showToast('success', 'Configurações gerais salvas com sucesso!');
            }
        } catch (err: any) {
            showToast('error', `Erro ao salvar configurações: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    // Tab 2 Actions: Towers & Blocks
    const handleAddTower = async () => {
        if (!towerName.trim()) {
            showToast('error', 'O nome da torre é obrigatório.');
            return;
        }
        setActionLoading('tower');
        try {
            if (isDemoMode) {
                const newTower: Tower = {
                    id: 'tower-' + Math.random(),
                    name: towerName,
                    floors: parseInt(towerFloors) || 1,
                    blocks: [],
                };
                setTowers((prev) => [...prev, newTower]);
                showToast('success', 'Torre simulada criada com sucesso!');
                setTowerName('');
            } else {
                const response = await createTower({
                    name: towerName,
                    floors: parseInt(towerFloors) || 1,
                });
                setTowers((prev) => [...prev, { ...response, blocks: [] }]);
                showToast('success', 'Torre criada com sucesso!');
                setTowerName('');
            }
            setShowAddTower(false);
        } catch (err: any) {
            showToast('error', `Erro ao criar torre: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteTower = async (id: string, name: string) => {
        const hasUnits = units.some((u) => u.towerId === id);
        if (hasUnits) {
            if (!window.confirm(`ATENÇÃO: A torre "${name}" possui unidades e moradores vinculados. Excluir a torre removerá permanentemente todas as suas unidades. Deseja prosseguir?`)) {
                return;
            }
        } else if (!window.confirm(`Deseja realmente excluir a torre "${name}"?`)) {
            return;
        }

        setActionLoading(id);
        try {
            if (isDemoMode) {
                setTowers((prev) => prev.filter((t) => t.id !== id));
                setUnits((prev) => prev.filter((u) => u.towerId !== id));
                showToast('success', 'Torre simulada excluída.');
            } else {
                await deleteTower(id);
                showToast('success', 'Torre excluída com sucesso.');
                loadData();
            }
        } catch (err: any) {
            showToast('error', `Erro ao excluir torre: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleAddBlock = async (towerId: string) => {
        if (!blockName.trim()) {
            showToast('error', 'Nome do bloco é obrigatório.');
            return;
        }
        setActionLoading('block');
        try {
            if (isDemoMode) {
                const newBlock: Block = {
                    id: 'block-' + Math.random(),
                    name: blockName,
                    towerId,
                };
                setTowers((prev) =>
                    prev.map((t) =>
                        t.id === towerId
                            ? { ...t, blocks: [...(t.blocks || []), newBlock] }
                            : t
                    )
                );
                showToast('success', 'Bloco simulado adicionado!');
                setBlockName('');
            } else {
                const response = await createBlock(towerId, blockName);
                setTowers((prev) =>
                    prev.map((t) =>
                        t.id === towerId
                            ? { ...t, blocks: [...(t.blocks || []), response] }
                            : t
                    )
                );
                showToast('success', 'Bloco criado com sucesso!');
                setBlockName('');
            }
            setAddingBlockTowerId(null);
        } catch (err: any) {
            showToast('error', `Erro ao criar bloco: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteBlock = async (blockId: string, towerId: string, name: string) => {
        if (!window.confirm(`Deseja realmente excluir o bloco "${name}"?`)) return;
        setActionLoading(blockId);
        try {
            if (isDemoMode) {
                setTowers((prev) =>
                    prev.map((t) =>
                        t.id === towerId
                            ? { ...t, blocks: (t.blocks || []).filter((b) => b.id !== blockId) }
                            : t
                    )
                );
                showToast('success', 'Bloco simulado excluído.');
            } else {
                await deleteBlock(blockId);
                showToast('success', 'Bloco excluído com sucesso.');
                loadData();
            }
        } catch (err: any) {
            showToast('error', `Erro ao excluir bloco: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    // Tab 3 Actions: Units
    const handleAddUnit = async () => {
        if (!unitNumber.trim() || !unitTowerId) {
            showToast('error', 'Número e torre são obrigatórios.');
            return;
        }
        setActionLoading('unit');
        try {
            if (isDemoMode) {
                const selectedTower = towers.find((t) => t.id === unitTowerId);
                const selectedBlock = selectedTower?.blocks?.find((b) => b.id === unitBlockId);
                const newUnit: Unit = {
                    id: 'unit-' + Math.random(),
                    number: unitNumber,
                    floor: unitFloor ? parseInt(unitFloor) : null,
                    status: unitStatus,
                    towerId: unitTowerId,
                    blockId: unitBlockId || null,
                    parkingSpaces: parseInt(unitParkingSpaces) || 0,
                    tower: selectedTower,
                    block: selectedBlock,
                };
                setUnits((prev) => [...prev, newUnit]);
                showToast('success', 'Unidade simulada criada!');
                setUnitNumber('');
                setUnitFloor('');
                setUnitParkingSpaces('0');
            } else {
                const response = await createUnit({
                    number: unitNumber,
                    towerId: unitTowerId,
                    blockId: unitBlockId || undefined,
                    floor: unitFloor ? parseInt(unitFloor) : undefined,
                    status: unitStatus,
                    parkingSpaces: parseInt(unitParkingSpaces) || 0,
                });
                setUnits((prev) => [...prev, response]);
                showToast('success', 'Unidade criada com sucesso!');
                setUnitNumber('');
                setUnitFloor('');
                setUnitParkingSpaces('0');
            }
            setShowAddUnit(false);
        } catch (err: any) {
            showToast('error', `Erro ao criar unidade: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteUnit = async (id: string, num: string) => {
        if (!window.confirm(`Deseja realmente excluir a unidade ${num}? Moradores perderão o vínculo imediatamente.`)) {
            return;
        }
        setActionLoading(id);
        try {
            if (isDemoMode) {
                setUnits((prev) => prev.filter((u) => u.id !== id));
                showToast('success', 'Unidade simulada excluída.');
            } else {
                await deleteUnit(id);
                showToast('success', 'Unidade excluída com sucesso.');
                setUnits((prev) => prev.filter((u) => u.id !== id));
            }
        } catch (err: any) {
            showToast('error', `Erro ao excluir unidade: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    // CSV Import & Template Download
    const handleImportCSV = async () => {
        if (!csvInput.trim()) {
            showToast('error', 'Cole o conteúdo do CSV no campo de texto.');
            return;
        }
        setActionLoading('import');
        try {
            if (isDemoMode) {
                showToast('success', 'CSV simulado importado com sucesso! (Criada Torre Exemplo)');
                setShowCSVImport(false);
                setCsvInput('');
            } else {
                const response = await importUnitsCSV(csvInput);
                showToast('success', `Sucesso! Foram importadas ${response.imported} unidades.`);
                setShowCSVImport(false);
                setCsvInput('');
                loadData();
            }
        } catch (err: any) {
            showToast('error', `Erro na importação: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDownloadTemplate = () => {
        const csvContent = 'numero,torre,bloco,andar\n101,Torre A,Bloco 1,1\n102,Torre A,Bloco 1,1\n201,Torre B,,2';
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'template_unidades.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('success', 'Template de CSV baixado!');
    };

    // Tab 4: Requisitos de Cadastro Actions
    const handleSaveRequirements = async () => {
        setActionLoading('requirements');
        try {
            if (isDemoMode) {
                showToast('success', 'Configurações de campos simuladas salvas!');
            } else {
                await updateRegistrationRequirements(
                    requirements.map((r) => ({ id: r.id, status: r.status }))
                );
                showToast('success', 'Diretrizes de campos obrigatórios salvas com sucesso!');
            }
        } catch (err: any) {
            showToast('error', `Erro ao salvar requisitos: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRequirementStatusChange = (id: string, status: 'required' | 'optional' | 'hidden') => {
        setRequirements((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status } : r))
        );
    };

    // Tab 5: Blacklist e Agendas Actions
    const handleAddBlacklist = async () => {
        if (!blacklistName.trim() || !blacklistDocument.trim()) {
            showToast('error', 'Nome e CPF/RG são obrigatórios.');
            return;
        }
        setActionLoading('blacklist');
        try {
            if (isDemoMode) {
                const newRecord: BlacklistRecord = {
                    id: 'black-' + Math.random(),
                    name: blacklistName,
                    document: blacklistDocument,
                    reason: blacklistReason,
                    createdAt: new Date().toISOString(),
                    createdBy: 'admin_master',
                };
                setBlacklist((prev) => [newRecord, ...prev]);
                showToast('success', 'Simulação: Pessoa adicionada à blacklist!');
            } else {
                const response = await addToBlacklist({
                    name: blacklistName,
                    document: blacklistDocument,
                    reason: blacklistReason,
                    createdBy: 'admin_master',
                });
                setBlacklist((prev) => [response, ...prev]);
                showToast('success', 'Pessoa adicionada à blacklist com sucesso!');
            }
            setBlacklistName('');
            setBlacklistDocument('');
            setBlacklistReason('');
        } catch (err: any) {
            showToast('error', `Erro ao adicionar à blacklist: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteBlacklist = async (id: string) => {
        if (!window.confirm('Deseja realmente remover esta pessoa da blacklist?')) return;
        setActionLoading('blacklist-delete');
        try {
            if (isDemoMode) {
                setBlacklist((prev) => prev.filter((b) => b.id !== id));
                showToast('success', 'Simulação: Pessoa removida da blacklist!');
            } else {
                await deleteFromBlacklist(id);
                setBlacklist((prev) => prev.filter((b) => b.id !== id));
                showToast('success', 'Pessoa removida da blacklist com sucesso!');
            }
        } catch (err: any) {
            showToast('error', `Erro ao remover da blacklist: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSaveSchedules = async () => {
        setActionLoading('schedules');
        try {
            if (isDemoMode) {
                showToast('success', 'Simulação: Agendas de acesso salvas!');
            } else {
                const response = await updateAccessSchedules(schedules);
                setSchedules(response);
                showToast('success', 'Agendas de acesso semanais salvas com sucesso!');
            }
        } catch (err: any) {
            showToast('error', `Erro ao salvar agendas de acesso: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleScheduleChange = (
        type: 'visitor' | 'provider',
        dayOfWeek: number,
        field: 'startTime' | 'endTime' | 'isActive',
        value: any
    ) => {
        setSchedules((prev) => {
            const exists = prev.find((s) => s.type === type && s.dayOfWeek === dayOfWeek);
            if (exists) {
                return prev.map((s) =>
                    s.type === type && s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s
                );
            } else {
                const newSch: AccessSchedule = {
                    type,
                    dayOfWeek,
                    startTime: '08:00',
                    endTime: '18:00',
                    isActive: true,
                    [field]: value,
                };
                return [...prev, newSch];
            }
        });
    };

    const toggleTowerCollapse = (id: string) => {
        setCollapsedTowers((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const filteredUnits = units.filter((u) => {
        if (filterTowerId === 'Todos') return true;
        return u.towerId === filterTowerId;
    });

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Carregando dados do condomínio...</p>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1><Building size={24} /> Estrutura do Condomínio</h1>
                    <p>Mapeamento de blocos, torres, unidades físicas e metadados cadastrais</p>
                </div>
                <button className="btn btn-secondary" onClick={loadData} disabled={actionLoading !== null}>
                    <RefreshCw size={16} /> Atualizar dados
                </button>
            </div>

            {/* Banner Mode Demo */}
            {isDemoMode && (
                <div className="alert alert-warning" style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid var(--amber-500)', color: 'var(--amber-400)', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', borderRadius: 'var(--radius)' }}>
                    <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                    <div>
                        <strong>Modo demonstração — dados simulados</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(245, 158, 11, 0.8)' }}>
                            Não foi possível conectar-se ao backend. Exibindo dados simulados.
                        </p>
                    </div>
                </div>
            )}

            {/* Toast Notifications */}
            {toast && (
                <div className={`alert alert-${toast.type === 'success' ? 'success' : 'danger'}`} style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', margin: 0 }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                        <p style={{ margin: 0, fontWeight: 500 }}>{toast.message}</p>
                    </div>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', marginBottom: '20px', gap: '15px' }}>
                <button className={`tab-btn`} style={{ padding: '10px 15px', background: 'transparent', border: 'none', borderBottom: activeTab === 'gerais' ? '2px solid var(--blue-500)' : 'none', color: activeTab === 'gerais' ? 'var(--blue-500)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setActiveTab('gerais')}>Dados Gerais</button>
                <button className={`tab-btn`} style={{ padding: '10px 15px', background: 'transparent', border: 'none', borderBottom: activeTab === 'torres' ? '2px solid var(--blue-500)' : 'none', color: activeTab === 'torres' ? 'var(--blue-500)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setActiveTab('torres')}>{labelTowers} e {labelBlocks}</button>
                <button className={`tab-btn`} style={{ padding: '10px 15px', background: 'transparent', border: 'none', borderBottom: activeTab === 'unidades' ? '2px solid var(--blue-500)' : 'none', color: activeTab === 'unidades' ? 'var(--blue-500)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setActiveTab('unidades')}>{labelUnits}</button>
                <button className={`tab-btn`} style={{ padding: '10px 15px', background: 'transparent', border: 'none', borderBottom: activeTab === 'campos' ? '2px solid var(--blue-500)' : 'none', color: activeTab === 'campos' ? 'var(--blue-500)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setActiveTab('campos')}>Diretrizes de Campos</button>
                <button className={`tab-btn`} style={{ padding: '10px 15px', background: 'transparent', border: 'none', borderBottom: activeTab === 'restricoes' ? '2px solid var(--blue-500)' : 'none', color: activeTab === 'restricoes' ? 'var(--blue-500)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setActiveTab('restricoes')}>Blacklist e Agendas</button>
            </div>

            {/* TAB 1: DADOS GERAIS */}
            {activeTab === 'gerais' && (
                <div className="settings-card" style={{ margin: 0 }}>
                    <div className="settings-card-header">
                        <Building2 size={20} />
                        <h2>Dados Gerais do Condomínio</h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="text-muted" style={{ fontSize: '0.85rem' }}>Nome do condomínio</label>
                                <input type="text" className="input" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="text-muted" style={{ fontSize: '0.85rem' }}>CNPJ</label>
                                <input type="text" className="input" placeholder="00.000.000/0000-00" value={settings.cnpj || ''} onChange={(e) => setSettings({ ...settings, cnpj: formatCNPJ(e.target.value) })} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="text-muted" style={{ fontSize: '0.85rem' }}>Endereço completo</label>
                                <input type="text" className="input" value={settings.address || ''} onChange={(e) => setSettings({ ...settings, address: e.target.value })} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="text-muted" style={{ fontSize: '0.85rem' }}>Telefone de contato</label>
                                <input type="text" className="input" placeholder="(00) 00000-0000" value={settings.phone || ''} onChange={(e) => setSettings({ ...settings, phone: formatPhone(e.target.value) })} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="text-muted" style={{ fontSize: '0.85rem' }}>E-mail administrativo</label>
                                <input type="email" className="input" placeholder="contato@condominio.com" value={settings.email || ''} onChange={(e) => setSettings({ ...settings, email: e.target.value })} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="text-muted" style={{ fontSize: '0.85rem' }}>Logo do condomínio (URL)</label>
                                <input type="text" className="input" placeholder="Link da imagem da logo" value={settings.logoUrl || ''} onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="text-muted" style={{ fontSize: '0.85rem' }}>Tipo de Condomínio</label>
                                <select className="input" value={settings.type || 'vertical'} onChange={(e) => setSettings({ ...settings, type: e.target.value })} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
                                    <option value="vertical">Vertical (Prédios / Torres)</option>
                                    <option value="horizontal">Horizontal (Lotes / Quadras / Ruas)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '25px', borderTop: '1px solid var(--border-primary)', paddingTop: '20px' }}>
                        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleSaveSettings} disabled={actionLoading === 'settings'}>
                            <Save size={16} /> Salvar alterações
                        </button>
                    </div>
                </div>
            )}

            {/* TAB 2: TORRES E BLOCOS */}
            {activeTab === 'torres' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="settings-card" style={{ margin: 0 }}>
                        <div className="settings-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Building2 size={20} />
                                <h2>Estrutura de {labelTowers} e {labelBlocks}</h2>
                            </div>
                            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setShowAddTower(!showAddTower)}>
                                <Plus size={16} /> Adicionar {labelTower.toLowerCase()}
                            </button>
                        </div>

                        {/* Add Tower Inline Form */}
                        {showAddTower && (
                            <div style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: 'var(--radius)', border: '1px solid var(--border-primary)', display: 'grid', gridTemplateColumns: '1fr 150px auto', gap: '15px', alignItems: 'flex-end', marginTop: '15px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>Nome da {labelTower.toLowerCase()}</label>
                                    <input type="text" className="input" placeholder={`Ex: ${labelTower} A`} value={towerName} onChange={(e) => setTowerName(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>{isHorizontal ? 'Qtd. de Residências' : 'Qtd. de Andares'}</label>
                                    <input type="number" className="input" min="1" value={towerFloors} onChange={(e) => setTowerFloors(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="btn btn-secondary" onClick={() => setShowAddTower(false)}>Cancelar</button>
                                    <button className="btn btn-primary" onClick={handleAddTower} disabled={actionLoading === 'tower'}>Salvar</button>
                                </div>
                            </div>
                        )}

                        {/* Towers List Tree View */}
                        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {towers.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>Nenhuma {labelTower.toLowerCase()} ou {labelBlock.toLowerCase()} cadastrado.</p>
                            ) : (
                                towers.map((tower) => {
                                    const isCollapsed = collapsedTowers[tower.id];
                                    const isAddingBlock = addingBlockTowerId === tower.id;
                                    return (
                                        <div key={tower.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius)' }}>
                                            {/* Tower Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: isCollapsed ? 'none' : '1px solid var(--border-primary)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => toggleTowerCollapse(tower.id)}>
                                                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                                                    <strong style={{ fontSize: '1.05rem' }}>{tower.name}</strong>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({tower.floors} {isHorizontal ? 'residências' : 'andares'}, {(tower.blocks || []).length} {labelBlocks.toLowerCase()})</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto' }} onClick={() => setAddingBlockTowerId(isAddingBlock ? null : tower.id)}>
                                                        + Adicionar {labelBlock}
                                                    </button>
                                                    <button className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto', color: 'var(--red-400)', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => handleDeleteTower(tower.id, tower.name)} disabled={actionLoading !== null}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Add Block Form */}
                                            {isAddingBlock && !isCollapsed && (
                                                <div style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-primary)', padding: '15px 20px', display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                                                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Nome da {labelBlock.toLowerCase()} / ala</label>
                                                        <input type="text" className="input" placeholder={`Ex: ${labelBlock} 1, Ala Norte`} value={blockName} onChange={(e) => setBlockName(e.target.value)} style={{ padding: '6px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setAddingBlockTowerId(null)}>Cancelar</button>
                                                        <button className="btn btn-primary" style={{ padding: '6px 12px' }} onClick={() => handleAddBlock(tower.id)} disabled={actionLoading === 'block'}>Salvar</button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Blocks Sub-List */}
                                            {!isCollapsed && (
                                                <div style={{ padding: '10px 20px 15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {(tower.blocks || []).length === 0 ? (
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '10px 0' }}>Nenhuma {labelBlock.toLowerCase()} cadastrada nesta {tower.name.toLowerCase()}.</span>
                                                    ) : (
                                                        (tower.blocks || []).map((block) => (
                                                            <div key={block.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                                                                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{block.name}</span>
                                                                <button className="btn btn-secondary" style={{ padding: '4px', minWidth: 'auto', color: 'var(--red-400)', border: 'none', background: 'transparent' }} onClick={() => handleDeleteBlock(block.id, tower.id, block.name)}>
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: UNIDADES */}
            {activeTab === 'unidades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Control and Filters Bar */}
                    <div className="settings-card" style={{ margin: 0, padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <label className="text-muted" style={{ fontSize: '0.9rem' }}>Filtrar por {labelTower}</label>
                                <select value={filterTowerId} onChange={(e) => setFilterTowerId(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
                                    <option value="Todos">Todas as {labelTowers.toLowerCase()}</option>
                                    {towers.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setShowCSVImport(!showCSVImport)}>
                                    <Upload size={16} /> Importar {labelUnits}
                                </button>
                                <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { setShowAddUnit(!showAddUnit); if (towers.length > 0 && !unitTowerId) setUnitTowerId(towers[0].id); }}>
                                    <Plus size={16} /> Nova {labelUnit.toLowerCase()}
                                </button>
                            </div>
                        </div>

                        {/* CSV Import Section */}
                        {showCSVImport && (
                            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', padding: '20px', borderRadius: 'var(--radius)', marginTop: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <h3>Importar {labelUnits} via CSV</h3>
                                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleDownloadTemplate}>
                                        <Download size={14} /> Baixar template
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                    Insira as linhas de dados seguindo o formato: <code>numero,{labelTower.toLowerCase()},{labelBlock.toLowerCase()},{isHorizontal ? 'garagem' : 'andar'}</code>. Caso a {labelTower.toLowerCase()} ou {labelBlock.toLowerCase()} não existam, serão criados automaticamente.
                                </p>
                                <textarea value={csvInput} onChange={(e) => setCsvInput(e.target.value)} placeholder={isHorizontal ? "Ex:\n101,Rua das Flores,Quadra A,2\n102,Rua das Flores,Quadra A,2\n201,Rua dos Lírios,,1" : "Ex:\n101,Torre A,Bloco 1,1\n102,Torre A,Bloco 1,1\n201,Torre B,,2"} style={{ width: '100%', height: '120px', padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }} />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' }}>
                                    <button className="btn btn-secondary" onClick={() => setShowCSVImport(false)}>Cancelar</button>
                                    <button className="btn btn-primary" onClick={handleImportCSV} disabled={actionLoading === 'import'}>Iniciar importação</button>
                                </div>
                            </div>
                        )}

                        {/* Add Unit Inline Form */}
                        {showAddUnit && (
                            <div style={{ background: 'var(--bg-primary)', padding: '20px', borderRadius: 'var(--radius)', border: '1px solid var(--border-primary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px', alignItems: 'flex-end', marginTop: '20px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>Número da {labelUnit.toLowerCase()}</label>
                                    <input type="text" className="input" placeholder="Ex: 101" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>{labelTower}</label>
                                    <select value={unitTowerId} onChange={(e) => { setUnitTowerId(e.target.value); setUnitBlockId(''); }} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
                                        <option value="">Selecione...</option>
                                        {towers.map((t) => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>{labelBlock} (opcional)</label>
                                    <select value={unitBlockId} onChange={(e) => setUnitBlockId(e.target.value)} disabled={!unitTowerId} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
                                        <option value="">Nenhum</option>
                                        {towers.find((t) => t.id === unitTowerId)?.blocks?.map((b) => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                {!isHorizontal && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Andar</label>
                                        <input type="number" className="input" placeholder="Ex: 1" value={unitFloor} onChange={(e) => setUnitFloor(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>{isHorizontal ? 'Garagens por residência' : 'Garagens por apartamento'}</label>
                                    <input type="number" className="input" min="0" placeholder="Ex: 2" value={unitParkingSpaces} onChange={(e) => setUnitParkingSpaces(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>Status ocupação</label>
                                    <select value={unitStatus} onChange={(e: any) => setUnitStatus(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
                                        <option value="vacant">Vaga</option>
                                        <option value="occupied">Ocupada</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setShowAddUnit(false)}>Cancelar</button>
                                    <button className="btn btn-primary" style={{ padding: '8px 12px' }} onClick={handleAddUnit} disabled={actionLoading === 'unit'}>Salvar</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Units Table List */}
                    <div className="settings-card" style={{ margin: 0 }}>
                        <div className="data-table-wrapper" style={{ border: 'none', background: 'transparent' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{labelUnit}</th>
                                        <th>{labelTower}</th>
                                        <th>{labelBlock}</th>
                                        {!isHorizontal && <th>Andar</th>}
                                        <th>{isHorizontal ? 'Garagens por residência' : 'Garagens por apartamento'}</th>
                                        <th>Status ocupação</th>
                                        <th>Moradores</th>
                                        <th style={{ textAlign: 'right' }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUnits.length === 0 ? (
                                        <tr>
                                            <td colSpan={isHorizontal ? 7 : 8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                                                Nenhuma {labelUnit.toLowerCase()} encontrada.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUnits.map((u) => (
                                            <tr key={u.id}>
                                                <td style={{ fontWeight: 600 }}>{isHorizontal ? 'Residência' : 'Apto'} {u.number}</td>
                                                <td>{u.tower?.name || '—'}</td>
                                                <td>{u.block?.name || '—'}</td>
                                                {!isHorizontal && <td>{u.floor ? `${u.floor}º andar` : 'Térreo'}</td>}
                                                <td>{u.parkingSpaces || 0} vagas</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '2px 8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        borderRadius: '4px',
                                                        background: u.status === 'occupied' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                                                        color: u.status === 'occupied' ? 'var(--blue-400)' : 'var(--text-muted)',
                                                        border: `1px solid ${u.status === 'occupied' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`
                                                    }}>
                                                        {u.status === 'occupied' ? 'Ocupada' : 'Vaga'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {u.status === 'occupied' ? 'Moradores' : '—'}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto', color: 'var(--red-400)', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => handleDeleteUnit(u.id, u.number)} disabled={actionLoading !== null}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: DIRETRIZES DE CAMPOS */}
            {activeTab === 'campos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="settings-card" style={{ margin: 0, padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Shield size={20} className="text-primary" style={{ color: 'var(--blue-400)' }} />
                                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Diretrizes de Campos Obrigatórios (Portaria)</h2>
                            </div>
                            <button className="btn btn-primary" onClick={handleSaveRequirements} disabled={actionLoading === 'requirements'} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Save size={16} /> Salvar Diretrizes
                            </button>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                            Configure quais campos são exibidos e se são obrigatórios no formulário de cadastro da portaria. Campos marcados como "Ocultar" não aparecerão para o operador.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                            {/* Moradores */}
                            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', padding: '15px', borderRadius: 'var(--radius)' }}>
                                <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '12px', color: 'var(--blue-400)' }}>Moradores</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {requirements.filter((r) => r.category === 'resident').map((r) => (
                                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 500 }}>{fieldLabels[r.fieldName] || r.fieldName}</span>
                                            <div style={{ display: 'flex', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                                                {['required', 'optional', 'hidden'].map((st) => (
                                                    <button key={st} onClick={() => handleRequirementStatusChange(r.id, st as any)} style={{
                                                        padding: '4px 8px',
                                                        fontSize: '0.75rem',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        background: r.status === st ? 'var(--blue-500)' : 'transparent',
                                                        color: r.status === st ? '#ffffff' : 'var(--text-secondary)',
                                                        fontWeight: r.status === st ? 600 : 400
                                                    }}>
                                                        {st === 'required' ? 'Obrigatório' : st === 'optional' ? 'Opcional' : 'Ocultar'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Visitantes */}
                            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', padding: '15px', borderRadius: 'var(--radius)' }}>
                                <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '12px', color: 'var(--blue-400)' }}>Visitantes</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {requirements.filter((r) => r.category === 'visitor').map((r) => (
                                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 500 }}>{fieldLabels[r.fieldName] || r.fieldName}</span>
                                            <div style={{ display: 'flex', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                                                {['required', 'optional', 'hidden'].map((st) => (
                                                    <button key={st} onClick={() => handleRequirementStatusChange(r.id, st as any)} style={{
                                                        padding: '4px 8px',
                                                        fontSize: '0.75rem',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        background: r.status === st ? 'var(--blue-500)' : 'transparent',
                                                        color: r.status === st ? '#ffffff' : 'var(--text-secondary)',
                                                        fontWeight: r.status === st ? 600 : 400
                                                    }}>
                                                        {st === 'required' ? 'Obrigatório' : st === 'optional' ? 'Opcional' : 'Ocultar'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', borderTop: '1px dashed var(--border-primary)', paddingTop: '8px', marginTop: '5px', color: 'var(--text-muted)' }}>
                                        <span>Morador visitado / Unidade</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--blue-400)' }}>Fixo / Obrigatório</span>
                                    </div>
                                </div>
                            </div>

                            {/* Prestadores Condomínio */}
                            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', padding: '15px', borderRadius: 'var(--radius)' }}>
                                <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '12px', color: 'var(--blue-400)' }}>Prestadores do Condomínio</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {requirements.filter((r) => r.category === 'condo_provider').map((r) => (
                                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 500 }}>{fieldLabels[r.fieldName] || r.fieldName}</span>
                                            <div style={{ display: 'flex', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                                                {['required', 'optional', 'hidden'].map((st) => (
                                                    <button key={st} onClick={() => handleRequirementStatusChange(r.id, st as any)} style={{
                                                        padding: '4px 8px',
                                                        fontSize: '0.75rem',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        background: r.status === st ? 'var(--blue-500)' : 'transparent',
                                                        color: r.status === st ? '#ffffff' : 'var(--text-secondary)',
                                                        fontWeight: r.status === st ? 600 : 400
                                                    }}>
                                                        {st === 'required' ? 'Obrigatório' : st === 'optional' ? 'Opcional' : 'Ocultar'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Prestadores de Moradores */}
                            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', padding: '15px', borderRadius: 'var(--radius)' }}>
                                <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-primary)', paddingBottom: '8px', marginBottom: '12px', color: 'var(--blue-400)' }}>Prestadores de Moradores</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {requirements.filter((r) => r.category === 'resident_provider').map((r) => (
                                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 500 }}>{fieldLabels[r.fieldName] || r.fieldName}</span>
                                            <div style={{ display: 'flex', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                                                {['required', 'optional', 'hidden'].map((st) => (
                                                    <button key={st} onClick={() => handleRequirementStatusChange(r.id, st as any)} style={{
                                                        padding: '4px 8px',
                                                        fontSize: '0.75rem',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        background: r.status === st ? 'var(--blue-500)' : 'transparent',
                                                        color: r.status === st ? '#ffffff' : 'var(--text-secondary)',
                                                        fontWeight: r.status === st ? 600 : 400
                                                    }}>
                                                        {st === 'required' ? 'Obrigatório' : st === 'optional' ? 'Opcional' : 'Ocultar'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 5: BLACKLIST E AGENDAS */}
            {activeTab === 'restricoes' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
                    {/* Left Column: Blacklist */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="settings-card" style={{ margin: 0, padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                <UserX size={20} style={{ color: 'var(--red-400)' }} />
                                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Adicionar à Blacklist</h2>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>Nome completo</label>
                                    <input type="text" className="input" placeholder="Ex: João da Silva" value={blacklistName} onChange={(e) => setBlacklistName(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label className="text-muted" style={{ fontSize: '0.8rem' }}>Documento (CPF ou RG)</label>
                                    <input type="text" className="input" placeholder="Ex: 123.456.789-00" value={blacklistDocument} onChange={(e) => setBlacklistDocument(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '15px' }}>
                                <label className="text-muted" style={{ fontSize: '0.8rem' }}>Motivo do bloqueio</label>
                                <textarea className="input" placeholder="Ex: Ex-funcionário envolvido em incidentes internos ou segurança" value={blacklistReason} onChange={(e) => setBlacklistReason(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', height: '60px' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handleAddBlacklist} disabled={actionLoading === 'blacklist'} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Plus size={16} /> Bloquear Acesso
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="settings-card" style={{ margin: 0, padding: '20px' }}>
                            <h2 style={{ fontSize: '1rem', marginBottom: '15px' }}>Pessoas Bloqueadas (Blacklist)</h2>
                            <div className="data-table-wrapper" style={{ border: 'none', background: 'transparent' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Nome</th>
                                            <th>Documento</th>
                                            <th>Motivo</th>
                                            <th style={{ textAlign: 'right' }}>Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {blacklist.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                    Nenhuma pessoa na blacklist.
                                                </td>
                                            </tr>
                                        ) : (
                                            blacklist.map((b) => (
                                                <tr key={b.id}>
                                                    <td style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--red-400)' }}>{b.name}</td>
                                                    <td style={{ fontSize: '0.85rem' }}>{b.document}</td>
                                                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{b.reason}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button className="btn btn-secondary" style={{ padding: '4px', minWidth: 'auto', borderColor: 'rgba(239, 68, 68, 0.2)' }} onClick={() => handleDeleteBlacklist(b.id)} disabled={actionLoading !== null}>
                                                            <Trash2 size={12} style={{ color: 'var(--red-400)' }} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Weekly Schedules */}
                    <div className="settings-card" style={{ margin: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-primary)', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Clock size={20} style={{ color: 'var(--blue-400)' }} />
                                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Janelas de Horários Permitidos</h2>
                            </div>
                            <button className="btn btn-primary" onClick={handleSaveSchedules} disabled={actionLoading === 'schedules'} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Save size={16} /> Salvar Agendas
                            </button>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                            Determine em quais horários os acessos são permitidos. Fora desta janela, os operadores de portaria receberão um alerta e precisarão justificar a liberação.
                        </p>

                        {/* Agendas de Visitantes */}
                        <div>
                            <h3 style={{ fontSize: '0.95rem', color: 'var(--blue-400)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={16} /> Cronograma para Visitantes
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day, idx) => {
                                    const sch = schedules.find((s) => s.type === 'visitor' && s.dayOfWeek === idx) || { startTime: '08:00', endTime: '18:00', isActive: true };
                                    return (
                                        <div key={day} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-primary)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input type="checkbox" checked={sch.isActive} onChange={(e) => handleScheduleChange('visitor', idx, 'isActive', e.target.checked)} />
                                                <span style={{ fontWeight: 600, width: '70px' }}>{day}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <input type="text" placeholder="08:00" value={sch.startTime} onChange={(e) => handleScheduleChange('visitor', idx, 'startTime', e.target.value)} disabled={!sch.isActive} style={{ width: '50px', textAlign: 'center', padding: '2px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: '3px', color: 'var(--text-primary)' }} />
                                                <span>às</span>
                                                <input type="text" placeholder="18:00" value={sch.endTime} onChange={(e) => handleScheduleChange('visitor', idx, 'endTime', e.target.value)} disabled={!sch.isActive} style={{ width: '50px', textAlign: 'center', padding: '2px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: '3px', color: 'var(--text-primary)' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Agendas de Prestadores */}
                        <div>
                            <h3 style={{ fontSize: '0.95rem', color: 'var(--blue-400)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={16} /> Cronograma para Prestadores
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day, idx) => {
                                    const sch = schedules.find((s) => s.type === 'provider' && s.dayOfWeek === idx) || { startTime: '08:00', endTime: '18:00', isActive: true };
                                    return (
                                        <div key={day} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-primary)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input type="checkbox" checked={sch.isActive} onChange={(e) => handleScheduleChange('provider', idx, 'isActive', e.target.checked)} />
                                                <span style={{ fontWeight: 600, width: '70px' }}>{day}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <input type="text" placeholder="08:00" value={sch.startTime} onChange={(e) => handleScheduleChange('provider', idx, 'startTime', e.target.value)} disabled={!sch.isActive} style={{ width: '50px', textAlign: 'center', padding: '2px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: '3px', color: 'var(--text-primary)' }} />
                                                <span>às</span>
                                                <input type="text" placeholder="18:00" value={sch.endTime} onChange={(e) => handleScheduleChange('provider', idx, 'endTime', e.target.value)} disabled={!sch.isActive} style={{ width: '50px', textAlign: 'center', padding: '2px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: '3px', color: 'var(--text-primary)' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const fieldLabels: Record<string, string> = {
    fullName: 'Nome completo',
    cpf: 'CPF',
    rg: 'RG',
    phone: 'Telefone / WhatsApp',
    email: 'E-mail',
    photo: 'Foto de perfil / Biometria',
    vehiclePlate: 'Placa do veículo',
    parkingSpaces: 'Vagas de garagem / Garagens',
    companyName: 'Empresa / Razão social',
    cnpj: 'CNPJ da empresa',
    serviceType: 'Tipo de serviço / Finalidade',
};
