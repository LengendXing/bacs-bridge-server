import { LocalExecutor } from './local.js';
const executorCache = new Map();
export function getLocalExecutor() {
    let ex = executorCache.get(null);
    if (!ex) {
        ex = new LocalExecutor();
        executorCache.set(null, ex);
    }
    return ex;
}
export async function getExecutor(machineId) {
    if (machineId === null || machineId === undefined) {
        return getLocalExecutor();
    }
    let ex = executorCache.get(machineId);
    if (ex)
        return ex;
    // SshExecutor will be lazy-loaded to avoid importing ssh2 unless needed
    const { createSshExecutor } = await import('./ssh-factory.js');
    const sshExecutor = await createSshExecutor(machineId);
    executorCache.set(machineId, sshExecutor);
    return sshExecutor;
}
export async function invalidateExecutor(machineId) {
    const ex = executorCache.get(machineId);
    if (ex && ex.dispose) {
        await ex.dispose();
    }
    executorCache.delete(machineId);
}
export function getCachedRemoteExecutors() {
    return [...executorCache.values()].filter(ex => ex.kind === 'ssh');
}
