import path from 'path';
import express from 'express';
import helmet from 'helmet';
import { assertConfig, config } from './config';
import authRoutes from './routes/auth.routes';
import invitesRoutes from './routes/invites.routes';
import publicRoutes from './routes/public.routes';
import { HttpError } from './invites/errors';
import { prisma } from './db';
import { runMigrations } from './migrate';
import { purgeStaleSavedVisitors } from './invites/saved';

assertConfig();

const app = express();
app.set('trust proxy', 1);
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                'img-src': ["'self'", 'data:', 'blob:'],
                // Só força HTTPS quando o módulo é publicado em HTTPS; em teste por http na rede local isso quebraria a página.
                'upgrade-insecure-requests': config.publicUrl.startsWith('https://') ? [] : null,
            },
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

const purge = () =>
    purgeStaleSavedVisitors()
        .then((n) => n && console.log(`[resident-module] ${n} visitante(s) salvo(s) apagado(s) por inatividade`))
        .catch((err) => console.error('[resident-module] limpeza de visitantes salvos:', err.message));
runMigrations(prisma)
    .then((applied) => {
        if (applied.length) console.log(`[resident-module] migrações aplicadas: ${applied.join(', ')}`);
        purge();
        setInterval(purge, 24 * 60 * 60 * 1000).unref();
        app.listen(config.port, config.host, () => {
            console.log(`[resident-module] ouvindo em ${config.host}:${config.port} (HikCentral: ${config.hik.host})`);
        });
    })
    .catch((err) => {
        console.error('[resident-module] falha ao preparar o banco:', err.message);
        process.exit(1);
    });
