import { FastifyInstance } from 'fastify';
import { getDashboardOverview, getDeploymentReadiness } from '../performance/dashboardOverview';
import { getRuntimeHealth } from '../bootstrap/state';

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard/overview', async () => {
    return getDashboardOverview();
  });

  app.get('/api/dashboard/deployment', async () => {
    return getDeploymentReadiness();
  });

  app.get('/api/dashboard/health', async () => {
    const overview = await getDashboardOverview();
    const runtime = getRuntimeHealth();
    return {
      generatedAt: overview.generatedAt,
      runtime,
      systemHealth: overview.systemHealth,
      telegramActivity: {
        deliveryHealth: overview.telegramActivity.deliveryHealth,
        errors: overview.telegramActivity.errors,
      },
    };
  });
}
