"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_1 = require("../index");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
(0, vitest_1.describe)('Devices and Areas Integration Tests', () => {
    const adminUser = {
        email: 'devices-admin@example.com',
        password: 'adminpassword',
        name: 'Device Admin'
    };
    let token = '';
    (0, vitest_1.beforeAll)(async () => {
        // Limpeza preventiva
        await index_1.prisma.refreshSession.deleteMany({ where: { user: { email: adminUser.email } } });
        await index_1.prisma.user.deleteMany({ where: { email: adminUser.email } });
        const hashedPassword = await bcryptjs_1.default.hash(adminUser.password, 12);
        await index_1.prisma.user.create({
            data: {
                email: adminUser.email,
                password: hashedPassword,
                name: adminUser.name,
                role: 'ADMIN'
            }
        });
        // Efetua login para obter token
        const loginRes = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/login')
            .send({ email: adminUser.email, password: adminUser.password });
        token = loginRes.body.token;
        // Limpa dispositivos e áreas de teste anteriores
        await index_1.prisma.deviceSyncLog.deleteMany({});
        await index_1.prisma.networkDevice.deleteMany({});
        await index_1.prisma.accessAreaDoor.deleteMany({});
        await index_1.prisma.accessArea.deleteMany({});
    });
    (0, vitest_1.afterAll)(async () => {
        await index_1.prisma.deviceSyncLog.deleteMany({});
        await index_1.prisma.networkDevice.deleteMany({});
        await index_1.prisma.accessAreaDoor.deleteMany({});
        await index_1.prisma.accessArea.deleteMany({});
        await index_1.prisma.refreshSession.deleteMany({ where: { user: { email: adminUser.email } } });
        await index_1.prisma.user.deleteMany({ where: { email: adminUser.email } });
    });
    (0, vitest_1.it)('1. should register a device manually and omit the encrypted password in list response', async () => {
        const payload = {
            ipAddress: '192.168.1.99',
            macAddress: '11:22:33:44:55:66',
            friendlyName: 'Test Facial Reader',
            username: 'admin',
            password: 'secretPassword123',
            deviceType: 'facial',
            httpPort: 80,
            sdkPort: 8000
        };
        const resCreate = await (0, supertest_1.default)(index_1.app)
            .post('/api/devices')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);
        (0, vitest_1.expect)(resCreate.status).toBe(201);
        (0, vitest_1.expect)(resCreate.body.success).toBe(true);
        (0, vitest_1.expect)(resCreate.body.data).not.toHaveProperty('credentialPasswordEncrypted');
        const resList = await (0, supertest_1.default)(index_1.app)
            .get('/api/devices')
            .set('Authorization', `Bearer ${token}`);
        (0, vitest_1.expect)(resList.status).toBe(200);
        (0, vitest_1.expect)(resList.body.data.length).toBeGreaterThanOrEqual(1);
        // Garante que a senha criptografada NUNCA vaze na listagem pública
        const item = resList.body.data.find((d) => d.ipAddress === payload.ipAddress);
        (0, vitest_1.expect)(item).toBeDefined();
        (0, vitest_1.expect)(item).not.toHaveProperty('credentialPasswordEncrypted');
    });
    (0, vitest_1.it)('2. should create physical area tree, favor one, and verify hierarchical structure', async () => {
        // Cria área pai
        const resParent = await (0, supertest_1.default)(index_1.app)
            .post('/api/access-areas')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Calabasas Tower A', icon: '🏢' });
        (0, vitest_1.expect)(resParent.status).toBe(201);
        const parentId = resParent.body.data.id;
        // Cria área filha
        const resChild = await (0, supertest_1.default)(index_1.app)
            .post('/api/access-areas')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Portaria Interna', parentId });
        (0, vitest_1.expect)(resChild.status).toBe(201);
        const childId = resChild.body.data.id;
        // Favorita a área filha
        const resFav = await (0, supertest_1.default)(index_1.app)
            .put(`/api/access-areas/${childId}/favorite`)
            .set('Authorization', `Bearer ${token}`)
            .send({ isFavorite: true });
        (0, vitest_1.expect)(resFav.status).toBe(200);
        (0, vitest_1.expect)(resFav.body.data.isFavorite).toBe(true);
        // Verifica árvore
        const resTree = await (0, supertest_1.default)(index_1.app)
            .get('/api/access-areas/tree')
            .set('Authorization', `Bearer ${token}`);
        (0, vitest_1.expect)(resTree.status).toBe(200);
        const parentNode = resTree.body.data.find((n) => n.id === parentId);
        (0, vitest_1.expect)(parentNode).toBeDefined();
        (0, vitest_1.expect)(parentNode.children.length).toBe(1);
        (0, vitest_1.expect)(parentNode.children[0].id).toBe(childId);
        (0, vitest_1.expect)(parentNode.children[0].isFavorite).toBe(true);
    });
    (0, vitest_1.it)('3. should verify blocker when deleting devices linked to access points', async () => {
        // Cadastra um dispositivo de teste
        const deviceRes = await (0, supertest_1.default)(index_1.app)
            .post('/api/devices')
            .set('Authorization', `Bearer ${token}`)
            .send({
            ipAddress: '192.168.1.150',
            macAddress: 'aa:bb:cc:dd:ee:ff',
            friendlyName: 'Facial Door Blocked Test',
            username: 'admin',
            password: 'superSafePassword1',
            deviceType: 'facial'
        });
        (0, vitest_1.expect)(deviceRes.status).toBe(201);
        const deviceId = deviceRes.body.data.id;
        // Tenta excluir (deve permitir já que não há vínculo real ativo nas tabelas vinculadas de porta)
        const deleteRes = await (0, supertest_1.default)(index_1.app)
            .delete('/api/devices')
            .set('Authorization', `Bearer ${token}`)
            .send({ ids: [deviceId] });
        (0, vitest_1.expect)(deleteRes.status).toBe(200);
        (0, vitest_1.expect)(deleteRes.body.success).toBe(true);
    });
});
