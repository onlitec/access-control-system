import { describe, it, expect } from 'vitest';
import {
    buildVisitorAppointmentPayload,
    formatHikDateTime,
    pickVisitorAccessLevelForTower,
    splitVisitorName,
} from '../src/hikcentral/visitorAppointment';

describe('formatHikDateTime', () => {
    it('formata no fuso informado, sem milissegundos nem "Z"', () => {
        expect(formatHikDateTime('2026-11-05T17:30:15.123Z', '-03:00')).toBe('2026-11-05T14:30:15-03:00');
    });

    it('rejeita data inválida', () => {
        expect(() => formatHikDateTime('não é data', '-03:00')).toThrow();
    });
});

describe('splitVisitorName', () => {
    it('usa a última palavra como sobrenome', () => {
        expect(splitVisitorName('Maria da Silva')).toEqual({ givenName: 'Maria da', familyName: 'Silva' });
    });
});

describe('buildVisitorAppointmentPayload', () => {
    const base = {
        givenName: 'João',
        familyName: 'Souza',
        visitStartTime: '2026-11-05T12:00:00Z',
        visitEndTime: '2026-11-05T22:00:00Z',
    };

    it('monta o payload V2 com face, documento, placa e nível de acesso (seção 5.7.5)', () => {
        const payload: any = buildVisitorAppointmentPayload({
            ...base,
            receptionistId: '42',
            accessLevelIds: ['7'],
            faceBase64: 'data:image/jpeg;base64,/9j/FACE',
            documentPhotoBase64: '/9j/DOC',
            plateNo: 'abc-1d23',
            phoneNo: '(11) 99999-0000',
            certificateNo: '12.345.678-9',
        });

        expect(payload.receptionistId).toBe('42');
        expect(payload.visitReasonType).toBe(2);
        expect(payload.appointStartTime).toBe('2026-11-05T09:00:00-03:00');
        expect(payload.accessInfo).toEqual({ accessLevelList: [{ accessLevel: { id: 7, baseInfo: {} } }] });

        const info = payload.visitorInfoList[0].VisitorInfo;
        expect(info.visitorGivenName).toBe('João');
        expect(info.visitorFamilyName).toBe('Souza');
        expect(info.faces).toEqual([{ faceData: '/9j/FACE' }]);
        expect(info.identiPhoto).toEqual([{ identiPhoto: '/9j/DOC' }]);
        expect(info.plateNo).toBe('ABC1D23');
        expect(info.phoneNo).toBe('11999990000');
        expect(info.certificateType).toBe(111);
        expect(info.watchListInfo).toEqual([]);
    });

    it('marca prestador como "outros" com descrição', () => {
        const payload: any = buildVisitorAppointmentPayload({ ...base, visitorType: 'SERVICE_PROVIDER' });
        expect(payload.visitReasonType).toBe(4);
        expect(payload.visitReasonDetail).toBe('Prestador de serviço');
    });

    it('omite campos vazios e remove caracteres proibidos', () => {
        const payload: any = buildVisitorAppointmentPayload({ ...base, givenName: 'Ana "Bia"', companyName: '' });
        const info = payload.visitorInfoList[0].VisitorInfo;
        expect(info.visitorGivenName).toBe('Ana Bia');
        expect(info).not.toHaveProperty('companyName');
        expect(info).not.toHaveProperty('faces');
        expect(payload).not.toHaveProperty('accessInfo');
        expect(payload).not.toHaveProperty('receptionistId');
    });

    it('exige nome', () => {
        expect(() => buildVisitorAppointmentPayload({ ...base, givenName: '', familyName: '', visitorName: '' })).toThrow();
    });
});

describe('pickVisitorAccessLevelForTower', () => {
    const groups = [
        { privilegeGroupId: '1', privilegeGroupName: 'Visitantes Padrão', isDefault: 1 },
        { privilegeGroupId: '10', privilegeGroupName: 'Visitantes Torre-10' },
        { privilegeGroupId: '11', privilegeGroupName: 'Visitantes Torre 1' },
        { privilegeGroupId: '20', privilegeGroupName: 'Torre-2' },
    ];

    it('prefere nome igual ao da torre', () => {
        expect(pickVisitorAccessLevelForTower(groups, 'Torre 2')).toBe('20');
    });

    it('casa nome contendo a torre sem confundir Torre 1 com Torre 10', () => {
        expect(pickVisitorAccessLevelForTower(groups, 'Torre-1')).toBe('11');
    });

    it('usa o nível padrão quando nada casa', () => {
        expect(pickVisitorAccessLevelForTower(groups, 'Torre 9')).toBe('1');
        expect(pickVisitorAccessLevelForTower(groups, null)).toBe('1');
    });

    it('retorna undefined sem padrão e sem correspondência', () => {
        expect(pickVisitorAccessLevelForTower([{ privilegeGroupId: '5', privilegeGroupName: 'Outro' }], 'Torre 3')).toBeUndefined();
    });
});
