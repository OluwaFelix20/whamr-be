import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { PublicUser, User } from '../types/user';

const toPublicUser = (user: User): PublicUser => {
  const { password_hash, token_version, ...publicUser } = user;
  return publicUser;
};

/**
 * GET /api/users
 * List all users (without password hashes).
 */
export const getUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ users: (data as User[]).map(toPublicUser) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * GET /api/users/:id
 * Fetch a single user by id.
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.status(200).json({ user: toPublicUser(data as User) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
