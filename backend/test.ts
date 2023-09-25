import { performance } from "perf_hooks";
import supertest from "supertest";
import { buildApp } from "./app";
import { connect } from "./redis";

let app: supertest.SuperTest<supertest.Test>;

async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start = performance.now();
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    await app.post("/charge").expect(200);
    console.log(`Latency: ${performance.now() - start} ms`);
}

async function superLatencyTest() {
    await app.post("/reset").expect(204);
    let testCases = 10;
    const latencies = [];

    while (testCases) {
        const start = performance.now();
        await app.post("/charge").expect(200);
        latencies.push(performance.now() - start);
        // console.log(`Latency: ${performance.now() - start} ms`);

        testCases--;
    }

    console.log(`Average Latency: ${calculateAverage(latencies)} ms`);
    console.log(`50th Percentile: ${calculatePercentile(latencies, 50)} ms`);
    console.log(`90th Percentile: ${calculatePercentile(latencies, 90)} ms`);
    console.log(`99th Percentile: ${calculatePercentile(latencies, 99)} ms`);
}

/**
 * Execute multiple charge request at the same time to exemplify the issue with handling concurrent requests.
 */
async function replicateError() {
    await app.post("/reset").expect(204);
    console.log('Executing test to replicate issue with concurrent requests');

    const body = { charges: 100 };
    const results = await Promise.all([
        app.post("/charge").send(body),
        app.post("/charge").send(body),
        app.post("/charge").send(body)
    ]);
    const result = await app.post("/charge").send(body);

    console.log(`Request [1] | Expected Authorization: true | Received Authorization: ${results[0].body.isAuthorized} | OK: ${results[0].body.isAuthorized === true}`);
    console.log(`Request [2] | Expected Authorization: false | Received Authorization: ${results[1].body.isAuthorized} | OK: ${results[1].body.isAuthorized === false}`);
    console.log(`Request [3] | Expected Authorization: false | Received Authorization: ${results[2].body.isAuthorized} | OK: ${results[2].body.isAuthorized === false}`);
    console.log(`Request [4] | Expected Authorization: false | Received Authorization: ${result.body.isAuthorized} | OK: ${result.body.isAuthorized === false}`);
}

function calculateAverage(numbers: number[]): number {
    // Check if the array is empty to avoid division by zero
    if (numbers.length === 0) {
        return 0;
    }

    // Calculate the average by summing all numbers and dividing by the count
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
}

function calculatePercentile(numbers: number[], percentile: number): number {
    if (numbers.length === 0) {
        return 0;
    }

    // Sort the array in ascending order
    const sortedArray = numbers.slice().sort((a, b) => a - b);

    // Calculate the index for the desired percentile
    const index = (percentile / 100) * (sortedArray.length - 1);

    // Check if the index is an integer
    if (Number.isInteger(index)) {
        // If the index is an integer, return the corresponding value
        return sortedArray[index];
    } else {
        // If the index is not an integer, interpolate between the two nearest values
        const lowerIndex = Math.floor(index);
        const upperIndex = Math.ceil(index);
        const lowerValue = sortedArray[lowerIndex];
        const upperValue = sortedArray[upperIndex];

        // Linear interpolation
        const interpolation = lowerValue + (index - lowerIndex) * (upperValue - lowerValue);

        return interpolation;
    }
}

async function runTests() {
    await basicLatencyTest();
    await replicateError();
    await superLatencyTest();
}

connect().then((redisClient) => {
    app = supertest(buildApp(redisClient));
    runTests().then(() => setTimeout(() => redisClient.disconnect(), 100)).catch(console.error);
});
