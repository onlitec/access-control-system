import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { HikCentralService } from '../services/HikCentralService';
import { config } from '../config/unifiedConfig';

export class ProvidersController extends BaseController {
    public getProviders = async (req: Request, res: Response) => {
        try {
            const groupName = config.HIKCENTRAL.VISITOR_GROUP_NAME_PRESTADORES;
            const providers = await HikCentralService.fetchVisitorsWithStatus(groupName);

            const serialized = providers.map(v => ({
                id: v.appointmentId || v.visitorId,
                visitor_id: v.visitorId,
                visitor_name: v.visitorName,
                visitor_group_name: v.visitorGroupName,
                plate_no: v.plateNo || '',
                certificate_no: v.certificateNo || '',
                phone_num: v.phoneNum || '',
                appoint_status: v.appointStatus,
                appoint_status_text: v.appointStatusText,
                appoint_start_time: v.appointStartTime,
                appoint_end_time: v.appointEndTime,
                visit_start_time: v.visitStartTime || null,
                visit_end_time: v.visitEndTime || null,
            }));

            return this.success(res, serialized);
        } catch (error: any) {
            console.error('[ProvidersController] Error fetching providers:', error);
            return this.error(res, error.message);
        }
    };
}
