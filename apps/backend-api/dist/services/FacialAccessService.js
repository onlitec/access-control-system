"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacialAccessService = exports.FACIAL_ACCESS_MINORS = void 0;
exports.mapFacialEvent = mapFacialEvent;
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const node_fetch_1 = __importDefault(require("node-fetch"));
const digest_fetch_utils_1 = require("../utils/digest-fetch.utils");
const prisma = new client_1.PrismaClient();
/** Mapeamento curado de eventos ACS (major 5) → feed. Minors fora daqui são ignorados. */
exports.FACIAL_ACCESS_MINORS = {
    1: { label: 'Cartão válido', status: 'authorized' },
    38: { label: 'Digital reconhecida', status: 'authorized' },
    39: { label: 'Digital não reconhecida', status: 'denied' },
    75: { label: 'Reconhecimento facial', status: 'authorized' },
    76: { label: 'Face não reconhecida', status: 'denied' },
};
class FacialAccessService {
    // ── HTTP/ISAPI ────────────────────────────────────────────────────────────
    static async testConnection(ip, port, username, password) {
        try {
            const url = `http://${ip}:${port}/ISAPI/System/deviceInfo`;
            const response = await (0, digest_fetch_utils_1.digestFetch)(url, username, password);
            // 200 = auth OK, 401 = alcançável mas credencial errada — ambos indicam que o equipamento está lá
            return response.ok || response.status === 401;
        }
        catch {
            return false;
        }
    }
    static async isapiJson(device, method, path, body) {
        const url = `http://${device.ip}:${device.port}${path}`;
        const res = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password, method, body !== undefined ? JSON.stringify(body) : undefined, body !== undefined ? { 'Content-Type': 'application/json' } : undefined, { timeoutMs: 15000 });
        const text = await res.text();
        let json = null;
        try {
            json = JSON.parse(text);
        }
        catch { /* respostas XML de erro caem aqui */ }
        if (!res.ok) {
            throw new Error(`ISAPI ${method} ${path} → HTTP ${res.status}: ${json?.errorMsg ?? json?.statusString ?? text.slice(0, 200)}`);
        }
        return json;
    }
    static async listDevices() {
        return prisma.facialAccessDevice.findMany({
            include: { doors: { include: { readers: true }, orderBy: { doorNo: 'asc' } } },
            orderBy: { name: 'asc' },
        });
    }
    static async getDevice(deviceId) {
        const device = await prisma.facialAccessDevice.findUnique({ where: { id: deviceId } });
        if (!device)
            throw new Error('Dispositivo facial não encontrado');
        return device;
    }
    // ── Identificador da pessoa no equipamento (employeeNo) ──────────────────
    /**
     * Garante um `facialAccessCardNo` (employeeNo numérico, o mesmo em todos os
     * equipamentos) para a pessoa — gera sequencial a partir de 100.
     */
    static async ensureCardNo(personId) {
        const person = await prisma.person.findUnique({
            where: { id: personId },
            select: { facialAccessCardNo: true },
        });
        if (!person)
            throw new Error('Morador não encontrado');
        if (person.facialAccessCardNo)
            return person.facialAccessCardNo;
        const all = await prisma.person.findMany({
            where: { facialAccessCardNo: { not: null } },
            select: { facialAccessCardNo: true },
        });
        let max = 99;
        for (const p of all) {
            const n = Number(p.facialAccessCardNo);
            if (Number.isFinite(n) && n > max)
                max = n;
        }
        const cardNo = String(max + 1);
        await prisma.person.update({ where: { id: personId }, data: { facialAccessCardNo: cardNo } });
        return cardNo;
    }
    // ── Nível de acesso: quais portas deste equipamento a pessoa pode usar ───
    /** doorNos deste equipamento liberados pelas áreas de acesso da pessoa. */
    static async entitledDoorNos(personId, deviceId) {
        const links = await prisma.residentAccessArea.findMany({
            where: { personId },
            select: {
                area: {
                    select: { doors: { select: { door: { select: { deviceId: true, doorNo: true } } } } },
                },
            },
        });
        const doorNos = new Set();
        for (const l of links) {
            for (const ad of l.area.doors) {
                if (ad.door.deviceId === deviceId)
                    doorNos.add(ad.door.doorNo);
            }
        }
        return [...doorNos].sort((a, b) => a - b);
    }
    // ── Cadastro de pessoa + face no equipamento ──────────────────────────────
    /** Upsert da pessoa no equipamento com as portas liberadas (UserInfo/SetUp). */
    static async setUpUser(device, cardNo, name, doorNos) {
        await this.isapiJson(device, 'PUT', '/ISAPI/AccessControl/UserInfo/SetUp?format=json', {
            UserInfo: {
                employeeNo: cardNo,
                name: name.slice(0, 128) || `Morador ${cardNo}`,
                userType: 'normal',
                Valid: {
                    enable: true,
                    beginTime: '2000-01-01T00:00:00',
                    endTime: '2037-12-31T23:59:59',
                    timeType: 'local',
                },
                doorRight: doorNos.join(','),
                RightPlan: doorNos.map((doorNo) => ({ doorNo, planTemplateNo: '1' })), // template 1 = sempre liberado
            },
        });
    }
    /** Carrega a foto da pessoa como Buffer jpg/png (data URL, http(s) ou base64 puro). */
    static async loadPhoto(photoUrl) {
        if (photoUrl.startsWith('data:')) {
            return Buffer.from(photoUrl.split(',')[1] || '', 'base64');
        }
        if (/^https?:\/\//i.test(photoUrl)) {
            const res = await (0, node_fetch_1.default)(photoUrl, { signal: AbortSignal.timeout(10000) });
            if (!res.ok)
                throw new Error(`Foto inacessível (HTTP ${res.status})`);
            return Buffer.from(await res.arrayBuffer());
        }
        return Buffer.from(photoUrl, 'base64');
    }
    /**
     * Envia a foto ao FDLib do equipamento (substitui a face anterior, se houver).
     * Lança erro com mensagem clara quando o firmware não detecta rosto na foto.
     */
    static async enrollFace(device, cardNo, photoUrl) {
        const img = await this.loadPhoto(photoUrl);
        // Remove a face anterior (idempotente — OK mesmo quando não existe)
        await this.isapiJson(device, 'PUT', '/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD', {
            FPID: [{ value: cardNo }],
        }).catch(() => { });
        const boundary = '----OnliAcesso' + (0, crypto_1.randomBytes)(8).toString('hex');
        const meta = JSON.stringify({ faceLibType: 'blackFD', FDID: '1', FPID: cardNo });
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\n` +
                `Content-Type: application/json\r\n\r\n${meta}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="face.jpg"\r\n` +
                `Content-Type: image/jpeg\r\n\r\n`),
            img,
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        const url = `http://${device.ip}:${device.port}/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json`;
        const res = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password, 'POST', body, {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
        }, { timeoutMs: 30000 });
        const text = await res.text();
        let json = null;
        try {
            json = JSON.parse(text);
        }
        catch { /* ignore */ }
        if (json?.statusCode === 1)
            return;
        if (json?.subStatusCode === 'SubpicAnalysisModelingError') {
            throw new Error('O equipamento não detectou um rosto utilizável na foto — use uma foto frontal, com o rosto ocupando boa parte do quadro');
        }
        throw new Error(`Falha ao enviar face: ${json?.errorMsg ?? json?.statusString ?? `HTTP ${res.status}`}`);
    }
    /** Remove pessoa (e face vinculada) do equipamento. */
    static async deletePersonFromDevice(device, cardNo) {
        await this.isapiJson(device, 'PUT', '/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD', {
            FPID: [{ value: cardNo }],
        }).catch(() => { });
        await this.isapiJson(device, 'PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', {
            UserInfoDelCond: { EmployeeNoList: [{ employeeNo: cardNo }] },
        });
    }
    static serialize(key, fn) {
        const prev = this.syncChains.get(key) ?? Promise.resolve();
        const next = prev.then(fn, fn);
        this.syncChains.set(key, next.then(() => undefined, () => undefined));
        return next;
    }
    /**
     * Sincroniza UMA pessoa com UM equipamento: cadastra/atualiza (com as portas
     * liberadas pelas áreas dela) ou remove quando ela não tem porta nenhuma lá.
     */
    static syncPersonToDevice(deviceId, personId) {
        return this.serialize(`${deviceId}:${personId}`, () => this.syncPersonToDeviceUnlocked(deviceId, personId));
    }
    static async syncPersonToDeviceUnlocked(deviceId, personId) {
        const device = await this.getDevice(deviceId);
        const person = await prisma.person.findUnique({
            where: { id: personId },
            select: { id: true, firstName: true, lastName: true, photoUrl: true, facialAccessCardNo: true },
        });
        if (!person)
            throw new Error('Morador não encontrado');
        const personName = `${person.firstName} ${person.lastName}`.trim();
        const doorNos = await this.entitledDoorNos(personId, deviceId);
        if (doorNos.length === 0) {
            // Sem porta liberada neste equipamento — remove, se já esteve cadastrada
            if (person.facialAccessCardNo) {
                try {
                    await this.deletePersonFromDevice(device, person.facialAccessCardNo);
                    return { personId, personName, cardNo: person.facialAccessCardNo, action: 'removed', faceStatus: 'removed' };
                }
                catch (err) {
                    return { personId, personName, cardNo: person.facialAccessCardNo, action: 'error', faceStatus: null, detail: err.message };
                }
            }
            return { personId, personName, cardNo: null, action: 'skipped', faceStatus: null, detail: 'Nenhuma porta deste equipamento nas áreas do morador' };
        }
        const cardNo = await this.ensureCardNo(personId);
        try {
            await this.setUpUser(device, cardNo, personName, doorNos);
        }
        catch (err) {
            return { personId, personName, cardNo, action: 'error', faceStatus: null, detail: err.message };
        }
        if (!person.photoUrl) {
            return { personId, personName, cardNo, action: 'enrolled', faceStatus: 'no_photo', detail: 'Morador sem foto cadastrada — acesso facial só funciona após enviar a foto' };
        }
        try {
            await this.enrollFace(device, cardNo, person.photoUrl);
            return { personId, personName, cardNo, action: 'enrolled', faceStatus: 'synced' };
        }
        catch (err) {
            const modeling = /não detectou um rosto/i.test(err.message);
            return { personId, personName, cardNo, action: 'enrolled', faceStatus: modeling ? 'modeling_failed' : 'error', detail: err.message };
        }
    }
    /** Sincroniza UMA pessoa com TODOS os equipamentos habilitados. */
    static async syncPersonEverywhere(personId) {
        const devices = await prisma.facialAccessDevice.findMany({ where: { enabled: true } });
        const results = [];
        for (const device of devices) {
            try {
                const r = await this.syncPersonToDevice(device.id, personId);
                results.push({ ...r, deviceId: device.id, deviceName: device.name });
            }
            catch (err) {
                results.push({
                    personId, personName: '', cardNo: null, action: 'error', faceStatus: null,
                    detail: err.message, deviceId: device.id, deviceName: device.name,
                });
            }
        }
        return results;
    }
    /**
     * Sincroniza TODAS as pessoas relevantes com um equipamento: cadastra quem tem
     * porta liberada lá e remove (dentre as gerenciadas pelo OnliAcesso, i.e. com
     * facialAccessCardNo) quem não tem mais. Não mexe em cadastros manuais feitos
     * direto no equipamento.
     */
    static async syncAllToDevice(deviceId) {
        const doors = await prisma.facialAccessDoor.findMany({ where: { deviceId }, select: { id: true } });
        const doorIds = doors.map((d) => d.id);
        // Pessoas com alguma área que libera porta deste equipamento
        const entitled = await prisma.person.findMany({
            where: { accessAreas: { some: { area: { doors: { some: { doorId: { in: doorIds } } } } } } },
            select: { id: true },
        });
        // Pessoas gerenciadas (já têm cardNo) que não têm mais direito neste equipamento
        const managed = await prisma.person.findMany({
            where: {
                facialAccessCardNo: { not: null },
                NOT: { accessAreas: { some: { area: { doors: { some: { doorId: { in: doorIds } } } } } } },
            },
            select: { id: true },
        });
        const results = [];
        for (const p of [...entitled, ...managed]) {
            results.push(await this.syncPersonToDevice(deviceId, p.id));
        }
        return results;
    }
    // ── Snapshot da câmera do terminal ────────────────────────────────────────
    /**
     * Captura um JPEG da câmera do terminal facial (validado no DS-K1T673:
     * canal 101; o canal 1 responde `invalidID`). Usado pelo painel do operador
     * para capturar a foto de cadastro direto no equipamento.
     */
    static async getSnapshot(deviceId) {
        const device = await this.getDevice(deviceId);
        const url = `http://${device.ip}:${device.port}/ISAPI/Streaming/channels/101/picture`;
        const res = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password, 'GET', undefined, undefined, { timeoutMs: 10000 });
        const buffer = Buffer.from(await res.arrayBuffer());
        // JPEG começa com FF D8 — se vier XML é erro ISAPI (ex.: invalidID)
        if (!res.ok || buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
            const msg = buffer.toString('utf-8', 0, 300).match(/<statusString>([^<]+)<\/statusString>/)?.[1] ?? `HTTP ${res.status}`;
            throw new Error(`Snapshot indisponível: ${msg}`);
        }
        return buffer;
    }
    // ── Captura assistida de face no terminal ────────────────────────────────
    /**
     * Captura assistida (mesmo fluxo que o HikCentral usa): coloca o terminal em
     * modo de cadastro — a tela do equipamento exibe o círculo de posicionamento —
     * e o motor facial do próprio terminal captura uma foto com qualidade
     * garantida para cadastro.
     *
     * Semântica validada no DS-K1T673DX (fw V3.18.0): cada POST em
     * /ISAPI/AccessControl/CaptureFaceData mantém o modo captura ativo e retorna
     * na hora — XML com <captureProgress>0</captureProgress> enquanto não há
     * rosto; quando o terminal captura, a resposta vem multipart com o JPEG
     * embutido. DELETE não é suportado (methodNotAllowed); o modo expira sozinho
     * quando o polling cessa.
     */
    static async captureFaceFromTerminal(deviceId, timeoutMs = 45000) {
        const device = await this.getDevice(deviceId);
        const url = `http://${device.ip}:${device.port}/ISAPI/AccessControl/CaptureFaceData`;
        const cond = '<CaptureFaceDataCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">' +
            '<captureInfrared>false</captureInfrared><dataType>binary</dataType></CaptureFaceDataCond>';
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const res = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password, 'POST', cond, {
                'Content-Type': 'application/xml',
            }, { timeoutMs: 15000 });
            const buf = Buffer.from(await res.arrayBuffer());
            // Rosto capturado: multipart com JPEG binário (FF D8 ... FF D9)
            const start = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
            if (start !== -1) {
                const end = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
                if (end > start)
                    return buf.subarray(start, end + 2);
            }
            // Sem rosto ainda (XML de progresso) — segue em modo captura
            await new Promise((r) => setTimeout(r, 800));
        }
        throw new Error('Tempo esgotado — nenhum rosto foi capturado no terminal');
    }
    // ── Acionamento remoto de porta ───────────────────────────────────────────
    static async controlDoor(deviceId, doorNo, cmd) {
        const device = await this.getDevice(deviceId);
        const url = `http://${device.ip}:${device.port}/ISAPI/AccessControl/RemoteControl/door/${doorNo}`;
        const body = `<RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><cmd>${cmd}</cmd></RemoteControlDoor>`;
        const res = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password, 'PUT', body, {
            'Content-Type': 'application/xml',
        }, { timeoutMs: 10000 });
        const text = await res.text();
        if (!res.ok || !/statusCode>1</.test(text.replace(/\s/g, ''))) {
            const msg = text.match(/<statusString>([^<]+)<\/statusString>/)?.[1] ?? `HTTP ${res.status}`;
            throw new Error(`Falha ao acionar porta ${doorNo}: ${msg}`);
        }
    }
    static startImportEvents(deviceId) {
        const existing = this.importJobs.get(deviceId);
        if (existing?.running)
            return existing;
        const progress = { running: true, processed: 0, imported: 0, total: null, startedAt: new Date() };
        this.importJobs.set(deviceId, progress);
        void (async () => {
            try {
                const device = await this.getDevice(deviceId);
                const doors = await prisma.facialAccessDoor.findMany({ where: { deviceId } });
                const doorByNo = new Map(doors.map((d) => [d.doorNo, d]));
                const persons = await prisma.person.findMany({
                    where: { facialAccessCardNo: { not: null } },
                    select: { id: true, firstName: true, lastName: true, unit_number: true, photoUrl: true, facialAccessCardNo: true },
                });
                const personByCardNo = new Map(persons.map((p) => [p.facialAccessCardNo, p]));
                const searchID = `onli-${Date.now()}`;
                let position = 0;
                let batch = [];
                const flush = async () => {
                    if (batch.length === 0)
                        return;
                    const result = await prisma.accessEvent.createMany({ data: batch, skipDuplicates: true });
                    progress.imported += result.count;
                    batch = [];
                };
                for (;;) {
                    const res = await this.isapiJson(device, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', {
                        AcsEventCond: { searchID, searchResultPosition: position, maxResults: 30, major: 0, minor: 0 },
                    });
                    const search = res?.AcsEvent;
                    if (!search || search.responseStatusStrg === 'NO MATCH')
                        break;
                    progress.total = search.totalMatches ?? progress.total;
                    const list = search.InfoList ?? [];
                    for (const ev of list) {
                        progress.processed++;
                        const mapped = mapFacialEvent(ev.major, ev.minor);
                        if (!mapped)
                            continue;
                        const door = ev.doorNo != null ? doorByNo.get(ev.doorNo) ?? null : null;
                        const cardNo = ev.employeeNoString ?? (ev.employeeNo != null ? String(ev.employeeNo) : null);
                        const person = cardNo ? personByCardNo.get(cardNo) ?? null : null;
                        const when = new Date(ev.time);
                        if (isNaN(when.getTime()))
                            continue;
                        batch.push({
                            id: `facial-${device.id}-${ev.serialNo}`,
                            occurredAt: when,
                            eventTime: when,
                            personName: person
                                ? `${person.firstName} ${person.lastName}`.trim()
                                : mapped.kind === 'alarm' ? mapped.label
                                    : ev.name || mapped.label,
                            personType: person ? 'resident' : 'system',
                            personId: person?.id ?? null,
                            unit: person?.unit_number ?? null,
                            deviceName: door?.name ?? device.name,
                            status: mapped.status,
                            photoUrl: person?.photoUrl ?? null,
                            direction: door?.direction === 'entry' ? 'in' : door?.direction === 'exit' ? 'out' : null,
                            category: mapped.kind,
                            source: 'facial_access',
                            notes: mapped.kind === 'access' && !person && cardNo ? `employeeNo ${cardNo}` : null,
                            metadata: {
                                deviceId: device.id, doorId: door?.id ?? null, serialNo: ev.serialNo,
                                major: ev.major, minor: ev.minor, verifyMode: ev.currentVerifyMode ?? null,
                                mask: ev.mask ?? null, importedFromDevice: true,
                            },
                        });
                        if (batch.length >= 200)
                            await flush();
                    }
                    if (search.responseStatusStrg !== 'MORE')
                        break;
                    position += list.length;
                }
                await flush();
                progress.running = false;
                progress.finishedAt = new Date();
                console.log(`[FacialAccess] Importação de histórico concluída: ${progress.imported} eventos de ${progress.processed} lidos (${device.name})`);
            }
            catch (err) {
                progress.running = false;
                progress.finishedAt = new Date();
                progress.error = err.message;
                console.error('[FacialAccess] Importação de histórico falhou:', err.message);
            }
        })();
        return progress;
    }
}
exports.FacialAccessService = FacialAccessService;
// ── Sincronização (pessoa → equipamentos) ─────────────────────────────────
// Serializa syncs concorrentes da mesma pessoa no mesmo equipamento — sem
// isso, o delete-então-envia da face corre em paralelo (ex.: hook de áreas +
// sync explícito) e a pessoa acaba com faces duplicadas no equipamento.
FacialAccessService.syncChains = new Map();
// ── Importação do histórico de eventos (AcsEvent) — Fase 6 ────────────────
/**
 * O terminal guarda até 50.000 eventos. Job em segundo plano, idempotente:
 * id derivado de deviceId+serialNo (createMany com skipDuplicates), então o
 * mesmo evento vindo do import e do alertStream não duplica. Caveat: se o log
 * do equipamento for zerado, os serialNo recomeçam e eventos novos podem
 * colidir com ids antigos — aceitável para histórico.
 */
FacialAccessService.importJobs = new Map();
/**
 * Classifica um evento ACS (major/minor) para o feed unificado.
 * major 1 = alarme (tamper/violação/coação) → category 'alarm';
 * major 5 = evento de acesso → só os minors do mapa curado;
 * majors 2 (exceção) e 3 (operação) são ruído administrativo → ignorados.
 */
function mapFacialEvent(major, minor) {
    if (major === 1) {
        return { kind: 'alarm', label: `Alarme do terminal (código ${minor})`, status: 'denied' };
    }
    if (major === 5) {
        const m = exports.FACIAL_ACCESS_MINORS[minor];
        if (m)
            return { kind: 'access', label: m.label, status: m.status };
    }
    return null;
}
