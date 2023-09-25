import { createClient } from "redis";

export async function connect(): Promise<ReturnType<typeof createClient>> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    const client = createClient({ url });
    await client.connect();
    return client;
}
