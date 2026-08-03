"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AdminEntitiesController_1 = require("../controllers/AdminEntitiesController");
const EntityMappingsController_1 = require("../controllers/EntityMappingsController");
const TerminalController_1 = require("../controllers/TerminalController");
const router = (0, express_1.Router)();
const adminEntitiesController = new AdminEntitiesController_1.AdminEntitiesController();
const entityMappingsController = new EntityMappingsController_1.EntityMappingsController();
const terminalController = new TerminalController_1.TerminalController();
// ============ Entidades HikCentral (read-only, com cache) ============
// Departamentos/Organizações
router.get('/entities/organizations', adminEntitiesController.getOrganizations);
// Áreas Físicas (Regions)
router.get('/entities/areas', adminEntitiesController.getAreas);
// Níveis de Acesso (Privilege Groups)
router.get('/entities/access-levels', adminEntitiesController.getAccessLevels);
// Campos Customizados (Cargos, Posições, etc)
router.get('/entities/custom-fields', adminEntitiesController.getCustomFields);
// Pisos/Andares
router.get('/entities/floors', adminEntitiesController.getFloors);
// Grupos de Visitantes
router.get('/entities/visitor-groups', adminEntitiesController.getVisitorGroups);
// Cache Management
router.post('/cache/refresh', adminEntitiesController.refreshCache);
// ============ Entity Mappings (CRUD) ============
// Listar mapeamentos (com filtros opcionais)
router.get('/mappings', entityMappingsController.list);
// Listar páginas que têm mapeamentos
router.get('/mappings/pages', entityMappingsController.listPages);
// Buscar mapeamento específico
router.get('/mappings/:id', entityMappingsController.get);
// Criar mapeamento
router.post('/mappings', entityMappingsController.create);
// Criar múltiplos mapeamentos
router.post('/mappings/batch', entityMappingsController.batchCreate);
// Atualizar mapeamento
router.put('/mappings/:id', entityMappingsController.update);
// Remover mapeamento
router.delete('/mappings/:id', entityMappingsController.delete);
// ============ Terminais & Captura ============
router.get('/terminals', terminalController.listTerminals);
router.get('/terminals/capture/:id', terminalController.capturePhoto);
exports.default = router;
