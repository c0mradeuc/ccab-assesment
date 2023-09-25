import { buildApp } from "./app";
import { connect } from "./redis";

connect().then((result) => {
    const app = buildApp(result);
    const port = parseInt(process.env.EXPRESS_PORT ?? "3000");

    app.listen(port, () => console.log(`Backend listening on port ${port}`));
});
