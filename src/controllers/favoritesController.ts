import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

/**
 * Favorites are keyed on the authenticated backend user's id (req.user.sub).
 * The frontend keeps localStorage as its instant layer and uses these endpoints
 * only to sync favourites across devices for logged-in email/password users.
 */

/**
 * GET /api/favorites
 * Return the current user's favourited meme ids.
 */
export const getFavorites = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;

    const { data, error } = await supabase
      .from('favorites')
      .select('meme_id')
      .eq('user_id', userId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // De-dup in code: the table has no unique constraint (legacy duplicate rows).
    const memeIds = Array.from(new Set((data ?? []).map((r) => r.meme_id as string)));
    res.status(200).json({ meme_ids: memeIds });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * POST /api/favorites  { meme_id }
 * Add a favourite. Idempotent: a no-op (200) if it already exists.
 */
export const addFavorite = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;
    const { meme_id } = req.body as { meme_id: string };

    const { data: existing, error: selErr } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('meme_id', meme_id)
      .limit(1);

    if (selErr) {
      res.status(500).json({ error: selErr.message });
      return;
    }
    if (existing && existing.length > 0) {
      res.status(200).json({ ok: true, already: true });
      return;
    }

    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: userId, meme_id });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * DELETE /api/favorites/:memeId
 * Remove a favourite for the current user.
 */
export const removeFavorite = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;
    const { memeId } = req.params;

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('meme_id', memeId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
