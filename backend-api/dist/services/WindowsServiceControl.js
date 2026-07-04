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
 * Controle dos serviços Windows do OnliAcesso (via PowerShell).
 *
 * - Nunca usa `sc.exe` para consulta: a saída é localizada (pt-BR) e
 *   impossível de parsear com segurança. PowerShell devolve JSON.
 * - Scripts são passados por -EncodedCommand (base64 UTF-16LE) para
 *   eliminar problemas de quoting.
 */
exports.ALLOWED_SERVICES = [
    'onliacesso-postgres',
    'onliacesso-api',
    'onliacesso-visitor',
    'onliacesso-access',
    'onliacesso-admin',
    'onliacesso-proxy',
];
// Reiniciar estes serviços derruba a própria API (self-restart) ou toda a
// cadeia (postgres); o restart precisa rodar FORA da árvore de processos do
// WinSW (que mata os filhos ao parar o serviço) — via tarefa agendada SYSTEM.
const DEFERRED_SERVICES = ['onliacesso-postgres', 'onliacesso-api'];
function isAllowedService(name) {
    return exports.ALLOWED_SERVICES.includes(name);
}
async function runPowerShell(script, timeoutMs = 30000) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { timeout: timeoutMs, windowsHide: true });
    return stdout;
}
async function listServices() {
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
