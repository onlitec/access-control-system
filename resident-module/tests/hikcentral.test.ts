import { describe, expect, it } from 'vitest';
import { buildStringToSign, sign } from '../src/hikcentral/client';
import { normalizePerson } from '../src/hikcentral/residents';
import { isValidCpf, toE164Br } from '../src/utils/cpf';

describe('assinatura da OpenAPI', () => {
    const headers = {
        Accept: '*/*',
        'Content-MD5': 'abc==',
        'Content-Type': 'application/json',
        'X-Ca-Key': '123',
        'X-Ca-Timestamp': '1479956865000',
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
    };

    it('omite a linha Date quando o cabeçalho não existe', () => {
        expect(buildStringToSign('post', headers, '/artemis/api/x')).toBe(
            'POST\n*/*\nabc==\napplication/json\nx-ca-key:123\nx-ca-timestamp:1479956865000\n/artemis/api/x',
        );
    });

    it('gera HMAC-SHA256 em Base64', () => {
        expect(sign('texto', 'segredo')).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    });
});

describe('moradores', () => {
    it('lê CPF, torres e contato dos campos personalizados', () => {
        const r = normalizePerson({
            personId: '10',
            personName: 'Maria Souza',
            orgIndexCode: '7',
            email: ' maria@exemplo.com ',
            phoneNo: '(11) 98888-7777',
            customFieldList: [
                { customFiledName: 'CPF', customFieldValue: '529.982.247-25' },
                { customFieldName: 'TORRE-1', customFieldValue: '1' },
                { customFieldName: 'TORRE-2', customFieldValue: '' },
            ],
        });
        expect(r).toMatchObject({ hikPersonId: '10', cpf: '52998224725', email: 'maria@exemplo.com', phoneE164: '+5511988887777', towers: ['TORRE-1'] });
    });

    it('descarta CPF inválido', () => {
        const r = normalizePerson({ personId: '11', personName: 'X', customFieldList: [{ customFieldName: 'CPF', customFieldValue: '111.111.111-11' }] });
        expect(r.cpf).toBeNull();
    });
});

describe('utilitários', () => {
    it('valida CPF', () => {
        expect(isValidCpf('529.982.247-25')).toBe(true);
        expect(isValidCpf('529.982.247-24')).toBe(false);
    });
    it('normaliza telefone brasileiro', () => {
        expect(toE164Br('+55 (11) 98888-7777')).toBe('+5511988887777');
        expect(toE164Br('1234')).toBeNull();
    });
});
