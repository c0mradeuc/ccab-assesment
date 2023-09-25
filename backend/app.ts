import express from "express";
import { createClient } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

async function reset(account: string): Promise<void> {
    await client.set(`${account}/balance`, DEFAULT_BALANCE);
}

let requestCount = 0;

async function charge(account: string, charges: number): Promise<ChargeResult> {
    try {
        // 1. Initial solution
        // const balance = parseInt((await client.get(`${account}/balance`)) ?? "");
        // if (balance >= charges) {
        //     await client.set(`${account}/balance`, balance - charges);
        //     const remainingBalance = parseInt((await client.get(`${account}/balance`)) ?? "");
        //     return { isAuthorized: true, remainingBalance, charges };
        // } else {
        //     return { isAuthorized: false, remainingBalance: balance, charges: 0 };
        // }

        // 2. Optimistic Locking using watch and multi
        // const balanceKey = `${account}/balance`;
        // const trx = client.multi();

        // await client.watch(balanceKey);

        // const balance = parseInt((await client.get(balanceKey)) ?? "");
        // const newBalance = balance - charges;

        // if (newBalance >= 0) {
        //     trx.set(balanceKey, newBalance);

        //     // Execute the transaction
        //     const result = await trx.exec();

        //     console.log('result', result);

        //     return { isAuthorized: true, remainingBalance: newBalance, charges };
        // } else {
        //     return { isAuthorized: false, remainingBalance: balance, charges: 0 };
        // }

        // 3. Pessimistic Locking
        const balanceKey = `${account}/balance`;
        const lockKey = `resource_lock_${balanceKey}`;

        // Acquire the lock
        const lockAcquired = await client.set(lockKey, new Date().toISOString(), { 'NX': true, 'EX': 1 });

        if (lockAcquired) {
            console.log(`Lock acquired successfully.`);

            const balance = parseInt((await client.get(balanceKey)) ?? "");
            const newBalance = balance - charges;
            let result: ChargeResult;

            if (newBalance >= 0) {
                await client.set(`${account}/balance`, newBalance);

                result = { isAuthorized: true, remainingBalance: newBalance, charges };
            } else {
                result = { isAuthorized: false, remainingBalance: balance, charges: 0 };
            }

            await client.del(lockKey);

            return result;
        } else {
            console.log('locked');
            await sleep(10);

            return await charge(account, charges);
        }

        // 4. Use decrBy and validate negative remainingBalance 
        // const balanceKey = `${account}/balance`;
        // await client.decrBy(balanceKey, charges);
        // const remainingBalance = parseInt((await client.get(balanceKey)) ?? "");

        // if (remainingBalance < 0) {
        //     await client.incrBy(balanceKey, charges);
        //     const currentBalance = parseInt((await client.get(balanceKey)) ?? "");
        //     return { isAuthorized: false, remainingBalance: currentBalance, charges: 0 };
        // } else {
        //     return { isAuthorized: true, remainingBalance, charges };
        // }
    } catch (error) {
        console.log(error);
        return { isAuthorized: false, remainingBalance: 0, charges: 0 };
    }
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let client: ReturnType<typeof createClient>;

export function buildApp(redisClient: ReturnType<typeof createClient>): express.Application {
    const app = express();
    app.use(json());
    client = redisClient;
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`[${new Date().toISOString()}] Successfully reset account: ${account} to ${DEFAULT_BALANCE}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        requestCount++;
        console.log(`[${new Date().toISOString()}] Request [${requestCount}] | Charge: ${req.body.charges ?? 10} | Account: ${req.body.account ?? "account"}`);

        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`[${new Date().toISOString()}] Successfully charged account: ${account} | Remaining Balance: ${result.remainingBalance} | Authorized: ${result.isAuthorized}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}

process.on('beforeExit', () => {
    if (client.isOpen)
        client.disconnect();
});
