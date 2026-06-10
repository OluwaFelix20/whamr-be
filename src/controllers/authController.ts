import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { supabase } from '../config/supabase';
import { PublicUser, User } from '../types/user';
import { signToken } from '../utils/jwt';

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

/** Strip the password hash before sending a user back to the client. */
const toPublicUser = (user: User): PublicUser => {
  const { password_hash, ...publicUser } = user;
  return publicUser;
};

/**
 * POST /api/auth/register
 * Create a new user with a bcrypt-hashed password.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    // Reject duplicate emails up front for a clearer error.
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data, error } = await supabase
      .from('users')
      .insert({ email, password_hash, full_name: full_name ?? null })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const user = data as User;
    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({ user: toPublicUser(user), token });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * POST /api/auth/login
 * Verify credentials against the bcrypt hash stored in Supabase.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, (user as User).password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const authedUser = user as User;
    const token = signToken({ sub: authedUser.id, email: authedUser.email });
    res.status(200).json({ user: toPublicUser(authedUser), token });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
