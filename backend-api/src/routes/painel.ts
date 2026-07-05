import { Router } from 'express';
import { VisitorsController } from '../controllers/VisitorsController';
import { ProvidersController } from '../controllers/ProvidersController';
import { DashboardController } from '../controllers/DashboardController';

const router = Router();
const visitorsController = new VisitorsController();
const providersController = new ProvidersController();
const dashboardController = new DashboardController();

// We'll apply authMiddleware in index.ts when using this router
router.get('/dashboard/stats', dashboardController.getStats);
router.get('/dashboard/alerts', dashboardController.getAlerts);
router.get('/dashboard/today-accesses', dashboardController.getTodayAccesses);
router.get('/dashboard/present-people', dashboardController.getPresentPeople);
router.get('/dashboard/present-visitors', dashboardController.getPresentVisitors);
router.get('/visitors', visitorsController.getVisitors);
router.get('/providers', providersController.getProviders);

export default router;
