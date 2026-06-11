import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

/**
 * Public comments on memes. Reading is open (anyone can view a meme's thread);
 * posting/deleting/reporting requires a valid JWT. Comments are keyed on the
 * backend user id (req.user.sub). The same table also holds rows written by the
 * frontend's Supabase (Google) client, so a single thread shows both.
 */

// Backend user ids allowed to delete ANY comment (moderation). Configured via
// the ADMIN_USER_IDS env var (comma-separated). Empty by default.
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Display name shown on a comment: the local part of the user's email.
const authorNameFromEmail = (email: string | undefined): string => {
  if (email && email.includes('@')) return email.split('@')[0];
  return 'Someone';
};

/**
 * GET /api/comments?meme_id=...
 * Public. List a meme's comments, newest first.
 */
export const getComments = async (req: Request, res: Response): Promise<void> => {
  try {
    const memeId = String(req.query.meme_id);

    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('meme_id', memeId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ comments: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * POST /api/comments  { meme_id, text }
 * Auth required. Post a comment as the current user.
 */
export const createComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;
    const authorName = authorNameFromEmail(req.user!.email);
    const { meme_id, text } = req.body as { meme_id: string; text: string };

    const { data, error } = await supabase
      .from('comments')
      .insert({ meme_id, user_id: userId, author_name: authorName, text })
      .select('*')
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ comment: data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * DELETE /api/comments/:id
 * Auth required. Allowed if the caller owns the comment or is an admin.
 */
export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;
    const { id } = req.params;

    const { data: comment, error: selErr } = await supabase
      .from('comments')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();

    if (selErr) {
      res.status(500).json({ error: selErr.message });
      return;
    }
    if (!comment) {
      res.status(404).json({ error: 'Comment not found.' });
      return;
    }

    const isowner = comment.user_id === userId;
    const isAdmin = ADMIN_USER_IDS.includes(userId);
    if (!isowner && !isAdmin) {
      res.status(403).json({ error: 'You can only delete your own comments.' });
      return;
    }

    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * POST /api/comments/:id/report
 * Auth required. Flag a comment for moderation.
 */
export const reportComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('comments')
      .update({ reported: true })
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
