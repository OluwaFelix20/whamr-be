/**
 * Collections service.
 *
 * Framework-free core for user "collections" (named, optionally-public lists of
 * memes — like playlists). Mirrors whatsappService/stickerService: it takes and
 * returns plain values, knows nothing about Express, and throws a single typed
 * error class the controller maps to HTTP statuses. Reusable from a script, a
 * queue worker, or the HTTP controller.
 *
 * Ownership model: every collection is owned by the uuid that created it
 * (req.user.sub). Mutations require ownership; reads are allowed for the owner
 * always, and for anyone when the collection is public. A private collection is
 * indistinguishable from a missing one to a non-owner (NOT_FOUND), so existence
 * never leaks.
 */
import { supabase } from '../config/supabase';

export type CollectionsErrorCode =
  | 'NOT_FOUND' // collection doesn't exist, or is private and the requester isn't the owner
  | 'FORBIDDEN' // requester is authenticated but not the owner of a mutation target
  | 'CONFLICT' // the meme is already in the collection
  | 'DB'; // unexpected database failure

/** A typed failure the controller maps to an HTTP status. */
export class CollectionsError extends Error {
  readonly code: CollectionsErrorCode;
  readonly details?: unknown;

  constructor(code: CollectionsErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'CollectionsError';
    this.code = code;
    this.details = details;
  }
}

export interface Collection {
  id: number;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollectionSummary extends Collection {
  /** Number of memes in the collection. */
  item_count: number;
  /** Up to 4 meme ids for a thumbnail mosaic, newest first. */
  cover_meme_ids: string[];
}

export interface CollectionItem {
  meme_id: string;
  created_at: string;
}

export interface CollectionDetail extends Collection {
  items: CollectionItem[];
  /** True when the requester owns this collection (drives edit controls in UI). */
  is_owner: boolean;
}

const COLLECTION_COLUMNS = 'id, user_id, name, description, is_public, created_at, updated_at';

/** Wrap a Supabase error in a typed DB failure. */
function dbFail(message: string, error: unknown): never {
  throw new CollectionsError('DB', message, error);
}

/**
 * List a user's own collections, each with an item count and up to 4 cover
 * meme ids for a thumbnail mosaic. Newest collections first.
 */
export async function listCollections(userId: string): Promise<CollectionSummary[]> {
  const { data: collections, error } = await supabase
    .from('collections')
    .select(COLLECTION_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) dbFail('Could not load collections.', error);

  const rows = (collections ?? []) as Collection[];
  if (rows.length === 0) return [];

  // One query for all items across the user's collections, grouped in code —
  // avoids an N+1 of one count query per collection.
  const ids = rows.map((c) => c.id);
  const { data: items, error: itemsErr } = await supabase
    .from('collection_items')
    .select('collection_id, meme_id, created_at')
    .in('collection_id', ids)
    .order('created_at', { ascending: false });

  if (itemsErr) dbFail('Could not load collection items.', itemsErr);

  const byCollection = new Map<number, { count: number; covers: string[] }>();
  for (const it of (items ?? []) as Array<{ collection_id: number; meme_id: string }>) {
    const entry = byCollection.get(it.collection_id) ?? { count: 0, covers: [] };
    entry.count += 1;
    if (entry.covers.length < 4) entry.covers.push(it.meme_id);
    byCollection.set(it.collection_id, entry);
  }

  return rows.map((c) => {
    const agg = byCollection.get(c.id) ?? { count: 0, covers: [] };
    return { ...c, item_count: agg.count, cover_meme_ids: agg.covers };
  });
}

/** Create a new collection owned by the user. */
export async function createCollection(
  userId: string,
  input: { name: string; description?: string | null; is_public?: boolean }
): Promise<Collection> {
  const { data, error } = await supabase
    .from('collections')
    .insert({
      user_id: userId,
      name: input.name,
      description: input.description ?? null,
      is_public: input.is_public ?? false,
    })
    .select(COLLECTION_COLUMNS)
    .single();

  if (error) dbFail('Could not create collection.', error);
  return data as Collection;
}

/** Fetch a single collection row, or throw NOT_FOUND. */
async function requireCollection(collectionId: number): Promise<Collection> {
  const { data, error } = await supabase
    .from('collections')
    .select(COLLECTION_COLUMNS)
    .eq('id', collectionId)
    .maybeSingle();

  if (error) dbFail('Could not load collection.', error);
  if (!data) throw new CollectionsError('NOT_FOUND', 'Collection not found.');
  return data as Collection;
}

/** Load a collection's owner row, asserting the requester owns it (else FORBIDDEN). */
async function requireOwned(collectionId: number, userId: string): Promise<Collection> {
  const collection = await requireCollection(collectionId);
  if (collection.user_id !== userId) {
    throw new CollectionsError('FORBIDDEN', 'You do not own this collection.');
  }
  return collection;
}

/**
 * Get a collection with its items. `requesterId` is the authenticated user's id
 * or null for an anonymous request. A private collection is reported as
 * NOT_FOUND to anyone but its owner, so existence never leaks.
 */
export async function getCollection(
  collectionId: number,
  requesterId: string | null
): Promise<CollectionDetail> {
  const collection = await requireCollection(collectionId);

  const isOwner = requesterId !== null && collection.user_id === requesterId;
  if (!collection.is_public && !isOwner) {
    throw new CollectionsError('NOT_FOUND', 'Collection not found.');
  }

  const { data: items, error } = await supabase
    .from('collection_items')
    .select('meme_id, created_at')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false });

  if (error) dbFail('Could not load collection items.', error);

  return { ...collection, items: (items ?? []) as CollectionItem[], is_owner: isOwner };
}

