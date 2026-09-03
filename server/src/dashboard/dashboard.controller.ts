import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService, type SubscriptionStats } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('subscription-stats')
  getSubscriptionStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ): Promise<SubscriptionStats> {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    return this.dashboardService.getSubscriptionStats(formatDate(start), formatDate(end));
  }
}
