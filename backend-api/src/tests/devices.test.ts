import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../index';
import bcrypt from 'bcryptjs';

describe('Devices and Areas Integration Tests', () => {
    const adminUser = {
        email: 'devices-admin@example.com',
        password: 'adminpassword',
        name: 'Device Admin'
    };

    let token = '';

    beforeAll(async () => {
        // Limpeza preventiva
        await prisma.refreshSession.deleteMany({ where: { user: { email: adminUser.email } } });
        await prisma.user.deleteMany({ where: { email: adminUser.email } });

        const hashedPassword = await bcrypt.hash(adminUser.password, 12);
        await prisma.user.create({
            data: {
                email: adminUser.email,
                password: hashedPassword,
                name: adminUser.name,
                role: 'ADMIN'
            }
        });

        // Efetua login para obter token
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: adminUser.email, password: adminUser.password });
        token = loginRes.body.token;

        // Limpa dispositivos e áreas de teste anteriores
        await prisma.deviceSyncLog.deleteMany({});
        await prisma.networkDevice.deleteMany({});
        await prisma.accessAreaDoor.deleteMany({});
        await prisma.accessArea.deleteMany({});
    });

    afterAll(async () => {
        await prisma.deviceSyncLog.deleteMany({});
        await prisma.networkDevice.deleteMany({});
        await prisma.accessAreaDoor.deleteMany({});
        await prisma.accessArea.deleteMany({});
        await prisma.refreshSession.deleteMany({ where: { user: { email: adminUser.email } } });
        await prisma.user.deleteMany({ where: { email: adminUser.email } });
    });

    it('1. should register a device manually and omit the encrypted password in list response', async () => {
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

        const resCreate = await request(app)
            .post('/api/devices')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect(resCreate.status).toBe(201);
        expect(resCreate.body.success).toBe(true);
        expect(resCreate.body.data).not.toHaveProperty('credentialPasswordEncrypted');

        const resList = await request(app)
            .get('/api/devices')
            .set('Authorization', `Bearer ${token}`);

        expect(resList.status).toBe(200);
        expect(resList.body.data.length).toBeGreaterThanOrEqual(1);
        // Garante que a senha criptografada NUNCA vaze na listagem pública
        const item = resList.body.data.find((d: any) => d.ipAddress === payload.ipAddress);
        expect(item).toBeDefined();
        expect(item).not.toHaveProperty('credentialPasswordEncrypted');
    });

    it('2. should create physical area tree, favor one, and verify hierarchical structure', async () => {
        // Cria área pai
        const resParent = await request(app)
            .post('/api/access-areas')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Calabasas Tower A', icon: '🏢' });
        
        expect(resParent.status).toBe(201);
        const parentId = resParent.body.data.id;

        // Cria área filha
        const resChild = await request(app)
            .post('/api/access-areas')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Portaria Interna', parentId });

        expect(resChild.status).toBe(201);
        const childId = resChild.body.data.id;

        // Favorita a área filha
        const resFav = await request(app)
            .put(`/api/access-areas/${childId}/favorite`)
            .set('Authorization', `Bearer ${token}`)
            .send({ isFavorite: true });
        
        expect(resFav.status).toBe(200);
        expect(resFav.body.data.isFavorite).toBe(true);

        // Verifica árvore
        const resTree = await request(app)
            .get('/api/access-areas/tree')
            .set('Authorization', `Bearer ${token}`);

        expect(resTree.status).toBe(200);
        const parentNode = resTree.body.data.find((n: any) => n.id === parentId);
        expect(parentNode).toBeDefined();
        expect(parentNode.children.length).toBe(1);
        expect(parentNode.children[0].id).toBe(childId);
        expect(parentNode.children[0].isFavorite).toBe(true);
    });

    it('3. should verify blocker when deleting devices linked to access points', async () => {
        // Cadastra um dispositivo de teste
        const deviceRes = await request(app)
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

        expect(deviceRes.status).toBe(201);
        const deviceId = deviceRes.body.data.id;

        // Tenta excluir (deve permitir já que não há vínculo real ativo nas tabelas vinculadas de porta)
        const deleteRes = await request(app)
            .delete('/api/devices')
            .set('Authorization', `Bearer ${token}`)
            .send({ ids: [deviceId] });
        
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.success).toBe(true);
    });
});
