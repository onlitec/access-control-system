import nodemailer from 'nodemailer';
import { config } from '../config';
import { maskEmail, maskPhone } from '../utils/cpf';

export type Channel = 'whatsapp' | 'email';

export interface Destination {
    channel: Channel;
    /** E.164 para WhatsApp, endereço para e-mail */
    address: string;
}

export const loginMessage = (code: string) =>
    `Seu código de acesso ao app do morador é ${code}. Vale por 10 minutos. Não compartilhe com ninguém.`;

export function pickDestination(
    phoneE164: string | null,
    email: string | null,
    preferred?: Channel,
): Destination | null {
    if (preferred === 'email' && email) return { channel: 'email', address: email };
    if (preferred === 'whatsapp' && phoneE164) return { channel: 'whatsapp', address: phoneE164 };
    if (phoneE164) return { channel: 'whatsapp', address: phoneE164 };
    if (email) return { channel: 'email', address: email };
    return null;
}

async function sendWhatsapp(to: string, body: string): Promise<void> {
    const { accountSid, authToken, whatsappFrom } = config.twilio;
    if (!accountSid || !authToken || !whatsappFrom) throw new Error('Twilio não configurado');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: whatsappFrom, To: `whatsapp:${to}`, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio respondeu HTTP ${res.status}`);
}

async function sendEmail(to: string, body: string, subject: string): Promise<void> {
    const { host, port, user, pass, from } = config.smtp;
    if (!host || !from) throw new Error('SMTP não configurado');
    const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
    });
    await transport.sendMail({ from, to, subject, text: body });
}

export async function sendText(dest: Destination, body: string, subject = 'Aviso do app do morador'): Promise<void> {
    if (config.notifyMode === 'console') {
        const masked = dest.channel === 'whatsapp' ? maskPhone(dest.address) : maskEmail(dest.address);
        console.log(`[notify:console] ${dest.channel} ${masked} -> ${body}`);
        return;
    }
    if (dest.channel === 'whatsapp') await sendWhatsapp(dest.address, body);
    else await sendEmail(dest.address, body, subject);
}

export const sendLoginCode = (dest: Destination, code: string) => sendText(dest, loginMessage(code), 'Seu código de acesso');
