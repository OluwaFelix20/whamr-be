import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email({ message: 'A valid email is required.' }),
  password: z
    .string({ message: 'Password is required.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.'), // bcrypt truncates beyond 72 bytes
  full_name: z
    .string()
    .trim()
    .min(1, 'full_name cannot be empty.')
    .max(120, 'full_name must be at most 120 characters.')
    .optional(),
});

export const loginSchema = z.object({
  email: z.email({ message: 'A valid email is required.' }),
  password: z.string({ message: 'Password is required.' }).min(1, 'Password is required.'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string({ message: 'refreshToken is required.' }).min(1, 'refreshToken is required.'),
});

export const forgotPasswordSchema = z.object({
  email: z.email({ message: 'A valid email is required.' }),
});

export const resetPasswordSchema = z.object({
  token: z.string({ message: 'token is required.' }).min(1, 'token is required.'),
  newPassword: z
    .string({ message: 'newPassword is required.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ message: 'currentPassword is required.' })
    .min(1, 'Your current password is required.'),
  newPassword: z
    .string({ message: 'newPassword is required.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.'),
});

export const deleteAccountSchema = z.object({
  password: z.string({ message: 'password is required.' }).min(1, 'Your password is required.'),
});
