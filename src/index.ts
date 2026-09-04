import 'dotenv/config';
console.log('Iniciando backend...');

import express from 'express';
import cors from 'cors';
import multer from 'multer';

import { ensureSchemaPatches } from './db';
import { ensureBucket } from './storage';
import { requireAppSignature } from './middlewares/appSignature';

import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import videosRoutes from './routes/videos.routes';
import photosRoutes from './routes/photos.routes';
import notificationsRoutes from './routes/notifications.routes';
import adminRoutes from './routes/admin.routes';
import appRoutes from './routes/app.routes';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(requireAppSignature);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Jardim Encantado da Olivia 🌸' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/photos', photosRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/app', appRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Arquivo muito grande' });
    return;
  }
  res.status(400).json({ error: err.message || 'Erro interno' });
});

async function start(): Promise<void> {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🌸 Jardim Encantado da Olivia — http://0.0.0.0:${PORT}`);
  });
  try {
    await ensureSchemaPatches();
    await ensureBucket();
  } catch (err: any) {
    console.warn(`⚠️  Inicialização parcial: ${err.message}`);
  }
}

start().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
