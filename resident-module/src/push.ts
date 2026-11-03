import webpush from 'web-push';
import { config } from './config';
import { prisma } from './db';

let configured = false;

export function pushEnabled(): boolean {
    return Boolean(config.vapid.publicKey && config.vapid.privateKey);
}

function setup() {
    if (configured) return;
    webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
    configured = true;
}

export interface SubscriptionInput {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
}

export async function saveSubscription(residentId: string, sub: SubscriptionInput, userAgent?: string): Promise<void> {
    const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : '';
    const p256dh = typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
    const auth = typeof sub.keys?.auth === 'string' ? sub.keys.auth : '';
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
        throw new Error('Inscrição inválida.');
    }
    const ua = userAgent?.slice(0, 200) || null;
    await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: { residentId, endpoint, p256dh, auth, userAgent: ua },
        update: { residentId, p256dh, auth, userAgent: ua },
    });
}

export async function removeSubscription(residentId: string, endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { residentId, endpoint } });
}

/** Envia push a todos os aparelhos dos moradores. Inscrições expiradas (404/410) são apagadas. */
export async function sendPush(residentIds: string[], payload: { title: string; body: string; url?: string }): Promise<number> {
    if (!pushEnabled() || residentIds.length === 0) return 0;
    setup();
    const subs = await prisma.pushSubscription.findMany({ where: { residentId: { in: residentIds } } });
    let sent = 0;
    await Promise.all(
        subs.map(async (s) => {
            try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
                sent++;
            } catch (err: any) {
                if (err?.statusCode === 404 || err?.statusCode === 410) {
                    await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
                } else {
                    console.error('[push] falha:', err?.statusCode || err?.message);
                }
            }
        }),
    );
    return sent;
}
