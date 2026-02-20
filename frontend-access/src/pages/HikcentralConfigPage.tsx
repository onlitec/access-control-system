import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getHikcentralConfig, createOrUpdateHikcentralConfig } from '@/db/api';
import { useAuth } from '@/contexts/AuthContext';
import type { HikcentralConfig } from '@/types';
import { Settings, Save, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function HikcentralConfigPage() {
  const [config, setConfig] = useState<HikcentralConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    api_url: '',
    app_key: '',
    app_secret: '',
    sync_enabled: false,
    sync_interval_minutes: 30,
    notes: ''
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await getHikcentralConfig();
      if (data) {
        setConfig(data);
        setFormData({
          api_url: data.api_url,
          app_key: data.app_key,
          app_secret: data.app_secret,
          sync_enabled: data.sync_enabled,
          sync_interval_minutes: data.sync_interval_minutes,
          notes: data.notes || ''
        });
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.api_url || !formData.app_key || !formData.app_secret) {
      toast({
        title: 'Erro',
        description: 'Por favor, preencha todos os campos obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      await createOrUpdateHikcentralConfig({
        config_name: 'default',
        api_url: formData.api_url,
        app_key: formData.app_key,
        app_secret: formData.app_secret,
        sync_enabled: formData.sync_enabled,
        sync_interval_minutes: formData.sync_interval_minutes,
        last_sync: null,
        notes: formData.notes || null,
        created_by: profile?.id || null,
        updated_by: profile?.id || null
      });

      toast({
        title: 'Sucesso',
        description: 'Configuração salva com sucesso'
      });
      loadConfig();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configuração',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64 bg-muted" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full bg-muted" />
            <Skeleton className="h-10 w-full bg-muted" />
            <Skeleton className="h-10 w-full bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuração Hikcentral</h1>
        <p className="text-muted-foreground mt-1">
          Configure a integração com Hikcentral 3.0.1 OpenAPI
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Parâmetros de Conexão
          </CardTitle>
          <CardDescription>
            Configure as credenciais App Key e App Secret geradas no portal OpenAPI do Hikcentral
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="api_url">URL da API *</Label>
            <Input
              id="api_url"
              placeholder="https://192.168.1.100:443"
              value={formData.api_url}
              onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Endereço do servidor Hikcentral (recomenda-se HTTPS na porta 443)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app_key">App Key *</Label>
            <Input
              id="app_key"
              placeholder="Digite o App Key"
              value={formData.app_key}
              onChange={(e) => setFormData({ ...formData, app_key: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app_secret">App Secret *</Label>
            <Input
              id="app_secret"
              type="password"
              placeholder="••••••••"
              value={formData.app_secret}
              onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between space-x-2 border rounded-lg p-4">
            <div className="space-y-0.5">
              <Label htmlFor="sync_enabled">Sincronização Automática</Label>
              <p className="text-sm text-muted-foreground">
                Ativar sincronização automática de dados
              </p>
            </div>
            <Switch
              id="sync_enabled"
              checked={formData.sync_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, sync_enabled: checked })}
            />
          </div>

          {formData.sync_enabled && (
            <div className="space-y-2">
              <Label htmlFor="sync_interval">Intervalo de Sincronização (minutos)</Label>
              <Input
                id="sync_interval"
                type="number"
                min="5"
                max="1440"
                value={formData.sync_interval_minutes}
                onChange={(e) => setFormData({ ...formData, sync_interval_minutes: parseInt(e.target.value) || 30 })}
              />
              <p className="text-sm text-muted-foreground">
                Intervalo entre sincronizações automáticas (5-1440 minutos)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              placeholder="Observações sobre a configuração..."
              rows={4}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          {config?.last_sync && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Última sincronização:</span>
                <span className="font-medium">
                  {new Date(config.last_sync).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={loadConfig}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar Configuração'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações sobre a Integração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Esta configuração permite a integração com o sistema Hikcentral versão 3.0.1 via OpenAPI.
          </p>
          <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
            <li>Certifique-se de que o servidor Hikcentral está acessível na rede local</li>
            <li>Utilize credenciais com permissões adequadas para acesso à API</li>
            <li>A sincronização automática permite manter os dados atualizados</li>
            <li>Configure o intervalo de sincronização de acordo com suas necessidades</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
