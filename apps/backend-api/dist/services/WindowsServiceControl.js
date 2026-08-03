"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_SERVICES = void 0;
exports.isAllowedService = isAllowedService;
exports.listServices = listServices;
exports.restartService = restartService;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Controle dos serviços do OnliAcesso pelo painel Admin.
 *
 * Windows (via PowerShell):
 * - Nunca usa `sc.exe` para consulta: a saída é localizada (pt-BR) e
 *   impossível de parsear com segurança. PowerShell devolve JSON.
 * - Scripts são passados por -EncodedCommand (base64 UTF-16LE) para
 *   eliminar problemas de quoting.
 *
 * Linux (via systemd):
 * - `systemctl show` devolve pares chave=valor, estáveis e não localizados.
 * - O restart precisa de privilégio: o install.sh instala uma regra sudoers
 *   restrita a `systemctl restart onliacesso-*` (nada além disso). Sem essa
 *   regra a listagem continua funcionando e só o botão de reiniciar falha.
 */
const IS_WINDOWS = process.platform === 'win32';
const WINDOWS_SERVICES = [
    'onliacesso-postgres',
    'onliacesso-api',
    'onliacesso-visitor',
    'onliacesso-access',
    'onliacesso-admin',
    'onliacesso-proxy',
];
// No Linux o PostgreSQL e o nginx são serviços do próprio sistema, e os painéis
// (/painel/, /admin/) são servidos pelo nginx — não existem onliacesso-access
// nem onliacesso-admin. Ver installer/linux/README.md.
const LINUX_SERVICES = [
    'postgresql',
    'onliacesso-api',
    'onliacesso-visitor',
    'onliacesso-vms',
    'onliacesso-mediamtx',
    'nginx',
];
exports.ALLOWED_SERVICES = IS_WINDOWS ? WINDOWS_SERVICES : LINUX_SERVICES;
// Reiniciar estes serviços derruba a própria API (self-restart) ou toda a
// cadeia (postgres); o restart precisa rodar FORA da árvore de processos do
// WinSW (que mata os filhos ao parar o serviço) — via tarefa agendada SYSTEM.
// No Linux isso não é problema: o systemd é o pai dos serviços, e um
// `systemctl restart` disparado pela própria API sobrevive à morte dela.
const DEFERRED_SERVICES = IS_WINDOWS
    ? ['onliacesso-postgres', 'onliacesso-api']
    : [];
