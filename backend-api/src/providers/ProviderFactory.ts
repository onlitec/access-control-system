import type { IAccessControlProvider } from './IAccessControlProvider';
import { HikCentralProvider } from './HikCentralProvider';
import { LocalProvider } from './LocalProvider';
import { NiceGuaritaProvider } from './NiceGuaritaProvider';

export type ProviderType = 'hikcentral' | 'local' | 'nice_guarita';

let _primary: IAccessControlProvider | null = null;
let _guarita: NiceGuaritaProvider | null = null;

/**
 * Initialize the provider stack from environment config.
 * PROVIDER_TYPE controls the primary ACS provider (default: local).
 * Nice Guarita is always instantiated as a secondary (gate control only).
 */
export function initProviders(): void {
  const type = (process.env.PROVIDER_TYPE ?? 'local').toLowerCase() as ProviderType;

  switch (type) {
    case 'hikcentral':
      _primary = new HikCentralProvider();
      console.log('[ProviderFactory] Primary provider: HikCentral');
      break;
    case 'nice_guarita':
      _primary = new NiceGuaritaProvider();
      console.log('[ProviderFactory] Primary provider: Nice Guarita (stub)');
      break;
    case 'local':
    default:
      _primary = new LocalProvider();
      console.log('[ProviderFactory] Primary provider: Local (standalone)');
  }

  _guarita = new NiceGuaritaProvider();
}

/** Returns the active primary ACS provider. Initializes with LocalProvider if not yet set. */
export function getProvider(): IAccessControlProvider {
  if (!_primary) {
    _primary = new LocalProvider();
  }
  return _primary;
}

/** Returns the Nice Guarita provider (gate control). */
export function getGuaritaProvider(): NiceGuaritaProvider {
  if (!_guarita) {
    _guarita = new NiceGuaritaProvider();
  }
  return _guarita;
}

/** Replace the active provider at runtime (e.g., after saving new config in admin). */
export function setProvider(provider: IAccessControlProvider): void {
  _primary = provider;
  console.log(`[ProviderFactory] Provider switched to: ${provider.name}`);
}
