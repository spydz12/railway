"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDashboardRoutes = registerDashboardRoutes;
const dashboardOverview_1 = require("../performance/dashboardOverview");
const state_1 = require("../bootstrap/state");
async function registerDashboardRoutes(app) {
    app.get('/api/dashboard/overview', async () => {
        return (0, dashboardOverview_1.getDashboardOverview)();
    });
    app.get('/api/dashboard/deployment', async () => {
        return (0, dashboardOverview_1.getDeploymentReadiness)();
    });
    app.get('/api/dashboard/health', async () => {
        const overview = await (0, dashboardOverview_1.getDashboardOverview)();
        const runtime = (0, state_1.getRuntimeHealth)();
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
