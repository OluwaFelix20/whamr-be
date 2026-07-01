import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import favoritesRoutes from './routes/favoritesRoutes';
import collectionsRoutes from './routes/collectionsRoutes';
import profilesRoutes from './routes/profilesRoutes';
import notificationsRoutes from './routes/notificationsRoutes';
import commentsRoutes from './routes/commentsRoutes';
import stickerRoutes from './routes/stickerRoutes';
import whatsappRoutes from './routes/whatsappRoutes';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT ?? 4000;

// CORS — allow the configured frontend origin(s) to call the API from a browser.
// If CORS_ALLOWED_ORIGINS is unset, reflect any origin (convenient for dev).
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root — friendly landing instead of a bare 404.
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'whamr-be',
    status: 'ok',
    health: '/health',
    api: '/api/auth, /api/users, /api/favorites, /api/collections, /api/profiles, /api/notifications, /api/comments, /api/stickers, /api/whatsapp',
  });
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/stickers', stickerRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// 404 fallback
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
