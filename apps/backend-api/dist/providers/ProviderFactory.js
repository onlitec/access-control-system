"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initProviders = initProviders;
exports.getProvider = getProvider;
exports.getGuaritaProvider = getGuaritaProvider;
exports.setProvider = setProvider;
const HikCentralProvider_1 = require("./HikCentralProvider");
const LocalProvider_1 = require("./LocalProvider");
const NiceGuaritaProvider_1 = require("./NiceGuaritaProvider");
let _primary = null;
let _guarita = null;
/**
 * Initialize the provider stack from environment config.
 * PROVIDER_TYPE controls the primary ACS provider (default: local).
 * Nice Guarita is always instantiated as a secondary (gate control only).
 */
function initProviders() {
    const type = (process.env.PROVIDER_TYPE ?? 'local').toLowerCase();
    switch (type) {
        case 'hikcentral':
            _primary = new HikCentralProvider_1.HikCentralProvider();
            console.log('[ProviderFactory] Primary provider: HikCentral');
            break;
        case 'nice_guarita':
            _primary = new NiceGuaritaProvider_1.NiceGuaritaProvider();
            console.log('[ProviderFactory] Primary provider: Nice Guarita (stub)');
            break;
        case 'local':
        default:
            _primary = new LocalProvider_1.LocalProvider();
            console.log('[ProviderFactory] Primary provider: Local (standalone)');
    }
    _guarita = new NiceGuaritaProvider_1.NiceGuaritaProvider();
}
/** Returns the active primary ACS provider. Initializes with LocalProvider if not yet set. */
function getProvider() {
    if (!_primary) {
        _primary = new LocalProvider_1.LocalProvider();
    }
    return _primary;
}
/** Returns the Nice Guarita provider (gate control). */
function getGuaritaProvider() {
    if (!_guarita) {
        _guarita = new NiceGuaritaProvider_1.NiceGuaritaProvider();
    }
    return _guarita;
}
/** Replace the active provider at runtime (e.g., after saving new config in admin). */
function setProvider(provider) {
    _primary = provider;
    console.log(`[ProviderFactory] Provider switched to: ${provider.name}`);
}
