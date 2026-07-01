/**
 * Profiles service.
 *
 * Framework-free core for public user profiles and the follow graph. Mirrors the
 * other service slices (collections/whatsapp): plain values in/out, no Express,
 * one typed error class the controller maps to HTTP statuses.
 *
 * A profile is keyed by a "handle" — either the user's lowercase `username` or
 * their uuid `id`. Profiles are a backend (email/password) concept; the public
 * view exposes display name, bio, avatar/cover, follower/following counts, and
 * the user's PUBLIC collections (their liked memes stay private to them).
 */
import { supabase } from '../config/supabase';

export type ProfileErrorCode =
  | 'NOT_FOUND' // no user for this handle
  | 'CONFLICT' // username already taken
  | 'SELF' // can't follow yourself
  | 'DB'; // unexpected database failure

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;
  readonly details?: unknown;
  constructor(code: ProfileErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ProfileError';
    this.code = code;
    this.details = details;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_COLUMNS = 'id, username, display_name, bio, avatar_url, cover_url, full_name, created_at';

function dbFail(message: string, error: unknown): never {
  throw new ProfileError('DB', message, error);
}

interface UserRow {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  full_name: string | null;
  created_at: string;
}

export interface PublicCollection {
  id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  item_count: number;
  cover_meme_ids: string[];
}

export interface Profile extends UserRow {
  followers: number;
  following: number;
  is_following: boolean;
  is_self: boolean;
  collections: PublicCollection[];
}

/** Resolve a handle (uuid or username) to a user row, or null. */
async function resolveUser(handle: string): Promise<UserRow | null> {
  let query = supabase.from('users').select(PROFILE_COLUMNS);
  query = UUID_RE.test(handle)
    ? query.eq('id', handle)
    : query.eq('username', handle.toLowerCase());

  const { data, error } = await query.maybeSingle();
  if (error) dbFail('Could not load profile.', error);
  return (data as UserRow | null) ?? null;
}

async function countFollows(column: 'follower_id' | 'following_id', userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq(column, userId);
  if (error) dbFail('Could not count follows.', error);
  return count ?? 0;
}

/** The target user's PUBLIC collections, each with an item count + cover ids. */
async function publicCollections(userId: string): Promise<PublicCollection[]> {
  const { data: cols, error } = await supabase
    .from('collections')
    .select('id, name, description, is_public, created_at, updated_at')
    .eq('user_id', userId)
    .eq('is_public', true)
    .order('updated_at', { ascending: false });
  if (error) dbFail('Could not load collections.', error);

  const rows = (cols ?? []) as Array<{ id: number; name: string; description: string | null; is_public: boolean }>;
  if (rows.length === 0) return [];

  const ids = rows.map((c) => c.id);
  const { data: items, error: itemsErr } = await supabase
    .from('collection_items')
    .select('collection_id, meme_id, created_at')
    .in('collection_id', ids)
    .order('created_at', { ascending: false });
  if (itemsErr) dbFail('Could not load collection items.', itemsErr);

  const agg = new Map<number, { count: number; covers: string[] }>();
  for (const it of (items ?? []) as Array<{ collection_id: number; meme_id: string }>) {
    const e = agg.get(it.collection_id) ?? { count: 0, covers: [] };
    e.count += 1;
    if (e.covers.length < 4) e.covers.push(it.meme_id);
    agg.set(it.collection_id, e);
  }

  return rows.map((c) => {
    const a = agg.get(c.id) ?? { count: 0, covers: [] };
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      is_public: c.is_public,
      item_count: a.count,
      cover_meme_ids: a.covers,
    };
  });
}

/**
 * Public profile for a handle. `requesterId` is the authenticated viewer's id or
 * null. Throws NOT_FOUND if no user matches.
 */
export async function getProfile(handle: string, requesterId: string | null): Promise<Profile> {
  const user = await resolveUser(handle);
  if (!user) throw new ProfileError('NOT_FOUND', 'Profile not found.');

  const [followers, following, collections] = await Promise.all([
    countFollows('following_id', user.id),
    countFollows('follower_id', user.id),
    publicCollections(user.id),
  ]);

  let is_following = false;
  const is_self = requesterId !== null && requesterId === user.id;
  if (requesterId && !is_self) {
    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', requesterId)
      .eq('following_id', user.id)
      .maybeSingle();
    if (error) dbFail('Could not check follow state.', error);
    is_following = !!data;
  }

  return { ...user, followers, following, is_following, is_self, collections };
}

