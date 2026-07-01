import { Request, Response } from 'express';
import {
  NotificationType,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from '../services/notificationsService';

/**
 * Thin HTTP layer over notificationsService. All routes are behind
 * `authenticate`, so req.user is always present.
 */

/** GET /api/notifications?type=follow|comment&limit=50 */
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawType = String(req.query.type ?? '');
    const type: NotificationType | undefined =
      rawType === 'follow' || rawType === 'comment' ? rawType : undefined;
    const limit = Number(req.query.limit);
    const notifications = await listNotifications(req.user!.sub, {
      type,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.status(200).json({ notifications });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/** GET /api/notifications/unread-count */
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await unreadCount(req.user!.sub);
    res.status(200).json({ count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/** POST /api/notifications/:id/read */
export const readOne = async (req: Request, res: Response): Promise<void> => {
  try {
    await markRead(req.user!.sub, Number(req.params.id));
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/** POST /api/notifications/read-all */
export const readAll = async (req: Request, res: Response): Promise<void> => {
  try {
    await markAllRead(req.user!.sub);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
