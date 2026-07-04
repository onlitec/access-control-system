"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const HikCentralService_1 = require("../services/HikCentralService");
const HikCentralSyncService_1 = require("../services/HikCentralSyncService");
const RegistrationController_1 = require("../controllers/RegistrationController");
const router = (0, express_1.Router)();
const registrationController = new RegistrationController_1.RegistrationController();
/**
 * GET /api/hikcentral/organizations
 * Retorna a lista de organizações (Torres/Departamentos)
 */
router.get('/organizations', async (req, res) => {
    try {
        const result = await HikCentralService_1.HikCentralService.getOrgList(1, 1000);
        return res.json(result.data?.list || []);
    }
    catch (error) {
        console.error(`[Organizations] ERROR: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/hikcentral/access-levels
 * Retorna os níveis de acesso (Piscinas, Academias, etc)
 */
router.get('/access-levels', async (req, res) => {
    try {
        const result = await HikCentralService_1.HikCentralService.getAccessLevelList(1, 1000);
        return res.json(result.data?.list || []);
    }
    catch (error) {
        console.error(`[AccessLevels] ERROR: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/hikcentral/terminals
 * Retorna lista de dispositivos (ACS ou Câmeras)
 */
router.get('/terminals', async (req, res) => {
    try {
        const terminals = await HikCentralService_1.HikCentralService.getTerminals();
        return res.status(200).json({
            success: true,
            data: {
                list: terminals
            }
        });
    }
    catch (error) {
        console.error(`[Terminals] ERROR: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/hikcentral/devices/capture-terminals
 * Unificado para trazer tanto ACS quanto Cameras (se for o caso), mas priorizando ACS de captura
 */
router.get('/devices/capture-terminals', async (req, res) => {
    try {
        const terminals = await HikCentralService_1.HikCentralService.getTerminals();
        return res.status(200).json({
            success: true,
            data: {
                list: terminals
            }
        });
    }
    catch (error) {
        console.error(`[CaptureTerminals] ERROR: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
router.post('/remote-capture', async (req, res) => {
    try {
        const { deviceIndexCode } = req.body;
        if (!deviceIndexCode)
            return res.status(400).json({ error: 'deviceIndexCode is required' });
        console.log(`[RemoteCapture] Invocando captura para device index: ${deviceIndexCode}`);
        // Discovery attempt
        const cameraUuid = await HikCentralService_1.HikCentralService.resolveCameraIndexCodeByDeviceId(String(deviceIndexCode));
        const targetId = cameraUuid || String(deviceIndexCode);
        console.log(`[RemoteCapture] Target ID resolvido: ${targetId}`);
        // Tenta capturar. O método já tem o fallback interno para ACS agora.
        const buffer = await HikCentralService_1.HikCentralService.captureCameraPicture(targetId);
        const faceDataBase64 = buffer.toString('base64');
        return res.json({
            success: true,
            data: {
                faceData: faceDataBase64,
                immediate: true
            }
        });
    }
    catch (error) {
        console.error(`[RemoteCapture] ERROR: ${error.message}`);
        res.status(500).json({ error: "Falha na captura HikCentral. " + error.message });
    }
});
/**
 * GET /api/hikcentral/person-properties
 * Retorna os campos customizados do cadastro de pessoas no HikCentral
 */
router.get('/person-properties', async (req, res) => {
    try {
        const result = await HikCentralService_1.HikCentralService.getCustomFields();
        return res.json(result.data || []);
    }
    catch (error) {
        console.error(`[PersonProperties] ERROR: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/hikcentral/person-photo/:personId
 * Retorna a imagem binária da face de uma pessoa
 */
router.get('/person-photo/:personId', async (req, res) => {
    try {
        const { personId } = req.params;
        const picUri = req.query.picUri;
        const photo = await HikCentralService_1.HikCentralService.getPersonPhoto(personId, picUri);
        if (!photo)
            return res.status(404).json({ error: 'Photo not found' });
        res.set('Content-Type', photo.contentType);
        return res.send(photo.buffer);
    }
    catch (error) {
        console.error(`[PersonPhoto] ERROR: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/hikcentral/sync/force
 * Força a sincronização global de dados (Pessoas, Níveis, Dispositivos)
 */
router.post('/sync/force', async (req, res) => {
    try {
        const result = await HikCentralSyncService_1.HikCentralSyncService.syncAll();
        return res.json(result);
    }
    catch (error) {
        console.error(`[SyncForce] ERROR: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/hikcentral/register
 * Cadastro centralizado de pessoas no HikCentral com biometria facial.
 * Suporta: resident, employee, visitor, service_provider.
 * Fluxo: criação atômica (face embutida) → atribuição de níveis de acesso → persistência local.
 */
router.post('/register', registrationController.register);
/**
 * POST /api/hikcentral/events/subscribe
 * Subscreve o backend para receber eventos de acesso do HikCentral via webhook push.
 */
router.post('/events/subscribe', registrationController.subscribeToEvents);
exports.default = router;
