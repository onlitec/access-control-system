import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export type EntityTabValue = 'visao-geral' | 'lista' | 'cadastrar';

const VALID_TABS: EntityTabValue[] = ['visao-geral', 'lista', 'cadastrar'];

/**
 * Sincroniza a aba ativa das páginas de entidade (Moradores/Visitantes/Prestadores)
 * com o query param `?tab=`. Mantém compatibilidade com `?action=new`
 * (links legados do Dashboard), convertendo-o para `tab=cadastrar`.
 */
export function useEntityTab(opts: { canRegister: boolean }): {
  tab: EntityTabValue;
  setTab: (t: EntityTabValue) => void;
} {
  const { canRegister } = opts;
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get('tab');
  let tab: EntityTabValue = VALID_TABS.includes(raw as EntityTabValue)
    ? (raw as EntityTabValue)
    : 'visao-geral';
  if (tab === 'cadastrar' && !canRegister) tab = 'lista';

  useEffect(() => {
    if (searchParams.get('action') === 'new' && canRegister) {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      next.set('tab', 'cadastrar');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canRegister]);

  const setTab = useCallback(
    (t: EntityTabValue) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', t);
        next.delete('action');
        return next;
      });
    },
    [setSearchParams]
  );

  return { tab, setTab };
}