/** Update a collection the user owns. Only provided fields change. */
export async function updateCollection(
  userId: string,
  collectionId: number,
  patch: { name?: string; description?: string | null; is_public?: boolean }
): Promise<Collection> {
  await requireOwned(collectionId, userId);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.is_public !== undefined) update.is_public = patch.is_public;

  const { data, error } = await supabase
    .from('collections')
    .update(update)
    .eq('id', collectionId)
    .select(COLLECTION_COLUMNS)
    .single();

  if (error) dbFail('Could not update collection.', error);
  return data as Collection;
}

/** Delete a collection the user owns. Items cascade via the FK. */
export async function deleteCollection(userId: string, collectionId: number): Promise<void> {
  await requireOwned(collectionId, userId);

  const { error } = await supabase.from('collections').delete().eq('id', collectionId);
  if (error) dbFail('Could not delete collection.', error);
}

/**
 * Add a meme to a collection the user owns. Throws CONFLICT if the meme is
 * already in the collection (the unique constraint backs this up).
 */
export async function addItem(
  userId: string,
  collectionId: number,
  memeId: string
): Promise<void> {
  const collection = await requireOwned(collectionId, userId);

  const { error } = await supabase
    .from('collection_items')
    .insert({ collection_id: collection.id, meme_id: memeId });

  if (error) {
    // Postgres unique_violation — the meme is already in the collection.
    if ((error as { code?: string }).code === '23505') {
      throw new CollectionsError('CONFLICT', 'That meme is already in this collection.');
    }
    dbFail('Could not add meme to collection.', error);
  }

  // Touch the parent so it sorts to the top of the user's list.
  await supabase
    .from('collections')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', collection.id);
}

/** Remove a meme from a collection the user owns. Idempotent. */
export async function removeItem(
  userId: string,
  collectionId: number,
  memeId: string
): Promise<void> {
  const collection = await requireOwned(collectionId, userId);

  const { error } = await supabase
    .from('collection_items')
    .delete()
    .eq('collection_id', collection.id)
    .eq('meme_id', memeId);

  if (error) dbFail('Could not remove meme from collection.', error);

  await supabase
    .from('collections')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', collection.id);
}
