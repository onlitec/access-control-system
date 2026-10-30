export function onlyDigits(value: string | undefined | null): string {
    return (value || '').replace(/\D/g, '');
}

export function isValidCpf(value: string | undefined | null): boolean {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const digit = (len: number) => {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
        const rest = (sum * 10) % 11;
        return rest === 10 ? 0 : rest;
    };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** Telefone brasileiro em E.164 (+55...), ou null se não der para normalizar. */
export function toE164Br(value: string | undefined | null): string | null {
    let digits = onlyDigits(value);
    if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
    if (digits.length !== 10 && digits.length !== 11) return null;
    return `+55${digits}`;
}

export function maskPhone(e164: string): string {
    return `${e164.slice(0, 5)}*****${e164.slice(-2)}`;
}

export function maskEmail(email: string): string {
    const [user, domain] = email.split('@');
    if (!domain) return '***';
    return `${user.slice(0, 2)}***@${domain}`;
}
