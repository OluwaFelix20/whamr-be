import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

type Source = 'body' | 'params' | 'query';

/**
 * Validate a request segment against a Zod schema.
 * On failure responds 400 with per-field details. On success, the parsed
 * (coerced/stripped) value replaces `req.body` so controllers get clean input.
 *
 * Note: in Express 5 `req.query`/`req.params` are getters, so only `body`
 * is written back.
 */
export const validate =
  (schema: ZodType, source: Source = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed.',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || source,
          message: issue.message,
        })),
      });
      return;
    }

    if (source === 'body') {
      req.body = result.data;
    }
    next();
  };
