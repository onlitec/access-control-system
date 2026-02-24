import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { HikCentralService } from '../services/HikCentralService';
import { config } from '../config/unifiedConfig';

export class VisitorsController extends BaseController {
    public getVisitors = async (req: Request, res: Response) => {
        try {
            const groupName = config.HIKCENTRAL.VISITOR_GROUP_NAME_VISITANTES;
            const visitors = await HikCentralService.fetchVisitorsWithStatus(groupName);

            // Filtering for active/finished if needed, but for /painel/visitors we might want both or active
            // The requirement just said "Filtrar por visitorGroupID da pasta 'VISITANTES'"

            const serialized = visitors.map(v => ({
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
            console.error('[VisitorsController] Error fetching visitors:', error);
            return this.error(res, error.message);
        }
    };
}
