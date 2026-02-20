export interface Person {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    orgIndexCode: string;
    hikPersonId?: string;
}

export interface Visitor {
    id: string;
    name: string;
    certificateType?: string;
    certificateNo?: string;
    phone?: string;
    plateNo?: string;
    visitStartTime: string;
    visitEndTime: string;
    hikVisitorId?: string;
}

export interface AccessEvent {
    id: string;
    personName: string;
    eventTime: string;
    deviceName: string;
    doorName: string;
    eventType: string;
    picUri?: string;
}

export interface HikcentralConfig {
    apiUrl: string;
    appKey: string;
    appSecret: string;
    syncEnabled: boolean;
}