function isAllowedService(name) {
    return exports.ALLOWED_SERVICES.includes(name);
}
async function runPowerShell(script, timeoutMs = 30000) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { timeout: timeoutMs, windowsHide: true });
    return stdout;
}
// ── systemd (Linux) ──────────────────────────────────────────────────────────
/** `systemctl show` devolve chave=valor — estável e não localizado. */
async function systemdShow(name) {
    const { stdout } = await execFileAsync('systemctl', [
        'show', name,
        '--property=LoadState,ActiveState,SubState,UnitFileState,MainPID,MemoryCurrent,ExecMainStartTimestamp,Description',
        '--no-pager',
    ], { timeout: 10000 });
    const out = {};
    for (const line of stdout.split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0)
            out[line.slice(0, idx)] = line.slice(idx + 1).trim();
    }
    return out;
}
async function listServicesSystemd() {
    const infos = await Promise.all(exports.ALLOWED_SERVICES.map(async (name) => {
        try {
            const p = await systemdShow(name);
            if (!p.LoadState || p.LoadState === 'not-found')
                return null;
            const pid = Number(p.MainPID || 0);
            const mem = Number(p.MemoryCurrent || 0);
            // ExecMainStartTimestamp: "Sat 2026-07-12 01:20:33 -03" (vazio se parado)
            const startedAt = p.ExecMainStartTimestamp ? Date.parse(p.ExecMainStartTimestamp) : NaN;
            return {
                name,
                displayName: p.Description || name,
                // o painel espera o vocabulário do Windows
                status: p.ActiveState === 'active' ? 'Running'
                    : p.ActiveState === 'activating' ? 'StartPending'
                        : p.ActiveState === 'failed' ? 'Failed'
                            : 'Stopped',
                startType: p.UnitFileState === 'enabled' ? 'Automatic'
                    : p.UnitFileState === 'disabled' ? 'Disabled'
                        : p.UnitFileState || 'Unknown',
                pid: pid > 0 ? pid : null,
                memoryBytes: mem > 0 ? mem : null,
                uptimeSeconds: Number.isFinite(startedAt)
                    ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
                    : null,
            };
        }
        catch {
            return null; // unit inexistente nesta instalação (ex.: VMS não instalado)
        }
    }));
    return infos.filter((s) => s !== null);
}
async function restartServiceSystemd(name) {
    // Requer a regra sudoers instalada pelo install.sh (restrita a estes units).
    await execFileAsync('sudo', ['-n', 'systemctl', 'restart', name], { timeout: 90000 });
    return { mode: 'sync', message: `Serviço ${name} reiniciado.` };
}
// ── Windows (PowerShell) ─────────────────────────────────────────────────────
async function listServices() {
    if (!IS_WINDOWS)
        return listServicesSystemd();
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$svcs = Get-CimInstance Win32_Service -Filter "Name LIKE 'onliacesso-%'"
$out = @()
foreach ($s in $svcs) {
    $mem = $null; $started = $null
    if ($s.ProcessId -gt 0) {
        $p = Get-Process -Id $s.ProcessId -ErrorAction SilentlyContinue
        if ($p) {
            $mem = $p.WorkingSet64
            try { $started = $p.StartTime.ToUniversalTime().ToString('o') } catch {}
        }
    }
    $out += [pscustomobject]@{
        name        = $s.Name
        displayName = $s.DisplayName
        status      = $s.State
        startType   = $s.StartMode
        pid         = [int]$s.ProcessId
        memoryBytes = $mem
        startedAt   = $started
    }
}
ConvertTo-Json @($out) -Depth 3
`;
    const stdout = (await runPowerShell(script)).trim();
    if (!stdout)
        return [];
    let parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed))
        parsed = [parsed];
    const now = Date.now();
    return parsed
        .filter((s) => isAllowedService(s?.name))
        .map((s) => ({
        name: s.name,
        displayName: s.displayName || s.name,
        status: s.status || 'Unknown',
        startType: s.startType === 'Auto' ? 'Automatic' : (s.startType || 'Unknown'),
        pid: s.pid > 0 ? s.pid : null,
        memoryBytes: typeof s.memoryBytes === 'number' ? s.memoryBytes : null,
        uptimeSeconds: s.startedAt
            ? Math.max(0, Math.floor((now - Date.parse(s.startedAt)) / 1000))
            : null,
    }))
        .sort((a, b) => exports.ALLOWED_SERVICES.indexOf(a.name) -
        exports.ALLOWED_SERVICES.indexOf(b.name));
}
// Reinicia o serviço e religa os dependentes que estavam rodando
// (Restart-Service -Force para os dependentes, mas não os religa sozinho).
const restartScript = (name) => `
$ErrorActionPreference = 'Stop'
$deps = Get-Service -Name '${name}' -DependentServices |
    Where-Object { $_.Status -eq 'Running' } | Select-Object -ExpandProperty Name
Restart-Service -Name '${name}' -Force
foreach ($d in @('onliacesso-api','onliacesso-visitor','onliacesso-access','onliacesso-admin','onliacesso-proxy')) {
    if ($deps -contains $d) { Start-Service -Name $d -ErrorAction SilentlyContinue }
}
`;
async function restartService(name) {
    if (!IS_WINDOWS)
        return restartServiceSystemd(name);
    if (!DEFERRED_SERVICES.includes(name)) {
        await runPowerShell(restartScript(name), 90000);
        return { mode: 'sync', message: `Serviço ${name} reiniciado.` };
    }
    // Self-restart (api) ou cascata (postgres): o comando roda como tarefa
    // agendada one-shot do SYSTEM, fora da árvore de processos do WinSW.
    const scriptPath = path_1.default.join(os_1.default.tmpdir(), 'onliacesso-restart-svc.ps1');
    fs_1.default.writeFileSync(scriptPath, restartScript(name), 'utf8');
    const taskName = 'OnliAcessoServiceRestart';
    const taskCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
    await execFileAsync('schtasks.exe', [
        '/Create', '/F', '/TN', taskName, '/RU', 'SYSTEM',
        '/SC', 'ONCE', '/ST', '00:00', '/TR', taskCmd,
    ], { timeout: 15000, windowsHide: true });
    await execFileAsync('schtasks.exe', ['/Run', '/TN', taskName], {
        timeout: 15000,
        windowsHide: true,
    });
    return {
        mode: 'deferred',
        message: `Reinício de ${name} agendado. O painel pode ficar indisponível por alguns segundos ` +
            'enquanto os serviços reiniciam.',
    };
}
