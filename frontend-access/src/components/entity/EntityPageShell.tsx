import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, List, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { EntityTabValue } from '@/hooks/useEntityTab';

interface EntityPageShellProps {
  title: string;
  description?: string;
  tab: EntityTabValue;
  onTabChange: (t: EntityTabValue) => void;
  canRegister: boolean;
  registerLabel?: string;
  headerActions?: ReactNode;
  overview: ReactNode;
  list: ReactNode;
  register: ReactNode;
  filters?: ReactNode;
  filtersTitle?: string;
}

/**
 * Shell compartilhado das páginas de entidade (Moradores/Visitantes/Prestadores):
 * menu horizontal (Visão Geral | Lista | Cadastrar) no corpo da página,
 * com coluna de filtros recolhível na aba Lista.
 */
export function EntityPageShell({
  title,
  description,
  tab,
  onTabChange,
  canRegister,
  registerLabel = 'Cadastrar',
  headerActions,
  overview,
  list,
  register,
  filters,
  filtersTitle = 'Filtros'
}: EntityPageShellProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeTab = tab === 'cadastrar' && !canRegister ? 'lista' : tab;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {headerActions && <div className="flex gap-2">{headerActions}</div>}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as EntityTabValue)}>
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-12 gap-1">
          <TabsTrigger
            value="visao-geral"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-12 gap-2"
          >
            <LayoutDashboard className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger
            value="lista"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-12 gap-2"
          >
            <List className="h-4 w-4" />
            Lista
          </TabsTrigger>
          {canRegister && (
            <TabsTrigger
              value="cadastrar"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 h-12 gap-2"
            >
              <Plus className="h-4 w-4" />
              {registerLabel}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="visao-geral" className="mt-6">
          {overview}
        </TabsContent>

        <TabsContent value="lista" className="mt-6">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {filters && filtersOpen && (
              <Card className="w-full md:w-64 shrink-0 border-zinc-200 shadow-sm rounded-2xl">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-semibold">{filtersTitle}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setFiltersOpen(false)}
                    title="Recolher filtros"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>{filters}</CardContent>
              </Card>
            )}
            <div className="flex-1 w-full min-w-0 space-y-3">
              {filters && !filtersOpen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFiltersOpen(true)}
                  className="gap-2"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                  {filtersTitle}
                </Button>
              )}
              {list}
            </div>
          </div>
        </TabsContent>

        {canRegister && (
          <TabsContent value="cadastrar" className="mt-6">
            {register}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
