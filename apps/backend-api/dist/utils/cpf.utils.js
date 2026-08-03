"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanCpf = cleanCpf;
exports.isValidCpf = isValidCpf;
exports.cpfEquals = cpfEquals;
/** Remove tudo que não for dígito. */
function cleanCpf(cpf) {
    return (cpf || '').replace(/\D/g, '');
}
/**
 * Valida CPF pelo algoritmo padrão de dígitos verificadores (mod-11).
 * Rejeita CPFs com todos os dígitos iguais (000.000.000-00, 111.111.111-11, etc),
 * que passam matematicamente no cálculo mas nunca são válidos na prática.
 */
function isValidCpf(cpf) {
    const digits = cleanCpf(cpf);
    if (digits.length !== 11)
        return false;
    if (/^(\d)\1{10}$/.test(digits))
        return false;
    const calcCheckDigit = (base) => {
        let sum = 0;
        let weight = base.length + 1;
        for (const ch of base) {
            sum += Number(ch) * weight;
            weight -= 1;
        }
        const rest = sum % 11;
        return rest < 2 ? 0 : 11 - rest;
    };
    const d1 = calcCheckDigit(digits.slice(0, 9));
    const d2 = calcCheckDigit(digits.slice(0, 9) + String(d1));
    return digits === digits.slice(0, 9) + String(d1) + String(d2);
}
/** Compara dois CPFs ignorando formatação (pontos/traço). */
function cpfEquals(a, b) {
    const cleanA = cleanCpf(a);
    const cleanB = cleanCpf(b);
    return cleanA.length > 0 && cleanA === cleanB;
}
