import path from 'path';
import express from 'express';
import helmet from 'helmet';
import { assertConfig, config } from './config';
import authRoutes from './routes/auth.routes';

assertConfig();

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use(express.static(path.resolve(__dirname, '..', 'public')));

app.listen(config.port, () => {
    console.log(`[resident-module] ouvindo na porta ${config.port} (HikCentral: ${config.hik.host})`);
});
