import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../index';
import bcrypt from 'bcryptjs';

describe('Auth Integration Tests', () => {
    const testUser = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
    };

    beforeAll(async () => {
        // Cleanup and create test user
        await prisma.refreshSession.deleteMany({ where: { user: { email: testUser.email } } });
        await prisma.user.deleteMany({ where: { email: testUser.email } });
        
        const hashedPassword = await bcrypt.hash(testUser.password, 12);
        await prisma.user.create({
            data: {
                email: testUser.email,
                password: hashedPassword,
                name: testUser.name,
                role: 'ADMIN'
            }
        });
    });

    afterAll(async () => {
        await prisma.refreshSession.deleteMany({ where: { user: { email: testUser.email } } });
        await prisma.user.deleteMany({ where: { email: testUser.email } });
    });

    it('1. should return 200 OK for /api/health', async () => {
        const response = await request(app).get('/api/health');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
    });

    let accessToken = '';
    let refreshToken = '';

    it('2. should login successfully with valid credentials', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: testUser.email, password: testUser.password });
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body.user.email).toBe(testUser.email);
        
        // Check if cookies are set
        const cookies = response.get('Set-Cookie') || [];
        expect(cookies.some(c => c.includes('auth_token'))).toBe(true);
        expect(cookies.some(c => c.includes('auth_refresh_token'))).toBe(true);
        
        accessToken = response.body.token;
        refreshToken = response.body.refreshToken;
    });

    it('3. should fail login with invalid password', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: testUser.email, password: 'wrongpassword' });
        
        expect(response.status).toBe(401);
    });

    it('4. should fail login with non-existent user', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nonexistent@example.com', password: 'password123' });
        
        expect(response.status).toBe(401);
    });

    it('5. should get current user profile with token in header', async () => {
        const response = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(response.status).toBe(200);
        expect(response.body.email).toBe(testUser.email);
    });

    it('6. should get current user profile with token in cookie', async () => {
        const response = await request(app)
            .get('/api/auth/me')
            .set('Cookie', [`auth_token=${accessToken}`]);
        
        expect(response.status).toBe(200);
        expect(response.body.email).toBe(testUser.email);
    });

    it('7. should fail /me without token', async () => {
        const response = await request(app).get('/api/auth/me');
        expect(response.status).toBe(401);
    });

    it('8. should refresh token successfully', async () => {
        const response = await request(app)
            .post('/api/auth/refresh')
            .send({ refreshToken });
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        
        const cookies = response.get('Set-Cookie') || [];
        expect(cookies.some(c => c.includes('auth_token'))).toBe(true);
        
        accessToken = response.body.token;
    });

    it('9. should fail refresh with invalid token', async () => {
        const response = await request(app)
            .post('/api/auth/refresh')
            .send({ refreshToken: 'invalid-token' });
        
        expect(response.status).toBe(401);
    });

    it('10. should logout and clear cookies', async () => {
        const response = await request(app)
            .post('/api/auth/logout')
            .send({ refreshToken });
        
        expect(response.status).toBe(200);
        
        const cookies = response.get('Set-Cookie') || [];
        // res.clearCookie sets expiry to the past
        expect(cookies.some(c => c.includes('auth_token=;'))).toBe(true);
        expect(cookies.some(c => c.includes('auth_refresh_token=;'))).toBe(true);
    });
});
