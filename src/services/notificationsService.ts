/**
 * Notifications service.
 *
 * Framework-free core for the notification feed. Reads/marks a user's
 * notifications, and provides two emitters used by other slices:
 *   notifyFollow  — called when a follow is created (profiles controller)
 *   notifyComment — called when a comment is posted (comments controller)
 *
 * Emitters are best-effort: callers wrap them so a notification failure never
 * breaks the underlying action (the follow / the comment still succeeds).
 */
import { supabase } from '../config/supabase';

export type NotificationType = 'follow' | 'comment';

export interface Notification {
  id: number;
  type: NotificationType;
  actor_id: string | null;
  actor_name: string | null;
  meme_id: string | null;
  read: boolean;
  created_at: string;
}

const NOTIFICATION_COLUMNS = 'id, type, actor_id, actor_name, meme_id, read, created_at';

/** Resolve an actor's public display name (no email, for privacy). */
async function resolveActorName(actorId: string): Promise<string> {
  const { data } = await supabase
    .from('users')
    .select('username, display_name, full_name')
    .eq('id', actorId)
    .maybeSingle();
  if (!data) return 'Someone';
  return data.display_name || data.username || data.full_name || 'Someone';
}

/** List a user's notifications, newest first; optionally filtered by type. */
export async function listNotifications(
  userId: string,
  opts: { type?: NotificationType; limit?: number } = {}
): Promise<Notification[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  let query = supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (opts.type) query = query.eq('type', opts.type);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Notification[];
}

/** Count a user's unread notifications (for the nav badge). */
export async function unreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Mark one notification read (only if it belongs to the user). */
export async function markRead(userId: string, id: number): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/** Mark all of a user's notifications read. */
export async function markAllRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw new Error(error.message);
}

/**
 * Emit a 'follow' notification to the followed user. No-op if actor === recipient.
 */
export async function notifyFollow(actorId: string, recipientId: string): Promise<void> {
  if (actorId === recipientId) return;
  const actorName = await resolveActorName(actorId);
  const { error } = await supabase.from('notifications').insert({
    user_id: recipientId,
    type: 'follow',
    actor_id: actorId,
    actor_name: actorName,
  });
  if (error) throw new Error(error.message);
}

/**
 * Emit 'comment' notifications: notify everyone who previously commented on this
 * meme (except the new commenter) that there's fresh activity in the thread.
 * Recipients are limited to backend users (the only ones who can read the feed).
 */
export async function notifyComment(actorId: string, memeId: string): Promise<void> {
  // Distinct prior commenters on this meme, excluding the actor.
  const { data: rows, error } = await supabase
    .from('comments')
    .select('user_id')
    .eq('meme_id', memeId)
    .neq('user_id', actorId);
  if (error) throw new Error(error.message);

  const recipientIds = Array.from(
    new Set((rows ?? []).map((r) => r.user_id as string).filter(Boolean))
  ).slice(0, 100);
  if (recipientIds.length === 0) return;

  // Keep only backend users (the notification feed is a backend-account feature).
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id')
    .in('id', recipientIds);
  if (usersErr) throw new Error(usersErr.message);
  const backendRecipients = (users ?? []).map((u) => u.id as string);
  if (backendRecipients.length === 0) return;

  const actorName = await resolveActorName(actorId);
  const inserts = backendRecipients.map((rid) => ({
    user_id: rid,
    type: 'comment' as const,
    actor_id: actorId,
    actor_name: actorName,
    meme_id: memeId,
  }));

  const { error: insErr } = await supabase.from('notifications').insert(inserts);
  if (insErr) throw new Error(insErr.message);
}
