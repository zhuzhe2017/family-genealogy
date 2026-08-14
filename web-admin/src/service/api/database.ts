import { request } from '../request';

export interface DatabaseStatusResponse {
  initialized: boolean;
  connected: boolean;
  timestamp: string;
  poolInfo: {
    totalConnections: number | null;
    freeConnections: number | null;
    acquiringConnections: number | null;
    waitingClients: number | null;
  } | null;
  error: string | null;
}

export interface DatabaseTestResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

/** 获取数据库连接状态 */
export function fetchDatabaseStatus() {
  return request<DatabaseStatusResponse>({ url: '/database/status' });
}

/** 测试数据库连接 */
export function testDatabaseConnection() {
  return request<DatabaseTestResponse>({ url: '/database/test', method: 'post' });
}
