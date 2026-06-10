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
