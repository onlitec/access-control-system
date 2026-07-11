/** Remove tudo que não for dígito. */
export function cleanCpf(cpf: string): string {
  return (cpf || "").replace(/\D/g, "");
}

/** Formata como 000.000.000-00 enquanto o usuário digita. */
export function formatCpf(value: string): string {
  const digits = cleanCpf(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/** Validação de dígito verificador (mod-11) — espelho de backend-api/src/utils/cpf.utils.ts */
export function isValidCpf(cpf: string): boolean {
  const digits = cleanCpf(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (base: string): number => {
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
