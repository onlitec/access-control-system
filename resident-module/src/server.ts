import path from 'path';
import express from 'express';
import helmet from 'helmet';
import { assertConfig, config } from './config';
import authRoutes from './routes/auth.routes';
import invitesRoutes from './routes/invites.routes';
import publicRoutes from './routes/public.routes';
import { HttpError } from './invites/service';

assertConfig();

const app = express();
app.set('trust proxy', 1);
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: { 'img-src': ["'self'", 'data:', 'blob:'] },
        },
    }),
);

// O cadastro do visitante leva duas fotos em Base64, por isso tem limite de corpo maior.
app.use('/api/public', express.json({ limit: '3mb' }), publicRoutes);
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api', invitesRoutes);
const publicDir = path.resolve(__dirname, '..', 'public');
app.get('/v/:token', (_req, res) => res.set('Referrer-Policy', 'no-referrer').sendFile(path.join(publicDir, 'visitor.html')));
app.use(express.static(publicDir));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
    }
    if (err?.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Requisição inválida.' });
        return;
    }
    if (err?.type === 'entity.too.large') {
        res.status(413).json({ error: 'Arquivo grande demais.' });
        return;
    }
    console.error('[resident-module] erro:', err?.message || err);
    res.status(500).json({ error: 'Erro interno.' });
});

app.listen(config.port, () => {
    console.log(`[resident-module] ouvindo na porta ${config.port} (HikCentral: ${config.hik.host})`);
});
