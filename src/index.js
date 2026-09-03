require('dotenv').config();
console.log('Iniciando backend...');

const multer = require('multer');
const express = require('express');
const cors = require('cors');

const { ensureSchemaPatches } = require('./db');
const storage = () => require('./storage');
const { requireAppSignature } = require('./middlewares/appSignature');

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const videosRoutes = require('./routes/videos.routes');
const photosRoutes = require('./routes/photos.routes');
const adminRoutes = require('./routes/admin.routes');

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
app.use('/api/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande' });
  }
  res.status(400).json({ error: err.message || 'Erro interno' });
});

async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌸 Jardim Encantado da Olivia — http://0.0.0.0:${PORT}`);
  });

  try {
    await ensureSchemaPatches();
    await storage().ensureBucket();
  } catch (err) {
    console.warn(`⚠️  Inicialização parcial: ${err.message}`);
  }
}

start().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
