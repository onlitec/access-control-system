// Shared DTOs for the provider abstraction layer

export interface PersonInput {
  firstName: string;
  lastName: string;
  orgCode: string;
  phone?: string;
  email?: string;
  cpf?: string;
  certificateNo?: string;
  certificateType?: number;
  faceBase64?: string;
  // Nice Guarita MG3000 specific
  cardSerial?: string;       // hex serial of card/tag, e.g. "A1B2C3"
  txSerial?: string;         // hex serial of remote control (TX)
  unit?: number;             // unit number (0-9999)
  block?: number;            // block index (0=A, 1=B, ...)
  vehiclePlate?: string;     // vehicle plate max 7 chars
  receiverBitmask?: number;  // which receivers can access (bitmask)
}

export interface ExternalPerson {
  externalId: string;
  firstName: string;
  lastName: string;
  orgCode: string;
  phone?: string;
  email?: string;
}

export interface PersonFilter {
  orgCode?: string;
  name?: string;
  pageNo?: number;
  pageSize?: number;
}

export interface VisitorInput {
  name: string;
  certificateNo: string;
  visitStartTime: string;
  visitEndTime: string;
  plateNo?: string;
  faceBase64?: string;
  // Nice Guarita
  fullName?: string;
  cardSerial?: string;
}

export interface ExternalVisitor {
  externalId: string;
  name: string;
  certificateNo?: string;
  phone?: string;
  plateNo?: string;
  visitStartTime?: string;
  visitEndTime?: string;
  status: number; // 0=scheduled, 1=finished, 2=active
}

export interface AccessLogParams {
  startTime: string;
  endTime: string;
  pageNo?: number;
  pageSize?: number;
}

export interface AccessLogEntry {
  personName: string;
  eventTime: string;
  deviceName: string;
  doorName: string;
  eventType: string;
  picUri?: string;
}

export interface Device {
  id: string;
  name: string;
  location?: string;
  type?: string;
}

export interface Org {
  id: string;
  name: string;
  parentId?: string;
}

export interface AccessLevel {
  id: string;
  name: string;
}
