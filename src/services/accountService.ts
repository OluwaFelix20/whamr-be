/**
 * Account service.
 *
 * Framework-free helper for irreversible account operations — currently the
 * full account deletion cascade. All of a user's rows live in tables keyed on a
 * plain uuid (no cross-table FKs to users), so deletion is an explicit fan-out.
 * collection_items are removed automatically via their FK to collections.
 */
import { supabase } from '../config/supabase';

/**
 * Permanently delete a user and everything they own:
 * favourites, collections (+ items via cascade), comments, follow edges (in both
 * directions), notifications (as recipient AND as actor), auth tokens, then the
 * user row itself.
 *
 * Child cleanups are best-effort (logged, not fatal) so a single failed table
 * can't strand the account half-deleted; the final users delete must succeed.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const attempts: Array<{ label: string; run: () => PromiseLike<{ error: unknown }> }> = [
    { label: 'favorites', run: () => supabase.from('favorites').delete().eq('user_id', userId) },
    { label: 'collections', run: () => supabase.from('collections').delete().eq('user_id', userId) },
    { label: 'comments', run: () => supabase.from('comments').delete().eq('user_id', userId) },
    { label: 'follows(follower)', run: () => supabase.from('follows').delete().eq('follower_id', userId) },
    { label: 'follows(following)', run: () => supabase.from('follows').delete().eq('following_id', userId) },
    { label: 'notifications(recipient)', run: () => supabase.from('notifications').delete().eq('user_id', userId) },
    { label: 'notifications(actor)', run: () => supabase.from('notifications').delete().eq('actor_id', userId) },
    { label: 'password_reset_tokens', run: () => supabase.from('password_reset_tokens').delete().eq('user_id', userId) },
    { label: 'refresh_tokens', run: () => supabase.from('refresh_tokens').delete().eq('user_id', userId) },
  ];

  for (const a of attempts) {
    const { error } = await a.run();
    if (error) console.error(`account deletion: failed to clear ${a.label}:`, error);
  }

  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw new Error(error.message);
}