/** Update the authenticated user's own profile. Only provided fields change. */
export async function updateMyProfile(
  userId: string,
  patch: {
    username?: string | null;
    display_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    cover_url?: string | null;
    interests?: string[] | null;
  }
): Promise<UserRow> {
  const update: Record<string, unknown> = {};
  if (patch.username !== undefined) update.username = patch.username;
  if (patch.display_name !== undefined) update.display_name = patch.display_name;
  if (patch.bio !== undefined) update.bio = patch.bio;
  if (patch.avatar_url !== undefined) update.avatar_url = patch.avatar_url;
  if (patch.cover_url !== undefined) update.cover_url = patch.cover_url;
  if (patch.interests !== undefined) update.interests = patch.interests;

  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    // unique_violation on the username index.
    if ((error as { code?: string }).code === '23505') {
      throw new ProfileError('CONFLICT', 'That username is already taken.');
    }
    dbFail('Could not update profile.', error);
  }
  return data as UserRow;
}

/**
 * Follow a user (idempotent). Throws SELF if you try to follow yourself.
 * Returns the target's id and whether this created a NEW follow edge (so the
 * caller only emits a notification on a genuinely new follow, not a repeat).
 */
export async function followUser(
  followerId: string,
  handle: string
): Promise<{ created: boolean; targetId: string }> {
  const target = await resolveUser(handle);
  if (!target) throw new ProfileError('NOT_FOUND', 'Profile not found.');
  if (target.id === followerId) throw new ProfileError('SELF', 'You cannot follow yourself.');

  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: target.id });

  if (error) {
    // Already following -> idempotent success, but not a new edge.
    if ((error as { code?: string }).code === '23505') {
      return { created: false, targetId: target.id };
    }
    dbFail('Could not follow user.', error);
  }
  return { created: true, targetId: target.id };
}

export interface SuggestedProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers: number;
}

/**
 * Suggest people to follow (used by onboarding): users with a username set,
 * ranked by follower count, excluding the requester and anyone they already
 * follow. Tallies follow edges in code — fine at the current scale; revisit
 * with an aggregate/materialised count if the follows table grows large.
 */
export async function suggestedProfiles(requesterId: string, limit = 8): Promise<SuggestedProfile[]> {
  const { data: followingRows, error: fErr } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', requesterId);
  if (fErr) dbFail('Could not load suggestions.', fErr);
  const exclude = new Set<string>((followingRows ?? []).map((r) => r.following_id as string));
  exclude.add(requesterId);

  const { data: allFollows, error: afErr } = await supabase.from('follows').select('following_id');
  if (afErr) dbFail('Could not load suggestions.', afErr);
  const counts = new Map<string, number>();
  for (const r of (allFollows ?? []) as Array<{ following_id: string }>) {
    counts.set(r.following_id, (counts.get(r.following_id) ?? 0) + 1);
  }

  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, bio')
    .not('username', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (uErr) dbFail('Could not load suggestions.', uErr);

  return (users ?? [])
    .filter((u) => !exclude.has(u.id as string))
    .map((u) => ({
      id: u.id as string,
      username: (u.username as string) ?? null,
      display_name: (u.display_name as string) ?? null,
      avatar_url: (u.avatar_url as string) ?? null,
      bio: (u.bio as string) ?? null,
      followers: counts.get(u.id as string) ?? 0,
    }))
    .sort((a, b) => b.followers - a.followers)
    .slice(0, limit);
}

/** Mark the user's onboarding complete (stamps onboarded_at). */
export async function markOnboarded(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) dbFail('Could not complete onboarding.', error);
}

/** Unfollow a user (idempotent). */
export async function unfollowUser(followerId: string, handle: string): Promise<void> {
  const target = await resolveUser(handle);
  if (!target) throw new ProfileError('NOT_FOUND', 'Profile not found.');

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', target.id);
  if (error) dbFail('Could not unfollow user.', error);
}
