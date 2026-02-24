import { Router } from 'express';
import { AdminEntitiesController } from '../controllers/AdminEntitiesController';
import { EntityMappingsController } from '../controllers/EntityMappingsController';

const router = Router();

const adminEntitiesController = new AdminEntitiesController();
const entityMappingsController = new EntityMappingsController();

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

export default router;
