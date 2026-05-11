import { SshExecutor } from './ssh.js';
import { getDb } from '../db/index.js';
import { machines } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { decryptCredential } from '../crypto/credentials.js';
export async function createSshExecutor(machineId) {
    const db = getDb();
    const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
    if (!machine) {
        throw new Error(`机器不存在: id=${machineId}`);
    }
    const password = machine.password ? decryptCredential(machine.password) : undefined;
    const privateKey = machine.privateKey ? decryptCredential(machine.privateKey) : undefined;
    const passphrase = machine.passphrase ? decryptCredential(machine.passphrase) : undefined;
    return new SshExecutor(machineId, {
        host: machine.host,
        port: machine.port,
        username: machine.username,
        password,
        privateKey,
        passphrase,
    });
}
