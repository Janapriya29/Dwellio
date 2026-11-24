import { Request, Response } from 'express';
import { ApiResponse, QueueSystemHealthData } from '@dwellio/shared';
import { queueService } from '../services/queueService';
import { redisService } from '../services/redisService';

/**
 * GET /api/admin/system/queues
 * Retrieve queue health, job counts, and worker status for platform administrators
 */
export const getAdminQueueMetrics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [metricsList, redisHealth] = await Promise.all([
      queueService.getAllQueueMetrics(),
      redisService.checkRedisHealth(),
    ]);

    const queues: QueueSystemHealthData['queues'] = {};
    for (const m of metricsList) {
      queues[m.name] = {
        name: m.name,
        waiting: m.waiting,
        active: m.active,
        completed: m.completed,
        failed: m.failed,
        delayed: m.delayed,
        paused: m.paused,
      };
    }

    const response: ApiResponse<QueueSystemHealthData> = {
      success: true,
      message: 'Queue operational metrics retrieved successfully',
      data: {
        redisStatus: redisHealth.status === 'healthy' ? (redisHealth.mode === 'mock' ? 'mock' : 'connected') : 'disconnected',
        queues,
        activeWorkers: 1, // Worker supervisor instance count
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to retrieve queue operational metrics',
    });
  }
};
