"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_1 = require("../index");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
(0, vitest_1.describe)('Auth Integration Tests', () => {
    const testUser = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
    };
    (0, vitest_1.beforeAll)(async () => {
        // Cleanup and create test user
        await index_1.prisma.refreshSession.deleteMany({ where: { user: { email: testUser.email } } });
        await index_1.prisma.user.deleteMany({ where: { email: testUser.email } });
        const hashedPassword = await bcryptjs_1.default.hash(testUser.password, 12);
        await index_1.prisma.user.create({
            data: {
                email: testUser.email,
                password: hashedPassword,
                name: testUser.name,
                role: 'ADMIN'
            }
        });
    });
    (0, vitest_1.afterAll)(async () => {
        await index_1.prisma.refreshSession.deleteMany({ where: { user: { email: testUser.email } } });
        await index_1.prisma.user.deleteMany({ where: { email: testUser.email } });
    });
    (0, vitest_1.it)('1. should return 200 OK for /api/health', async () => {
        const response = await (0, supertest_1.default)(index_1.app).get('/api/health');
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body).toHaveProperty('status', 'ok');
    });
    let accessToken = '';
    let refreshToken = '';
    (0, vitest_1.it)('2. should login successfully with valid credentials', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/login')
            .send({ email: testUser.email, password: testUser.password });
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body).toHaveProperty('token');
        (0, vitest_1.expect)(response.body).toHaveProperty('refreshToken');
        (0, vitest_1.expect)(response.body.user.email).toBe(testUser.email);
        // Check if cookies are set
        const cookies = response.get('Set-Cookie') || [];
        (0, vitest_1.expect)(cookies.some(c => c.includes('auth_token'))).toBe(true);
        (0, vitest_1.expect)(cookies.some(c => c.includes('auth_refresh_token'))).toBe(true);
        accessToken = response.body.token;
        refreshToken = response.body.refreshToken;
    });
    (0, vitest_1.it)('3. should fail login with invalid password', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/login')
            .send({ email: testUser.email, password: 'wrongpassword' });
        (0, vitest_1.expect)(response.status).toBe(401);
    });
    (0, vitest_1.it)('4. should fail login with non-existent user', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/login')
            .send({ email: 'nonexistent@example.com', password: 'password123' });
        (0, vitest_1.expect)(response.status).toBe(401);
    });
    (0, vitest_1.it)('5. should get current user profile with token in header', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${accessToken}`);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body.email).toBe(testUser.email);
    });
    (0, vitest_1.it)('6. should get current user profile with token in cookie', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .get('/api/auth/me')
            .set('Cookie', [`auth_token=${accessToken}`]);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body.email).toBe(testUser.email);
    });
    (0, vitest_1.it)('7. should fail /me without token', async () => {
        const response = await (0, supertest_1.default)(index_1.app).get('/api/auth/me');
        (0, vitest_1.expect)(response.status).toBe(401);
    });
    (0, vitest_1.it)('8. should refresh token successfully', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/refresh')
            .send({ refreshToken });
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body).toHaveProperty('token');
        const cookies = response.get('Set-Cookie') || [];
        (0, vitest_1.expect)(cookies.some(c => c.includes('auth_token'))).toBe(true);
        accessToken = response.body.token;
    });
    (0, vitest_1.it)('9. should fail refresh with invalid token', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/refresh')
            .send({ refreshToken: 'invalid-token' });
        (0, vitest_1.expect)(response.status).toBe(401);
    });
    (0, vitest_1.it)('10. should logout and clear cookies', async () => {
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/logout')
            .send({ refreshToken });
        (0, vitest_1.expect)(response.status).toBe(200);
        const cookies = response.get('Set-Cookie') || [];
        // res.clearCookie sets expiry to the past
        (0, vitest_1.expect)(cookies.some(c => c.includes('auth_token=;'))).toBe(true);
        (0, vitest_1.expect)(cookies.some(c => c.includes('auth_refresh_token=;'))).toBe(true);
    });
});
