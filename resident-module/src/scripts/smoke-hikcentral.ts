/**
 * Teste de fumaça contra o HikCentral (somente leitura). Imprime só contagens,
 * nunca CPF, telefone ou e-mail de moradores.
 *   HIK_HOST=... HIK_APP_KEY=... HIK_APP_SECRET=... HIK_USER_ID=... npm run smoke:hik
 */
import { hikPost } from '../hikcentral/client';
import { residentStats } from '../hikcentral/residents';

async function main() {
    const version = await hikPost('/artemis/api/common/v1/version', {});
    console.log('Versão:', JSON.stringify(version.data));
    console.log('Moradores:', await residentStats());
    const levels = await hikPost('/artemis/api/acs/v1/privilege/group', { pageNo: 1, pageSize: 100, type: 2 });
    console.log('Níveis de visitante:', (levels.data?.list ?? []).map((l: any) => `${l.privilegeGroupId}:${l.privilegeGroupName}`));
}

main().catch((err) => {
    console.error('Falhou:', err.message);
    process.exit(1);
});
