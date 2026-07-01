import { Request, Response } from 'express';
import {
  ProfileError,
  getProfile,
  updateMyProfile,
  followUser,
  unfollowUser,
  suggestedProfiles,
  markOnboarded,
} from '../services/profilesService';
import { notifyFollow } from '../services/notificationsService';

/**
 * Thin HTTP layer over profilesService. Maps the service's typed errors to HTTP
 * statuses; all domain logic lives in the service.
 */
function handleError(err: unknown, res: Response): void {
  if (err instanceof ProfileError) {
    const status =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'CONFLICT'
          ? 409
          : err.code === 'SELF'
            ? 400
            : 500; // DB
    res.status(status).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: (err as Error).message });
}

/** GET /api/profiles/:handle — public profile (optional auth fills is_self/is_following). */
export const getOneProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const handle = String(req.params.handle);
    const requesterId = req.user?.sub ?? null;
    const profile = await getProfile(handle, requesterId);
    res.status(200).json({ profile });
  } catch (err) {
    handleError(err, res);
  }
};

/** PATCH /api/profiles/me — update own profile. */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const patch = req.body as {
      username?: string | null;
      display_name?: string | null;
      bio?: string | null;
      avatar_url?: string | null;
      cover_url?: string | null;
      interests?: string[] | null;
    };
    const profile = await updateMyProfile(req.user!.sub, patch);
    res.status(200).json({ profile });
  } catch (err) {
    handleError(err, res);
  }
};

/** GET /api/profiles/suggested — people to follow (onboarding). */
export const getSuggested = async (req: Request, res: Response): Promise<void> => {
  try {
    const suggestions = await suggestedProfiles(req.user!.sub);
    res.status(200).json({ suggestions });
  } catch (err) {
    handleError(err, res);
  }
};

/** POST /api/profiles/me/onboarded — mark onboarding complete. */
export const completeOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    await markOnboarded(req.user!.sub);
    res.status(200).json({ ok: true });
  } catch (err) {
    handleError(err, res);
  }
};

/** POST /api/profiles/:handle/follow */
export const follow = async (req: Request, res: Response): Promise<void> => {
  try {
    const { created, targetId } = await followUser(req.user!.sub, String(req.params.handle));
    // Notify the followed user, but only on a genuinely new follow. Best-effort:
    // a notification failure must not fail the follow itself.
    if (created) {
      try {
        await notifyFollow(req.user!.sub, targetId);
      } catch (notifyErr) {
        console.error('follow notification failed:', notifyErr);
      }
    }
    res.status(200).json({ ok: true, following: true });
  } catch (err) {
    handleError(err, res);
  }
};

/** DELETE /api/profiles/:handle/follow */
export const unfollow = async (req: Request, res: Response): Promise<void> => {
  try {
    await unfollowUser(req.user!.sub, String(req.params.handle));
    res.status(200).json({ ok: true, following: false });
  } catch (err) {
    handleError(err, res);
  }
};
